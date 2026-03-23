import { db } from '../config/firebase.js';

export const settingsModule = {
    async loadSettings() {
        if(!db) return;
        try {
            const docApi = await db.collection("settings").doc("whatsapp_api").get();
            if (docApi.exists) {
                this.apiSettings = docApi.data();
                const p = document.getElementById('api-provider');
                const u = document.getElementById('api-url');
                const t = document.getElementById('api-token');
                const a = document.getElementById('api-active');
                if(p) p.value = this.apiSettings.provider || 'evolution';
                if(u) u.value = this.apiSettings.url || '';
                if(t) t.value = this.apiSettings.token || '';
                if(a) a.checked = !!this.apiSettings.active;
            }
            
            const docTpl = await db.collection("settings").doc("msg_templates").get();
            if (docTpl.exists) {
                this.msgTemplates = { ...this.msgTemplates, ...docTpl.data() };
                const tThanks = document.getElementById('tpl-thanks');
                const tRestock = document.getElementById('tpl-restock');
                const tDormant = document.getElementById('tpl-dormant');
                const tLost = document.getElementById('tpl-lost');
                
                const tThanksImg = document.getElementById('tpl-thanks-img');
                const tRestockImg = document.getElementById('tpl-restock-img');
                const tDormantImg = document.getElementById('tpl-dormant-img');
                const tLostImg = document.getElementById('tpl-lost-img');

                if(tThanks) tThanks.value = this.msgTemplates.thanks || '';
                if(tRestock) tRestock.value = this.msgTemplates.restock || '';
                if(tDormant) tDormant.value = this.msgTemplates.dormant || '';
                if(tLost) tLost.value = this.msgTemplates.lost || '';

                if(tThanksImg) tThanksImg.value = this.msgTemplates.thanksImg || '';
                if(tRestockImg) tRestockImg.value = this.msgTemplates.restockImg || '';
                if(tDormantImg) tDormantImg.value = this.msgTemplates.dormantImg || '';
                if(tLostImg) tLostImg.value = this.msgTemplates.lostImg || '';
                
                if (typeof this.msgTemplates.promo === 'string') {
                    this.msgTemplates.promo = [ { id: Date.now(), title: 'Campanha Padrão', text: this.msgTemplates.promo } ];
                } else if (!Array.isArray(this.msgTemplates.promo)) {
                    this.msgTemplates.promo = [ { id: Date.now(), title: 'Campanha Padrão', text: "Oi {nome}! Temos uma novidade incrível para você: o {produto} está com uma condição super especial hoje. Garanta o seu através do link: {link} 💖" } ];
                }
                this.renderPromoTemplates();
            }
        } catch(e) { console.error(e); }
    },

    renderPromoTemplates() {
        const container = document.getElementById('promo-templates-container');
        if (!container) return;
        container.innerHTML = '';
        if (!Array.isArray(this.msgTemplates.promo)) this.msgTemplates.promo = [];
        this.msgTemplates.promo.forEach((tpl, index) => {
            const div = document.createElement('div');
            div.style.cssText = "border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: white; position: relative;";
            div.innerHTML = `
                <button type="button" class="btn-icon" style="position: absolute; top: 12px; right: 12px; font-size: 14px; color: #EF4444;" onclick="app.removePromoTemplate(${index})" title="Remover Modelo"><i class="fas fa-trash"></i></button>
                <div class="form-group" style="margin-bottom: 8px;">
                    <label style="font-size: 13px;">Nome da Campanha</label>
                    <input type="text" class="promo-tpl-title" value="${tpl.title}" required style="padding: 8px 12px; font-size: 14px; border: 1px solid var(--border); border-radius: 8px; outline: none; transition: 0.2s;">
                </div>
                <div class="form-group">
                    <label style="font-size: 13px;">Texto da Mensagem</label>
                    <textarea class="promo-tpl-text" rows="3" required style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; resize: vertical; outline: none; margin-bottom: 8px;" onkeyup="app.updateLivePreview(this.value, document.getElementById('promo-img-${index}').value)">${tpl.text}</textarea>
                    <div style="display: flex; gap: 8px;">
                        <input type="url" class="promo-tpl-img" id="promo-img-${index}" value="${tpl.imageUrl || ''}" placeholder="Link de Imagem / Anexo (Opcional)" style="flex: 1; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; outline: none; color: var(--text-main);" oninput="app.updateLivePreview(this.parentElement.previousElementSibling.value, this.value)">
                        <button type="button" class="btn-primary" style="padding: 8px 14px; background: #64748B; box-shadow: none;" onclick="document.getElementById('promo-file-${index}').click()" title="Fazer upload do computador"><i class="fas fa-upload"></i></button>
                        <input type="file" id="promo-file-${index}" accept="image/*" style="display: none;" onchange="app.uploadTemplateImage(event, 'promo-img-${index}')">
                    </div>
                </div>
            `;
            container.appendChild(div);
        });
    },

    addPromoTemplate() {
        if (!Array.isArray(this.msgTemplates.promo)) this.msgTemplates.promo = [];
        this.msgTemplates.promo.push({ id: Date.now(), title: 'Nova Campanha', text: 'Temos uma novidade para {nome}! Garanta o {produto} acessando {link} ✨' });
        this.renderPromoTemplates();
    },

    removePromoTemplate(index) {
        if (confirm('Tem certeza que deseja remover este modelo de campanha?')) {
            this.msgTemplates.promo.splice(index, 1);
            this.renderPromoTemplates();
        }
    },

    updateLivePreview(text, imageUrl) {
        const previewText = document.getElementById('wa-preview-text');
        const previewImg = document.getElementById('wa-preview-img');
        
        if (previewText) {
            let processedText = text || 'Sua mensagem aparecerá aqui...';
            processedText = processedText.replace(/{nome}/g, 'Cliente Vip');
            processedText = processedText.replace(/{produto}/g, 'Hidratação Especial');
            processedText = processedText.replace(/{link}/g, 'https://site.com/');
            previewText.textContent = processedText;
        }
        
        if (previewImg) {
            if (imageUrl && imageUrl.trim() !== '') {
                previewImg.src = imageUrl;
                previewImg.style.display = 'block';
            } else {
                previewImg.style.display = 'none';
                previewImg.src = '';
            }
        }
    },

    async uploadTemplateImage(event, targetInputId) {
        const file = event.target.files[0];
        if (!file) return;

        const btn = event.target.previousElementSibling;
        const originalIcon = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            const firebase = window.firebase;
            const storageRef = firebase.storage().ref();
            const fileRef = storageRef.child(`templates/${Date.now()}_${file.name}`);
            await fileRef.put(file);
            const url = await fileRef.getDownloadURL();
            const urlInput = document.getElementById(targetInputId);
            urlInput.value = url;
            this.showToast('Imagem carregada com sucesso!');

            if(targetInputId.startsWith('promo-')) {
                const textArea = urlInput.parentElement.previousElementSibling;
                if(textArea) app.updateLivePreview(textArea.value, url);
            }
        } catch(e) {
            console.error(e);
            this.showToast('Erro ao carregar imagem: ' + e.message);
        }

        btn.innerHTML = originalIcon;
        btn.disabled = false;
        event.target.value = ''; 
    }
};
