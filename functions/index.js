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
        
        let cleanPhone = phoneNum.replace(/\D/g, '');
        let base = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
        let pWith9 = base;
        let pWithout9 = base;

        if (base.length === 11) {
            pWithout9 = base.substring(0, 2) + base.substring(3);
        } else if (base.length === 10) {
            pWith9 = base.substring(0, 2) + '9' + base.substring(2);
        }

        const variations = [...new Set([
            base, '55' + base,
            pWith9, '55' + pWith9,
            pWithout9, '55' + pWithout9
        ])];

        const snapshot = await leadsRef.where('phone', 'in', variations).limit(1).get();

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

const cors = require('cors')({ origin: true });

exports.triggerDailyFunnels = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            // Apenas para POST
            if (req.method !== 'POST') {
                return res.status(405).send('Method Not Allowed');
            }

            // 1. Obter configurações do CRM (Settings -> automações)
            const settingsDoc = await db.collection("settings").doc("msg_templates").get();
            const apiSettingsDoc = await db.collection("settings").doc("whatsapp_api").get();

            if (!settingsDoc.exists || !apiSettingsDoc.exists) {
                return res.status(400).json({ error: "Configurações de templates ou API não encontradas no Firestore." });
            }

            const templates = settingsDoc.data();
            const apiConfig = apiSettingsDoc.data();

            if (!apiConfig.active || !apiConfig.url) {
                return res.status(400).json({ error: "API WhatsApp não está ativa ou configurada." });
            }

            // 2. Determinar as datas-alvo (Hoje menos 30, 45 e 120 dias)
            // Fixando timezone para o Brasil, garantindo que o dia não mude antecipadamente pelo horário UTC.
            const nowBrtStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
            const today = new Date(nowBrtStr);
            
            const formatDate = (dateObj) => {
                const yyyy = dateObj.getFullYear();
                const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                const dd = String(dateObj.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            };

            const d30 = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
            const d45 = new Date(today.getTime() - (45 * 24 * 60 * 60 * 1000));
            const d120 = new Date(today.getTime() - (120 * 24 * 60 * 60 * 1000));

            const targetDates = [
                { days: 30, dateStr: formatDate(d30), tplName: 'restock', text: templates.restock, img: templates.restockImg },
                { days: 45, dateStr: formatDate(d45), tplName: 'dormant', text: templates.dormant, img: templates.dormantImg },
                { days: 120, dateStr: formatDate(d120), tplName: 'lost', text: templates.lost, img: templates.lostImg }
            ];

            let sentCount = 0;
            let logDetails = [];

            // 3. Varredura por Data
            for (const target of targetDates) {
                if (!target.text || target.text.trim() === '') continue; // Não envia se não há texto configurado

                // Puxar as vendas daquela data exata
                const salesSnap = await db.collection("sales").where("date", "==", target.dateStr).get();
                
                // Mapear telefones para evitar duplicidade na mesma data
                const salesByPhone = new Map();
                salesSnap.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.phone) {
                        salesByPhone.set(data.phone, { id: doc.id, ...data });
                    }
                });

                // 4. Lógica Reversa: Validar a ÚLTIMA compra real desse cliente
                for (const [phone, saleData] of salesByPhone.entries()) {
                    
                    // Buscar a venda MAIS RECENTE desse mesmo telefone (em memória para evitar exigência de Composite Index)
                    const recentSaleSnap = await db.collection("sales")
                        .where("phone", "==", phone)
                        .get();
                    
                    if (!recentSaleSnap.empty) {
                        const allUserSales = recentSaleSnap.docs.map(d => d.data());
                        // Ordena por data mais recente primeiro
                        allUserSales.sort((a, b) => b.date.localeCompare(a.date));
                        const mostRecentSale = allUserSales[0];
                        
                        // Se a data mais recente FOR MAIOR que a data-alvo, significa que ele comprou DEPOIS. ABORTA.
                        if (mostRecentSale.date > target.dateStr) {
                            console.log(`Disparo ${target.days}d abortado para ${phone}: cliente comprou recentemente em ${mostRecentSale.date}`);
                            continue;
                        }
                    }

                    // 5. Se sobreviveu à validação, dispara!
                    let finalUrl = apiConfig.url.trim();
                    let headers = { "Content-Type": "application/json" };
                    let body = {};
                    let isEvolution = true;

                    // A API WA geralmente exige o prefixo 55 (Brasil)
                    const formattedPhone = phone.startsWith("55") ? phone : "55" + phone;

                    // Ajustar Payload da API
                    if (finalUrl.includes('z-api')) {
                        isEvolution = false;
                        if(apiConfig.token) headers['Client-Token'] = apiConfig.token;
                        if(target.img && target.img.trim() !== '') {
                            finalUrl = finalUrl.replace('/send-text', '/send-image');
                            body = { phone: formattedPhone, image: target.img, caption: target.text.replace(/\{nome\}/g, saleData.name).replace(/\{produto\}/g, saleData.product) };
                        } else {
                            body = { phone: formattedPhone, message: target.text.replace(/\{nome\}/g, saleData.name).replace(/\{produto\}/g, saleData.product) };
                        }
                    } else { // Evolution
                        if(apiConfig.token) headers['apikey'] = apiConfig.token;
                        if(target.img && target.img.trim() !== '') {
                            finalUrl = finalUrl.endsWith('/messages/sendMedia') ? finalUrl : finalUrl.replace('/messages/sendText', '/messages/sendMedia');
                            body = {
                                number: formattedPhone,
                                mediatype: "image",
                                media: target.img,
                                caption: target.text.replace(/\{nome\}/g, saleData.name).replace(/\{produto\}/g, saleData.product),
                                delay: 2000
                            };
                        } else {
                            finalUrl = finalUrl.endsWith('/messages/sendText') ? finalUrl : finalUrl.replace('/messages/sendMedia', '/messages/sendText');
                            body = {
                                number: formattedPhone,
                                textMessage: { text: target.text.replace(/\{nome\}/g, saleData.name).replace(/\{produto\}/g, saleData.product) },
                                delay: 2000
                            };
                        }
                    }

                    try {
                        const response = await fetch(finalUrl, { method: 'POST', headers, body: JSON.stringify(body) });
                        if (response.ok) {
                            sentCount++;
                            logDetails.push({ phone, date: target.dateStr, type: target.days });
                        }
                    } catch(err) {
                        console.error('Falha no fetch para API do WA:', err);
                    }
                }
            }

            // Registrar Log
            if (sentCount > 0) {
                await db.collection("funnel_logs").add({
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    sentCount: sentCount,
                    details: logDetails
                });
            }

            return res.status(200).json({ success: true, sent: sentCount });

        } catch (error) {
            console.error("Erro no processamento do gatilho diário:", error);
            return res.status(500).json({ error: error.message });
        }
    });
});

const { onSchedule } = require("firebase-functions/v2/scheduler");

// A versão que acorda sozinha todo dia às 09h00 da manhã
exports.scheduledDailyFunnels = onSchedule({
    schedule: "0 9 * * *",
    timeZone: "America/Sao_Paulo"
}, async (event) => {
    try {
        // Aproveitamos a mesma lógica da função HTTPS. Para não duplicar código gigante, 
        // poderíamos extrair a lógica, mas para simplificar vamos chamar a própria URL local.
        const projectID = process.env.GCLOUD_PROJECT || "valentinacosmeticos-5f239";
        const functionUrl = `https://us-central1-${projectID}.cloudfunctions.net/triggerDailyFunnels`;
        
        console.log("Iniciando varredura diária agendada via PubSub...");
        const response = await fetch(functionUrl, { method: 'POST' });
        const result = await response.json();
        console.log("Resultado da varredura diária:", result);
    } catch(e) {
        console.error("Erro no Cron Job PubSub:", e);
    }
});
