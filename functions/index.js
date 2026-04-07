const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// Ponto de entrada do Webhook para Z-API ou Evolution API
exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
    // Retorna 200 rápido pro WhatsApp não achar que deu erro
    res.status(200).send("Recebido");

    const payload = req.body;
    
    // Identificação Multi-Tenant (Lojas) pela URL do Webhook
    // Ex: https://.../whatsappWebhook?storeId=filial_1
    const storeId = req.query.storeId || 'loja_1';

    // Filtros de Proteção
    // Ignorar status de mensagem, focar apenas em MENSAGENS RECEBIDAS (NÃO da própria empresa)
    if (!payload) return;

    let isFromMe = false;
    let phoneNum = "";
    let senderName = "Desconhecido";
    let textBody = "";

    let audioUrl = "";
    let imageUrl = "";

    let isGroup = false;
    let groupName = "Grupo WhatsApp";

    // 1. Tentar ler no formato Z-API
    if (payload.phone) {
        isFromMe = payload.fromMe === true || payload.fromMe === "true" || (payload.fromMe === undefined && payload.status !== undefined);
        phoneNum = payload.groupId || payload.phone; // Se houver groupId explícito, usa ele.
        
        // Verifica se é grupo
        isGroup = payload.isGroup === true || payload.isGroup === "true" || phoneNum.includes('-group') || phoneNum.includes('@g.us');
        
        if (isGroup) {
            groupName = payload.chatName || "Grupo WhatsApp";
            senderName = payload.senderName || "Membro";
        } else {
            if (isFromMe) {
                senderName = payload.chatName || "Desconhecido";
            } else {
                senderName = payload.senderName || payload.chatName || "Desconhecido";
            }
        }

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

        isGroup = phoneNum.includes('@g.us') || (msgData.key.participant !== undefined);
        if (isGroup) {
            groupName = "Grupo WhatsApp";
            senderName = payload.data.pushName || "Membro";
        }

        // Tentar pegar o texto (pode vir de conversation ou extendedTextMessage)
        if (msgData.message) {
            textBody = msgData.message.conversation || (msgData.message.extendedTextMessage && msgData.message.extendedTextMessage.text) || "";
            if (msgData.message.audioMessage) audioUrl = msgData.message.audioMessage.url || "evolution-audio";
            if (msgData.message.imageMessage) imageUrl = msgData.message.imageMessage.url || "evolution-image";
        }
    }

    // Ignorar Status e LIDs
    if (phoneNum.includes('@broadcast') || phoneNum.includes('@lid')) {
        console.log("Mensagem ignorada (status/lid)", { phoneNum });
        return res.status(200).send("Ignored status/lid");
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

    // Formatar texto para grupos
    if (isGroup && !isFromMe) {
        textBody = `*${senderName}:* ${textBody}`;
    }

    // --- LÓGICA DO FUNIL ---
    try {
        const leadsRef = db.collection('leads');
        
        let variations = [];
        let cleanPhone = "";
        
        if (isGroup) {
            // Normalizar ID do grupo para o formato padrão do CRM (Z-API style)
            let standardGroupPhone = phoneNum;
            if (!standardGroupPhone.includes('-group') && !standardGroupPhone.includes('@g.us')) {
                standardGroupPhone = standardGroupPhone + '-group';
            } else if (standardGroupPhone.includes('@g.us')) {
                standardGroupPhone = standardGroupPhone.replace('@g.us', '-group');
            }
            phoneNum = standardGroupPhone; // Atualiza para salvar formatado
            variations = [phoneNum]; // O ID do grupo é único
        } else {
            cleanPhone = phoneNum.replace(/\D/g, '');
            let base = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
            let pWith9 = base;
            let pWithout9 = base;

            if (base.length === 11) {
                pWithout9 = base.substring(0, 2) + base.substring(3);
            } else if (base.length === 10) {
                pWith9 = base.substring(0, 2) + '9' + base.substring(2);
            }

            variations = [...new Set([
                base, '55' + base,
                pWith9, '55' + pWith9,
                pWithout9, '55' + pWithout9
            ])];
        }

        const snapshot = await leadsRef.where('phone', 'in', variations).limit(1).get();
        // ID Determinístico para evitar Race Condition quando múltiplas mensagens chegam no mesmo milissegundo
        const deterministicId = isGroup ? phoneNum : (variations.length > 1 ? variations[1] : phoneNum);

        if (isFromMe) {
            // MENSAGEM ENVIADA PELO AGENTE (VOCÊ)
            if (!snapshot.empty) {
                const leadId = snapshot.docs[0].id;
                // --- DEDUPLICAÇÃO ---
                const recentMsgs = await leadsRef.doc(leadId).collection('messages')
                    .orderBy('timestamp', 'desc').limit(5).get();

                let isDuplicate = false;
                if (!recentMsgs.empty) {
                    const now = Date.now();
                    for (let msgDoc of recentMsgs.docs) {
                        const msg = msgDoc.data();
                        // Remover espaços em branco no final para comparação segura
                        if (msg.sender === 'agent' && msg.text.trim() === textBody.trim()) {
                            const msgTime = msg.timestamp ? msg.timestamp.toDate().getTime() : 0;
                            if (now - msgTime < 30000) { // 30 segundos
                                isDuplicate = true;
                                console.log("Mensagem ignorada (já inserida pelo CRM).");
                                break;
                            }
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
                const newLeadRef = leadsRef.doc(deterministicId);
                const contactName = (senderName && senderName !== 'Desconhecido') ? senderName : cleanPhone;
                const initName = isGroup ? groupName : contactName;
                
                await newLeadRef.set({
                    name: initName,
                    phone: isGroup ? phoneNum : cleanPhone,
                    status: 'negotiation',
                    value: 0,
                    storeId: storeId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastMessage: "Você: " + textBody.substring(0, 45) + "..."
                }, { merge: true });
                
                const msgObj = {
                    text: textBody,
                    sender: 'agent',
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                };
                if(audioUrl) msgObj.audioUrl = audioUrl;
                if(imageUrl) msgObj.imageUrl = imageUrl;
                
                await newLeadRef.collection('messages').add(msgObj);
            }
            return res.status(200).send("Agent message saved.");
        }

        // MENSAGEM RECEBIDA DO CLIENTE
        let leadId;

        if (snapshot.empty) {
            // CUIDADO CONTRA RACE CONDITION - Set with merge usando deterministic ID
            leadId = deterministicId;
            const initName = isGroup ? groupName : senderName;
            await leadsRef.doc(leadId).set({
                name: initName !== 'Desconhecido' ? initName : (isGroup ? groupName : cleanPhone),
                phone: isGroup ? phoneNum : cleanPhone,
                status: 'inbox',
                value: 0,
                unread: true,
                storeId: storeId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastMessage: textBody.substring(0, 50) + "..."
            }, { merge: true });
        } else {
            // ATUALIZAR CARD EXISTENTE
            const doc = snapshot.docs[0];
            leadId = doc.id;
            const leadData = doc.data();
            const updatePayload = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastMessage: textBody.substring(0, 50) + "...",
                unread: true,
                storeId: storeId // Atualiza a pátria do Lead para a loja que está respondendo
            };

            // Se o card ainda está com nome "fantasma" (número) e temos o nome real agora, atualize!
            const currentName = leadData.name || '';
            const onlyDigitsRegex = /^\d+$/;
            if (onlyDigitsRegex.test(currentName) || currentName === 'Desconhecido' || currentName === leadData.phone) {
                if (senderName && senderName !== 'Desconhecido') {
                    updatePayload.name = senderName;
                }
            }
            
            // Consertar contatos que estavam com números zoados
            if (!isGroup && leadData.phone !== cleanPhone) {
                updatePayload.phone = cleanPhone;
            }

            // Automação 4.1: Retornar à Caixa de Entrada se o negócio já estava 'Ganho' (Pós-Venda ativo)
            if (leadData.status === 'won') {
                updatePayload.status = 'inbox';
            }

            await leadsRef.doc(leadId).update(updatePayload);
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
            const nowBrtStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
            const today = new Date(nowBrtStr);
            
            const formatDate = (dateObj) => {
                const yyyy = dateObj.getFullYear();
                const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                const dd = String(dateObj.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            };

            const d15 = new Date(today.getTime() - (15 * 24 * 60 * 60 * 1000));
            const d30 = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
            const d45 = new Date(today.getTime() - (45 * 24 * 60 * 60 * 1000));
            const d120 = new Date(today.getTime() - (120 * 24 * 60 * 60 * 1000));

            const targetDates = [
                { days: 15, dateStr: formatDate(d15), tplName: 'd15', text: templates.d15, img: templates.d15Img },
                { days: 30, dateStr: formatDate(d30), tplName: 'restock', text: templates.restock, img: templates.restockImg },
                { days: 45, dateStr: formatDate(d45), tplName: 'dormant', text: templates.dormant, img: templates.dormantImg },
                { days: 120, dateStr: formatDate(d120), tplName: 'lost', text: templates.lost, img: templates.lostImg }
            ];

            let sentCount = 0;
            let logDetails = [];

            // 3. Varredura por Data
            for (const target of targetDates) {
                if (!target.text || target.text.trim() === '') continue;

                const salesSnap = await db.collection("sales").where("date", "==", target.dateStr).get();
                
                const salesByPhone = new Map();
                salesSnap.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.phone) {
                        salesByPhone.set(data.phone, { id: doc.id, ...data });
                    }
                });

                // 4. Lógica Reversa
                for (const [phone, saleData] of salesByPhone.entries()) {
                    
                    const recentSaleSnap = await db.collection("sales")
                        .where("phone", "==", phone)
                        .get();
                    
                    if (!recentSaleSnap.empty) {
                        const allUserSales = recentSaleSnap.docs.map(d => d.data());
                        allUserSales.sort((a, b) => b.date.localeCompare(a.date));
                        const mostRecentSale = allUserSales[0];
                        
                        if (mostRecentSale.date > target.dateStr) {
                            console.log(`Disparo ${target.days}d abortado para ${phone}: comprou em ${mostRecentSale.date}`);
                            db.collection("sales").doc(saleData.id).update({
                                [`msg_${target.tplName}_status`]: 'aborted'
                            }).catch(e => console.error(e));
                            continue;
                        }
                    }

                    // 5. Dispara
                    let finalUrl = apiConfig.url.trim();
                    let headers = { "Content-Type": "application/json" };
                    let body = {};

                    const formattedPhone = phone.startsWith("55") ? phone : "55" + phone;

                    if (finalUrl.includes('z-api')) {
                        if(apiConfig.token) headers['Client-Token'] = apiConfig.token;
                        if(target.img && target.img.trim() !== '') {
                            finalUrl = finalUrl.replace('/send-text', '/send-image');
                            body = { phone: formattedPhone, image: target.img, caption: target.text.replace(/\{nome\}/g, saleData.name).replace(/\{produto\}/g, saleData.product) };
                        } else {
                            body = { phone: formattedPhone, message: target.text.replace(/\{nome\}/g, saleData.name).replace(/\{produto\}/g, saleData.product) };
                        }
                    } else if (apiConfig.provider === 'meumotor' || finalUrl.includes('187.127.4.145')) {
                        if(apiConfig.token) {
                            headers['Client-Token'] = apiConfig.token;
                            headers['apikey'] = apiConfig.token;
                        }
                        if(target.img && target.img.trim() !== '') {
                            finalUrl = finalUrl.replace('/send-text', '').replace(/\/$/, '') + '/send-image';
                            body = { phone: formattedPhone, image: target.img, caption: target.text.replace(/\{nome\}/g, saleData.name).replace(/\{produto\}/g, saleData.product), message: target.text.replace(/\{nome\}/g, saleData.name).replace(/\{produto\}/g, saleData.product) };
                        } else {
                            body = { phone: formattedPhone, message: target.text.replace(/\{nome\}/g, saleData.name).replace(/\{produto\}/g, saleData.product) };
                            if (!finalUrl.endsWith('/send-text')) {
                                finalUrl = finalUrl.replace(/\/$/, '') + '/send-text';
                            }
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
                            await db.collection("sales").doc(saleData.id).update({
                                [`msg_${target.tplName}_status`]: 'sent'
                            });
                        }
                    } catch(err) {
                        console.error('Falha no fetch para API do WA:', err);
                    }
                }
            }

            // --- 6. VARREDURA DE ANIVERSÁRIOS ---
            if (templates.birthday && templates.birthday.trim() !== '') {
                const todayDayMonth = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0');
                const clientsSnap = await db.collection("clients").get();
                
                for (const doc of clientsSnap.docs) {
                    const clientData = doc.data();
                    if (clientData.birthdate && clientData.birthdate === todayDayMonth) {
                        const phone = clientData.phone;
                        if (!phone) continue;
                        
                        let finalUrl = apiConfig.url.trim();
                        let headers = { "Content-Type": "application/json" };
                        let body = {};
                        
                        const formattedPhone = phone.startsWith("55") ? phone : "55" + phone;
                        const msgText = templates.birthday.replace(/\{nome\}/g, clientData.name || '');
                        
                        if (finalUrl.includes('z-api')) {
                            if(apiConfig.token) headers['Client-Token'] = apiConfig.token;
                            if(templates.birthdayImg && templates.birthdayImg.trim() !== '') {
                                finalUrl = finalUrl.replace('/send-text', '/send-image');
                                body = { phone: formattedPhone, image: templates.birthdayImg, caption: msgText };
                            } else {
                                body = { phone: formattedPhone, message: msgText };
                            }
                        } else if (apiConfig.provider === 'meumotor' || finalUrl.includes('187.127.4.145')) {
                            if(apiConfig.token) {
                                headers['Client-Token'] = apiConfig.token;
                                headers['apikey'] = apiConfig.token;
                            }
                            if(templates.birthdayImg && templates.birthdayImg.trim() !== '') {
                                finalUrl = finalUrl.replace('/send-text', '').replace(/\/$/, '') + '/send-image';
                                body = { phone: formattedPhone, image: templates.birthdayImg, caption: msgText, message: msgText };
                            } else {
                                body = { phone: formattedPhone, message: msgText };
                                if (!finalUrl.endsWith('/send-text')) {
                                    finalUrl = finalUrl.replace(/\/$/, '') + '/send-text';
                                }
                            }
                        } else {
                            if(apiConfig.token) headers['apikey'] = apiConfig.token;
                            if(templates.birthdayImg && templates.birthdayImg.trim() !== '') {
                                finalUrl = finalUrl.endsWith('/messages/sendMedia') ? finalUrl : finalUrl.replace('/messages/sendText', '/messages/sendMedia');
                                body = {
                                    number: formattedPhone,
                                    mediatype: "image",
                                    media: templates.birthdayImg,
                                    caption: msgText,
                                    delay: 2000
                                };
                            } else {
                                finalUrl = finalUrl.endsWith('/messages/sendText') ? finalUrl : finalUrl.replace('/messages/sendMedia', '/messages/sendText');
                                body = {
                                    number: formattedPhone,
                                    textMessage: { text: msgText },
                                    delay: 2000
                                };
                            }
                        }
                        
                        try {
                            const response = await fetch(finalUrl, { method: 'POST', headers, body: JSON.stringify(body) });
                            if (response.ok) {
                                sentCount++;
                                logDetails.push({ phone, date: todayDayMonth, type: 'birthday' });
                                
                                // Salvar log de auditoria
                                await db.collection('audit_logs').add({
                                    resource: 'client',
                                    action: 'birthday_message',
                                    resourceId: doc.id,
                                    details: `Mensagem automática de Feliz Aniversário enviada com sucesso para ${clientData.name || 'Cliente Sem Nome'} (${phone}).`,
                                    userName: 'Sistema Automático',
                                    userEmail: 'system',
                                    userRole: 'system',
                                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                                });
                            }
                        } catch(err) {
                            console.error('Falha no fetch para API do WA (Aniversário):', err);
                        }
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

// --- SAAS MULTI-TENANT: ADMIN CONTROLS ---
const { onCall } = require("firebase-functions/v2/https");

exports.createUser = onCall({ invoker: "public" }, async (request) => {
    const authInfo = request.auth;
    const payload = request.data;

    // Segurança: Verificar se quem está chamando está logado e é admin
    if (!authInfo) {
        throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado no sistema.');
    }
    
    const callerDoc = await db.collection('users').doc(authInfo.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas administradores podem registrar novos membros na equipe.');
    }

    const { email, password, name, role, storeId } = payload;
    
    if (!email || !password || !name || !role || !storeId) {
        throw new functions.https.HttpsError('invalid-argument', 'Faltam parâmetros obrigatórios para a criação do usuário.');
    }

    try {
        // 1. Criar o usuário no Firebase Authentication System
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name
        });

        // Add custom claims to avoid Permission Denied in Firestore Rules
        await admin.auth().setCustomUserClaims(userRecord.uid, { role: role, storeId: storeId });

        // 2. Registrar a "Identidade" e restrições na Coleção de Users
        await db.collection('users').doc(userRecord.uid).set({
            email: email,
            name: name,
            role: role,
            storeId: storeId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, uid: userRecord.uid, message: 'Usuário cadastrado com sucesso.' };
        
    } catch (error) {
        console.error("Erro ao tentar criar novo usuário Firebase:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.updateUser = onCall({ invoker: "public" }, async (request) => {
    const authInfo = request.auth;
    const payload = request.data;
    if (!authInfo) throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado no sistema.');
    
    const callerDoc = await db.collection('users').doc(authInfo.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas administradores podem gerenciar a equipe.');
    }

    const { uid, email, password, name, role, storeId } = payload;
    if (!uid) throw new functions.https.HttpsError('invalid-argument', 'UID não informado.');

    try {
        const updateData = {};
        if (email) updateData.email = email;
        if (password && password.trim() !== '') updateData.password = password;
        if (name) updateData.displayName = name;
        
        if (Object.keys(updateData).length > 0) {
            await admin.auth().updateUser(uid, updateData);
        }

        if (role || storeId) {
            // Update custom claims too
            const userRec = await admin.auth().getUser(uid);
            const currentClaims = userRec.customClaims || {};
            await admin.auth().setCustomUserClaims(uid, {
                role: role || currentClaims.role,
                storeId: storeId || currentClaims.storeId
            });
        }

        const dbData = {};
        if (email) dbData.email = email;
        if (name) dbData.name = name;
        if (role) dbData.role = role;
        if (storeId) dbData.storeId = storeId;

        if (Object.keys(dbData).length > 0) {
            await db.collection('users').doc(uid).update(dbData);
        }
        return { success: true };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

exports.debugLeads = functions.https.onRequest(async (req, res) => {
    try {
        const snap = await db.collection("leads").limit(10).get();
        const leads = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(leads);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

exports.deleteUser = onCall({ invoker: "public" }, async (request) => {
    const authInfo = request.auth;
    const { uid } = request.data;
    
    if (!authInfo) throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado.');
    const callerDoc = await db.collection('users').doc(authInfo.uid).get();
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Apenas administradores podem excluir da equipe.');
    }
    if (!uid) throw new functions.https.HttpsError('invalid-argument', 'UID não informado.');

    try {
        await admin.auth().deleteUser(uid);
        await db.collection('users').doc(uid).delete();
        return { success: true };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});
