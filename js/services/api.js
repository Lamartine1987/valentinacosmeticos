import { db } from '../config/firebase.js';

export const apiModule = {
    async sendWhatsAppMessage(phone, message, imageUrl = '', mediaType = 'image', targetStoreId = 'loja_1') {
        const settings = this.apiSettings;
        if (!settings) return false;
        
        let provider = settings.provider;
        let apiUrl = settings.url;
        let apiToken = settings.token;

        if (settings.instances && Array.isArray(settings.instances) && settings.instances.length > 0) {
             let inst = settings.instances.find(i => i.storeId === targetStoreId);
             if (!inst || !inst.active) {
                 inst = settings.instances.find(i => i.storeId === 'loja_1'); // fallback
             }
             if (inst && inst.active) {
                 provider = inst.provider;
                 apiUrl = inst.url;
                 apiToken = inst.token;
             } else {
                 if (!settings.active) {
                     console.log("Nenhuma instância ativa disponível para", targetStoreId, "e a API master global está desabilitada.");
                     return false;
                 }
             }
        } else if (!settings.active) {
            console.log("API master global desabilitada.");
            return false;
        }

        if(!apiUrl) return false;

        try {
            console.log("=== INICIANDO ENVIO DE WHATSAPP ===");
            console.log("Provedor configurado:", provider, "Loja Alvo:", targetStoreId);
            
            const isGroup = phone.includes('-') || phone.includes('@g.us');
            let destPhone = phone;
            if (!isGroup) {
                const cleanPhone = phone.replace(/\D/g, '');
                destPhone = (cleanPhone.startsWith('55') && cleanPhone.length > 11) ? cleanPhone : "55" + cleanPhone;
            }

            let body = {};
            let finalUrl = apiUrl;
            let finalMediaPayload = "";
            let finalMessage = message;

            if (imageUrl && imageUrl.trim() !== '') {
                finalMediaPayload = imageUrl.trim();
            }
            
            if(provider === 'evolution') {
                if (finalMediaPayload !== '') {
                    finalUrl = finalUrl.replace('/sendText', '/sendMedia');
                    body = { 
                        number: destPhone, 
                        mediaMessage: { 
                            mediatype: mediaType === 'video' ? "video" : "image", 
                            caption: message, 
                            media: finalMediaPayload 
                        } 
                    };
                } else {
                    body = { number: destPhone, textMessage: { text: message } };
                }
            } else if (provider === 'zapi' || provider === 'meumotor') {
                if (finalMediaPayload !== '') {
                    const endpoint = mediaType === 'video' ? '/send-video' : '/send-image';
                    const key = mediaType === 'video' ? 'video' : 'image';
                    finalUrl = finalUrl.replace('/send-text', '').replace(/\/$/, '') + endpoint;
                    body = { phone: destPhone, [key]: finalMediaPayload, caption: message, message: message }; 
                } else {
                    body = { phone: destPhone, message: message };
                    if (!finalUrl.endsWith('/send-text')) {
                        finalUrl = finalUrl.replace(/\/$/, '') + '/send-text';
                    }
                }
            } else {
                body = { phone: destPhone, message: finalMessage }; 
            }
            
            const headers = { 'Content-Type': 'application/json' };
            if (apiToken) {
                const t = apiToken;
                headers['Authorization'] = t.toLowerCase().startsWith('bearer') ? t : `Bearer ${t}`;
                headers['apikey'] = t; 
                if(provider === 'zapi' || provider === 'meumotor') headers['Client-Token'] = t;
            }
            
            console.log("URL Final disparada:", finalUrl);
            console.log("Headers formatados:", headers);
            console.log("Corpo da requisição (Body):", JSON.stringify(body));

            let reqUrl = finalUrl;
            let reqBody = JSON.stringify(body);
            let reqHeaders = headers;

            // Bloqueio Mixed Content (HTTPS -> HTTP)
            if (window.location.protocol === 'https:' && finalUrl.startsWith('http://')) {
                console.log("⚠️ Redirecionando via Proxy para evitar bloqueio Mixed Content do Navegador.");
                reqUrl = 'https://us-central1-valentinacosmeticos-5f239.cloudfunctions.net/apiProxy';
                reqHeaders = { 'Content-Type': 'application/json' };
                reqBody = JSON.stringify({
                    targetUrl: finalUrl,
                    targetHeaders: headers,
                    targetBody: body
                });
            }

            const response = await fetch(reqUrl, {
                method: 'POST',
                headers: reqHeaders,
                body: reqBody
            });
            
            if(!response.ok) {
                const errBody = await response.text();
                console.error("❌ ERRO NA API WA. Status:", response.status);
                console.error("❌ Resposta do servidor Z-API/Evolution:", errBody);
                return false;
            }
            
            const data = await response.json();
            console.log("✅ SUCESSO! A API retornou:", data);
            return true;
        } catch(e) {
            console.error("❌ Falha crítica ao conectar com a API:", e);
            return false;
        }
    },

    async fetchDeviceContacts(targetStoreId = 'loja_1') {
        const settings = this.apiSettings;
        if (!settings) return [];
        
        let provider = settings.provider;
        let apiUrl = settings.url;
        let apiToken = settings.token;

        if (settings.instances && Array.isArray(settings.instances) && settings.instances.length > 0) {
             let inst = settings.instances.find(i => i.storeId === targetStoreId);
             if (!inst || !inst.active) inst = settings.instances.find(i => i.storeId === 'loja_1');
             if (inst && inst.active) {
                 provider = inst.provider;
                 apiUrl = inst.url;
                 apiToken = inst.token;
             }
        }
        if(!apiUrl) return [];

        try {
            let finalUrl = apiUrl;
            
            // Adjust the base URL for fetching contacts based on the provider
            if (provider === 'evolution') {
                finalUrl = finalUrl.replace('/message/sendText', '').replace('/sendText', '').replace(/\/$/, '') + '/chat/findContacts';
            } else if (provider === 'zapi') {
                finalUrl = finalUrl.replace('/send-text', '').replace(/\/$/, '') + '/contacts';
            } else if (provider === 'meumotor') {
                finalUrl = finalUrl.replace('/send-text', '').replace(/\/$/, '') + '/contacts';
            }

            const headers = { 'Content-Type': 'application/json' };
            if (apiToken) {
                const t = apiToken;
                headers['Authorization'] = t.toLowerCase().startsWith('bearer') ? t : `Bearer ${t}`;
                headers['apikey'] = t; 
                headers['Client-Token'] = t;
            }

            let reqUrl = finalUrl;
            let reqOptions = { method: 'GET', headers };

            // Proxy to bypass block and CORS for HTTP targets
            if (window.location.protocol === 'https:' && finalUrl.startsWith('http://')) {
                reqUrl = 'https://us-central1-valentinacosmeticos-5f239.cloudfunctions.net/apiProxy';
                reqOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        targetUrl: finalUrl,
                        targetHeaders: headers,
                        targetMethod: 'GET'
                    })
                };
            }

            const response = await fetch(reqUrl, reqOptions);
            const data = await response.json();
            
            // Normalize return pattern
            if (data && data.contacts) return data.contacts; // Custom Motor / Evolution format (often)
            if (Array.isArray(data)) return data; // Z-API pattern
            if (data && data.data) return data.data;

            return [];
        } catch (e) {
            console.error("Erro ao buscar contatos da agenda:", e);
            return [];
        }
    },

    async syncToBrevo(clientData) {
        if (!clientData.email || clientData.email.trim() === '') return;
        try {
            const response = await fetch('https://api.brevo.com/v3/contacts', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': '', // Insira a sua chave API do Brevo aqui ou via Firebase
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    email: clientData.email,
                    attributes: {
                        NOME: clientData.name
                        // Removemos o campo SMS porque o Brevo bloqueia se dois contatos tiverem o mesmo número de telefone (muito comum em testes e famílias)
                    },
                    updateEnabled: true 
                })
            });
            if (!response.ok) {
                console.warn('Aviso Sincronização Brevo:', await response.text());
            } else {
                console.log('✅ Cliente sincronizado com o Brevo (Marketing) com sucesso!');
            }
        } catch (error) {
            console.error('❌ Erro na API Brevo:', error);
        }
    },

    async saveClient(clientData) {
        try {
            const enrichedClient = { ...clientData, createdAt: new Date().toISOString() };
            if (this.user && this.currentUserProfile) {
                enrichedClient.sellerId = clientData.sellerId || clientData.overrideSellerId || this.user.uid;
                enrichedClient.sellerName = clientData.sellerName || clientData.overrideSellerName || this.currentUserProfile.name || 'Sistema';
                enrichedClient.storeId = clientData.storeId || clientData.overrideStoreId || this.currentUserProfile.storeId || 'loja_1';
            }
            await db.collection("clients").add(enrichedClient);
            this.syncToBrevo(clientData);
            this.showToast('Cliente salva na nuvem com sucesso!');
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao salvar cliente.');
        }
    },

    async saveProduct(productData) {
        try {
            const enrichedProduct = { ...productData, createdAt: new Date().toISOString() };
            if (this.user && this.currentUserProfile) {
                enrichedProduct.sellerId = this.user.uid;
                enrichedProduct.sellerName = this.currentUserProfile.name || 'Sistema';
                enrichedProduct.storeId = this.currentUserProfile.storeId || 'loja_1';
            }
            await db.collection("products").add(enrichedProduct);
            this.showToast('Produto salvo no catálogo com sucesso!');
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao salvar produto.');
        }
    },

    async saveSale(saleData) {
        try {
            const enrichedSale = { ...saleData, createdAt: new Date().toISOString() };
            if (this.user && this.currentUserProfile) {
                enrichedSale.sellerId = saleData.overrideSellerId || this.user.uid;
                enrichedSale.sellerName = saleData.overrideSellerName || this.currentUserProfile.name || 'Sistema';
                enrichedSale.storeId = saleData.overrideStoreId || this.currentUserProfile.storeId || 'loja_1';
            }
            
            const docRef = await db.collection("sales").add(enrichedSale);
            this.showToast('Venda faturada e salva na nuvem!');
            
            try {
                const phoneStr = (saleData.phone || "").replace(/\D/g, '');
                if (phoneStr) {
                    let clean = phoneStr;
                    if (clean.startsWith('55')) clean = clean.substring(2);
                    let with9 = clean;
                    let without9 = clean;
                    if (clean.length === 11) {
                        without9 = clean.substring(0, 2) + clean.substring(3);
                    } else if (clean.length === 10) {
                        with9 = clean.substring(0, 2) + '9' + clean.substring(2);
                    }
                    const variations = [...new Set([
                        clean, '55'+clean, 
                        with9, '55'+with9, 
                        without9, '55'+without9
                    ])];

                    const snap = await db.collection("leads").where("phone", "in", variations).limit(1).get();
                    if (!snap.empty) {
                        const leadDoc = snap.docs[0];
                        const currentVal = parseFloat(leadDoc.data().value) || 0;
                        const saleVal = parseFloat(saleData.value) || 0;
                        await db.collection("leads").doc(leadDoc.id).update({
                            value: currentVal + saleVal,
                            status: 'won', // Marca como ganho automaticamente na venda
                            storeId: enrichedSale.storeId || 'loja_1', // Garante a posse do lead na conversão
                            updatedAt: new Date().toISOString()
                        });
                    }
                }
            } catch(e) {
                console.error("Erro ao sincronizar venda com Kanban:", e);
            }

            return docRef.id;
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao salvar venda.');
            return null;
        }
    },

    async updateSale(id, saleData) {
        try {
            const enrichedSale = { ...saleData, updatedAt: new Date().toISOString() };
            if (this.user && this.currentUserProfile) {
                if (saleData.overrideSellerId) enrichedSale.sellerId = saleData.overrideSellerId;
                if (saleData.overrideSellerName) enrichedSale.sellerName = saleData.overrideSellerName;
                if (saleData.overrideStoreId) enrichedSale.storeId = saleData.overrideStoreId;
            }
            await db.collection("sales").doc(id).update(enrichedSale);
            if (typeof this.showToast === 'function') this.showToast('Venda atualizada com sucesso!');
        } catch (e) {
            console.error(e);
            if (typeof this.showToast === 'function') this.showToast('Erro ao atualizar venda.', 'error');
        }
    },

    async updateClient(id, clientData) {
        try {
            await db.collection("clients").doc(id).update(clientData);
            this.syncToBrevo(clientData);
            this.showToast('Cliente atualizado com sucesso!');
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao atualizar cliente.');
        }
    },

    async updateProduct(id, productData) {
        try {
            await db.collection("products").doc(id).update(productData);
            this.showToast('Produto atualizado com sucesso!');
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao atualizar produto.');
        }
    }
};
