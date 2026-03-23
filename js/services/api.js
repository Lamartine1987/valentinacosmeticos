import { db } from '../config/firebase.js';

export const apiModule = {
    async sendWhatsAppMessage(phone, message, imageUrl = '') {
        if(!this.apiSettings || !this.apiSettings.url) return false;
        try {
            console.log("=== INICIANDO ENVIO DE WHATSAPP ===");
            console.log("Provedor configurado:", this.apiSettings.provider);
            
            const cleanPhone = phone.replace(/\D/g, '');
            let body = {};
            let finalUrl = this.apiSettings.url;
            let finalMediaPayload = "";
            let finalMessage = message;

            if (imageUrl && imageUrl.trim() !== '') {
                finalMessage += `\n\n${imageUrl.trim()}`; // Fallback suffix
                
                // For APIs, we download the image and convert to Base64 to avoid URL parsing issues on their end (very common with Firebase token URLs)
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
                    console.warn("Falha ao converter imagem para base64. Usando URL original.", e);
                    finalMediaPayload = imageUrl.trim();
                }
            }
            
            if(this.apiSettings.provider === 'evolution') {
                if (finalMediaPayload !== '') {
                    finalUrl = finalUrl.replace('/sendText', '/sendMedia');
                    body = { 
                        number: "55" + cleanPhone, 
                        mediaMessage: { 
                            mediatype: "image", 
                            caption: message, 
                            media: finalMediaPayload 
                        } 
                    };
                } else {
                    body = { number: "55" + cleanPhone, textMessage: { text: message } };
                }
            } else if (this.apiSettings.provider === 'zapi') {
                if (finalMediaPayload !== '') {
                    finalUrl = finalUrl.replace('/send-text', '').replace(/\/$/, '') + '/send-image';
                    body = { phone: "55" + cleanPhone, image: finalMediaPayload, caption: message, message: message }; 
                } else {
                    body = { phone: "55" + cleanPhone, message: message };
                    if (!finalUrl.endsWith('/send-text')) {
                        finalUrl = finalUrl.replace(/\/$/, '') + '/send-text';
                    }
                }
            } else {
                body = { phone: cleanPhone, message: finalMessage }; // webhook genérico
            }
            
            const headers = { 'Content-Type': 'application/json' };
            if (this.apiSettings.token) {
                const t = this.apiSettings.token;
                headers['Authorization'] = t.toLowerCase().startsWith('bearer') ? t : `Bearer ${t}`;
                headers['apikey'] = t; 
                if(this.apiSettings.provider === 'zapi') {
                    headers['Client-Token'] = t;
                }
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
            await db.collection("clients").add({
                ...clientData,
                createdAt: new Date().toISOString()
            });
            this.syncToBrevo(clientData);
            this.showToast('Cliente salva na nuvem com sucesso!');
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao salvar cliente.');
        }
    },

    async saveProduct(productData) {
        try {
            await db.collection("products").add({
                ...productData,
                createdAt: new Date().toISOString()
            });
            this.showToast('Produto salvo no catálogo com sucesso!');
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao salvar produto.');
        }
    },

    async saveSale(saleData) {
        try {
            const docRef = await db.collection("sales").add({
                ...saleData,
                createdAt: new Date().toISOString()
            });
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
