const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// Ponto de entrada do Webhook para Z-API ou Evolution API
exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
    // Retorna 200 rápido pro WhatsApp não achar que deu erro
    res.status(200).send("Recebido");

    const payload = req.body;

    // Filtros de Proteção
    // Ignorar status de mensagem, focar apenas em MENSAGENS RECEBIDAS (NÃO da própria empresa)
    if (!payload) return;

    let isFromMe = false;
    let phoneNum = "";
    let senderName = "Desconhecido";
    let textBody = "";

    let audioUrl = "";
    let imageUrl = "";

    // 1. Tentar ler no formato Z-API
    if (payload.phone) {
        isFromMe = payload.fromMe === true || payload.fromMe === "true" || (payload.fromMe === undefined && payload.status !== undefined);
        phoneNum = payload.phone; // ex: 5511999999999
        senderName = payload.senderName || payload.chatName || "Desconhecido";
        textBody = (payload.text && payload.text.message) ? payload.text.message : "";
        if (payload.audio && payload.audio.audioUrl) audioUrl = payload.audio.audioUrl;
        else if (payload.audioUrl) audioUrl = payload.audioUrl;
        
        if (payload.image && payload.image.imageUrl) imageUrl = payload.image.imageUrl;
        else if (payload.imageUrl) imageUrl = payload.imageUrl;
    }
    // 2. Tentar ler no formato Evolution API (message.upsert)
    else if (payload.data && payload.data.message) {
        const msgData = payload.data.message;
        isFromMe = msgData.key && msgData.key.fromMe === true;
        phoneNum = msgData.key && msgData.key.remoteJid ? msgData.key.remoteJid.replace('@s.whatsapp.net', '') : "";
        senderName = payload.data.pushName || "Desconhecido";

        // Tentar pegar o texto (pode vir de conversation ou extendedTextMessage)
        if (msgData.message) {
            textBody = msgData.message.conversation || (msgData.message.extendedTextMessage && msgData.message.extendedTextMessage.text) || "";
            if (msgData.message.audioMessage) audioUrl = msgData.message.audioMessage.url || "evolution-audio";
            if (msgData.message.imageMessage) imageUrl = msgData.message.imageMessage.url || "evolution-image";
        }
    }

    // Ignorar Grupos, Status e LIDs
    if (phoneNum.includes('-group') || phoneNum.includes('@g.us') || phoneNum.includes('@broadcast') || phoneNum.includes('@lid')) {
        console.log("Mensagem ignorada (grupo/status/lid)", { phoneNum });
        return res.status(200).send("Ignored group/status/lid");
    }

    if (!textBody) {
        if (audioUrl) textBody = "🎵 *Mensagem de Áudio*";
        else if (imageUrl) textBody = "📸 *Imagem/Arquivo*";
    }

    // Se não houver texto E não houver media, aborta.
    if (!phoneNum || textBody.trim() === "") {
        console.log("Mensagem ignorada (sem texto ou media)", { phoneNum });
        return res.status(200).send("Ignored");
    }

    // --- LÓGICA DO FUNIL ---
    try {
        const leadsRef = db.collection('leads');
        const snapshot = await leadsRef.where('phone', '==', phoneNum).limit(1).get();

        if (isFromMe) {
            // MENSAGEM ENVIADA PELO AGENTE (VOCÊ)
            if (!snapshot.empty) {
                const leadId = snapshot.docs[0].id;
                // --- DEDUPLICAÇÃO ---
                const recentMsgs = await leadsRef.doc(leadId).collection('messages')
                    .orderBy('timestamp', 'desc').limit(1).get();

                let isDuplicate = false;
                if (!recentMsgs.empty) {
                    const lastMsg = recentMsgs.docs[0].data();
                    if (lastMsg.sender === 'agent' && lastMsg.text === textBody) {
                        const now = Date.now();
                        const msgTime = lastMsg.timestamp ? lastMsg.timestamp.toDate().getTime() : 0;
                        if (now - msgTime < 15000) { // 15 segundos
                            isDuplicate = true;
                            console.log("Mensagem ignorada (já inserida pelo CRM).");
                        }
                    }
                }

                if (!isDuplicate) {
                    const msgObj = {
                        text: textBody,
                        sender: 'agent',
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    };
                    if(audioUrl) msgObj.audioUrl = audioUrl;
                    if(imageUrl) msgObj.imageUrl = imageUrl;
                    
                    await leadsRef.doc(leadId).collection('messages').add(msgObj);
                    await leadsRef.doc(leadId).update({
                        lastMessage: "Você: " + textBody.substring(0, 45) + "..."
                    });
                }
            } else {
                // Criar o lead se você iniciou a conversa
                const newLead = await leadsRef.add({
                    name: phoneNum,
                    phone: phoneNum,
                    status: 'negotiation',
                    value: 0,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastMessage: "Você: " + textBody.substring(0, 45) + "..."
                });
                
                const msgObj = {
                    text: textBody,
                    sender: 'agent',
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                };
                if(audioUrl) msgObj.audioUrl = audioUrl;
                if(imageUrl) msgObj.imageUrl = imageUrl;
                
                await leadsRef.doc(newLead.id).collection('messages').add(msgObj);
            }
            return res.status(200).send("Agent message saved.");
        }

        // MENSAGEM RECEBIDA DO CLIENTE
        let leadId;

        if (snapshot.empty) {
            // CRIAR NOVO CARD
            const newLead = await leadsRef.add({
                name: senderName,
                phone: phoneNum,
                status: 'inbox',
                value: 0,
                unread: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastMessage: textBody.substring(0, 50) + "..."
            });
            leadId = newLead.id;
        } else {
            // ATUALIZAR CARD EXISTENTE
            const doc = snapshot.docs[0];
            leadId = doc.id;

            await leadsRef.doc(leadId).update({
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastMessage: textBody.substring(0, 50) + "...",
                unread: true
            });
        }

        // SALVAR A MENSAGEM NO HISTÓRICO SECRETO DO CHAT
        const msgObj = {
            text: textBody,
            sender: 'client',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };
        if(audioUrl) msgObj.audioUrl = audioUrl;
        if(imageUrl) msgObj.imageUrl = imageUrl;

        await leadsRef.doc(leadId).collection('messages').add(msgObj);

    } catch (error) {
        console.error("Erro ao processar webhook no Firestore:", error);
    }
});
