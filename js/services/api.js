import { db } from '../config/firebase.js';

export const apiModule = {
    async sendWhatsAppMessage(phone, message, imageUrl = '', targetStoreId = 'matriz') {
        const settings = this.apiSettings;
        if (!settings) return false;
        
        let provider = settings.provider;
        let apiUrl = settings.url;
        let apiToken = settings.token;

        if (settings.instances && Array.isArray(settings.instances) && settings.instances.length > 0) {
             let inst = settings.instances.find(i => i.storeId === targetStoreId);
             if (!inst || !inst.active) {
                 inst = settings.instances.find(i => i.storeId === 'matriz'); // fallback
             }
             if (inst && inst.active) {
                 provider = inst.provider;
                 apiUrl = inst.url;
                 apiToken = inst.token;
             } else {
                 console.log("Instância API desabilitada ou incompatível para a loja:", targetStoreId);
                 return false;
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
                finalMessage += `\n\n${imageUrl.trim()}`; // Fallback suffix
                
                try {
                    const response = await fetch(imageUrl.trim());
                    const blob = await response.blob();
                    finalMediaPayload = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    console.warn("Falha ao converter imagem para base64.", e);
                    finalMediaPayload = imageUrl.trim();
                }
            }
            
            if(provider === 'evolution') {
                if (finalMediaPayload !== '') {
                    finalUrl = finalUrl.replace('/sendText', '/sendMedia');
                    body = { 
                        number: destPhone, 
                        mediaMessage: { 
                            mediatype: "image", 
                            caption: message, 
                            media: finalMediaPayload 
                        } 
                    };
                } else {
                    body = { number: destPhone, textMessage: { text: message } };
                }
            } else if (provider === 'zapi') {
                if (finalMediaPayload !== '') {
                    finalUrl = finalUrl.replace('/send-text', '').replace(/\/$/, '') + '/send-image';
                    body = { phone: destPhone, image: finalMediaPayload, caption: message, message: message }; 
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
                if(provider === 'zapi') headers['Client-Token'] = t;
            }
            
            console.log("URL Final disparada:", finalUrl);
            console.log("Headers formatados:", headers);
            console.log("Corpo da requisição (Body):", JSON.stringify(body));

            const response = await fetch(finalUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
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
                enrichedClient.sellerId = clientData.overrideSellerId || this.user.uid;
                enrichedClient.sellerName = clientData.overrideSellerName || this.currentUserProfile.name || 'Sistema';
                enrichedClient.storeId = clientData.overrideStoreId || this.currentUserProfile.storeId || 'matriz';
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
                enrichedProduct.storeId = this.currentUserProfile.storeId || 'matriz';
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
                enrichedSale.storeId = saleData.overrideStoreId || this.currentUserProfile.storeId || 'matriz';
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
                            storeId: enrichedSale.storeId || 'matriz', // Garante a posse do lead na conversão
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
