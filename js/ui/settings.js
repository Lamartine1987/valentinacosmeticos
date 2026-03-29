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
            
            this.loadTeamList();
            
            const docTpl = await db.collection("settings").doc("msg_templates").get();
            if (docTpl.exists) {
                this.msgTemplates = { ...this.msgTemplates, ...docTpl.data() };
                const tThanks = document.getElementById('tpl-thanks');
                const t15d = document.getElementById('tpl-15d');
                const tRestock = document.getElementById('tpl-restock');
                const tDormant = document.getElementById('tpl-dormant');
                const tLost = document.getElementById('tpl-lost');
                
                const tThanksImg = document.getElementById('tpl-thanks-img');
                const t15dImg = document.getElementById('tpl-15d-img');
                const tRestockImg = document.getElementById('tpl-restock-img');
                const tDormantImg = document.getElementById('tpl-dormant-img');
                const tLostImg = document.getElementById('tpl-lost-img');

                if(tThanks) tThanks.value = this.msgTemplates.thanks || '';
                if(t15d) t15d.value = this.msgTemplates.d15 || '';
                if(tRestock) tRestock.value = this.msgTemplates.restock || '';
                if(tDormant) tDormant.value = this.msgTemplates.dormant || '';
                if(tLost) tLost.value = this.msgTemplates.lost || '';

                if(tThanksImg) tThanksImg.value = this.msgTemplates.thanksImg || '';
                if(t15dImg) t15dImg.value = this.msgTemplates.d15Img || '';
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
                    <input type="text" class="promo-tpl-title" value="${tpl.title}" style="width: 100%; box-sizing: border-box; padding: 8px 12px; font-size: 14px; border: 1px solid var(--border); border-radius: 8px; outline: none; transition: 0.2s;">
                </div>
                <div class="form-group">
                    <label style="font-size: 13px;">Texto da Mensagem</label>
                    <textarea class="promo-tpl-text" rows="3" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; resize: vertical; outline: none; margin-bottom: 8px;" onkeyup="app.updateLivePreview(this.value, document.getElementById('promo-img-${index}').value)">${tpl.text}</textarea>
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <button type="button" class="btn-primary" style="padding: 8px 16px; background: #64748B; font-size: 13px; box-shadow: none;" onclick="document.getElementById('promo-file-${index}').click()">
                            <i class="fas fa-paperclip"></i> Adicionar Imagem/Anexo
                        </button>
                        <div style="display: flex; flex: 1; min-width: 200px; gap: 4px; align-items: center; background: #F8FAFC; border: 1px dashed var(--border); border-radius: 8px; padding-right: 4px;">    
                            <input type="url" class="promo-tpl-img" id="promo-img-${index}" value="${tpl.imageUrl || ''}" placeholder="Sem anexo..." style="flex: 1; min-width: 0; padding: 8px 12px; border: none; outline: none; font-size: 12px; color: var(--text-muted); background: transparent; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" readonly oninput="app.updateLivePreview(this.parentElement.parentElement.previousElementSibling.value, this.value)">
                            <button type="button" class="btn-icon" style="color: #EF4444; font-size: 14px; padding: 4px; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 4px; background: transparent; border: none; cursor: pointer;" onclick="app.removeTemplateImage('promo-img-${index}')" title="Remover anexo"><i class="fas fa-trash"></i></button>
                        </div>
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
                const img = new Image();
                img.onload = () => {
                    previewImg.src = imageUrl;
                    previewImg.style.display = 'block';
                };
                img.onerror = () => {
                    previewImg.style.display = 'none';
                    previewImg.src = '';
                };
                img.src = imageUrl;
            } else {
                previewImg.style.display = 'none';
                previewImg.src = '';
            }
        }
    },

    switchSettingsTab(tabId) {
        document.querySelectorAll('.settings-tab-content').forEach(el => el.style.display = 'none');
        const tabContents = {
            'funnel': 'tab-content-funnel',
            'promo': 'tab-content-promo',
            'api': 'tab-content-api',
            'team': 'tab-content-team'
        };
        const contentId = tabContents[tabId];
        const contentEl = document.getElementById(contentId);
        if(contentEl) contentEl.style.display = 'block';

        document.querySelectorAll('#page-settings .tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.color = 'var(--text-muted)';
            btn.style.borderBottomColor = 'transparent';
        });
        
        const activeBtn = document.getElementById('tab-btn-' + tabId);
        if(activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.color = 'var(--primary)';
            activeBtn.style.borderBottomColor = 'var(--primary)';
        }
    },

    async triggerDailyFunnels() {
        const btn = document.getElementById('btn-trigger-funnels');
        if(!btn) return;

        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Solicitando Varredura...';

        try {
            // Em vez de chamar fetch, vamos chamar via gatilho
            // Como é demo front/back, o ideal é usar a api local ou the triggers endpoint se estivesse exposto.
            // Assumiremos uma resposta fake de sucesso apenas visual, ou chamar função https
            this.showToast('Varredura acionada com sucesso. O servidor está processando assincronamente.');
        } catch(e) {
            console.error(e);
            alert('Falha ao acionar webhook manual.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    // --- GESTÃO DE EQUIPE (MULTI-TENANT) ---

    async loadTeamList() {
        if(!db) return;
        try {
            const snapshot = await db.collection("users").orderBy("createdAt", "desc").get();
            const tbody = document.getElementById('team-list-body');
            if (!tbody) return;
            tbody.innerHTML = '';

            if (snapshot.empty) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748B; padding: 24px;">Nenhum usuário cadastrado.</td></tr>`;
                return;
            }

            snapshot.forEach(doc => {
                const user = doc.data();
                const tr = document.createElement('tr');
                
                let roleBadge = user.role === 'admin' 
                    ? `<span style="background: #FEF3C7; color: #D97706; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;"><i class="fas fa-crown"></i> Admin</span>` 
                    : `<span style="background: #E0E7FF; color: #4338CA; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;"><i class="fas fa-user-tag"></i> Vendedor</span>`;
                
                let storeLabel = 'Acesso Global';
                if (user.storeId && user.storeId !== 'all') {
                    storeLabel = user.storeId === 'matriz' ? 'Matriz Principal' : (user.storeId === 'filial_1' ? 'Filial 1' : 'Filial 2');
                }

                tr.innerHTML = `
                    <td><strong>${user.name || 'Sem nome'}</strong></td>
                    <td style="color: var(--text-muted);">${user.email || 'N/A'}</td>
                    <td>${roleBadge}</td>
                    <td><span style="background: #F1F5F9; color: var(--text-muted); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;"><i class="fas fa-store"></i> ${storeLabel}</span></td>
                    <td style="text-align: center;"><i class="fas fa-check-circle" style="color: #10B981;" title="Ativo"></i></td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Erro ao carregar lista de usuários:", e);
        }
    },

    openTeamModal() {
        const overlay = document.getElementById('team-overlay');
        const form = document.getElementById('form-team');
        if (form) form.reset();
        document.getElementById('t-store-container').style.display = 'block';
        if(overlay) overlay.classList.add('active');
    },

    closeTeamModal() {
        const overlay = document.getElementById('team-overlay');
        if(overlay) overlay.classList.remove('active');
    },

    setupTeamListeners() {
        const formTeam = document.getElementById('form-team');
        if (formTeam) {
            formTeam.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cadastrando...';
                btn.disabled = true;

                try {
                    const payload = {
                        name: document.getElementById('t-name').value.trim(),
                        email: document.getElementById('t-email').value.trim(),
                        password: document.getElementById('t-password').value,
                        role: document.getElementById('t-role').value,
                        storeId: document.getElementById('t-store').value
                    };

                    const functions = firebase.app().functions('us-central1');
                    const createUserFn = functions.httpsCallable('createUser');
                    
                    const result = await createUserFn(payload);
                    
                    if (result.data.success) {
                        if(window.app && typeof window.app.showToast === 'function') {
                            window.app.showToast('Novo colaborador criado com sucesso!');
                        }
                        this.closeTeamModal();
                        this.loadTeamList();
                    }
                } catch (error) {
                    console.error("Erro ao registrar membro:", error);
                    alert("Falha ao registrar colaborador. \n\nDetalhes (Você é admin?): " + error.message);
                } finally {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        }
    },

    async triggerDailyFunnels() {
        const btn = document.getElementById('btn-trigger-funnels');
        if (!btn) return;

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executando Varredura...';
        btn.disabled = true;

        try {
            // Se o projeto for servido via Firebase Hosting, usa a URL oficial de nuvem
            const functionUrl = "https://us-central1-valentinacosmeticos-5f239.cloudfunctions.net/triggerDailyFunnels";

            const payloadOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            };

            const response = await fetch(functionUrl, payloadOptions);
            const data = await response.json();

            if (response.ok) {
                app.showToast(`Varredura concluída! ${data.sent} mensagens de funil enviadas hoje.`);
            } else {
                throw new Error(data.error || "Erro desconhecido na Cloud Function.");
            }
        } catch (error) {
            console.error("Erro ao forçar disparo do funil:", error);
            app.showToast("Falha ao executar o recálculo do funil diário.");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async uploadTemplateImage(event, targetInputId) {
        const file = event.target.files[0];
        if (!file) return;

        // The input file is now inside a flex container with the button and the url input div
        // We can find the button relative to the input file id:
        const fileInputId = event.target.id;
        const btn = event.target.parentElement.querySelector('button.btn-primary') || event.target.previousElementSibling;
        
        let originalIcon = '';
        if (btn) {
            originalIcon = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;
        }

        try {
            const firebase = window.firebase;
            const storageRef = firebase.storage().ref();
            const fileRef = storageRef.child(`templates/${Date.now()}_${file.name}`);
            await fileRef.put(file);
            const url = await fileRef.getDownloadURL();
            const urlInput = document.getElementById(targetInputId);
            if (urlInput) urlInput.value = url;
            this.showToast('Imagem adicionada com sucesso!');

            if(targetInputId.startsWith('promo-')) {
                const textArea = urlInput.parentElement.previousElementSibling;
                if(textArea) app.updateLivePreview(textArea.value, url);
            }
        } catch(e) {
            console.error(e);
            this.showToast('Erro ao carregar imagem: ' + e.message);
        }

        if (btn) {
            btn.innerHTML = originalIcon;
            btn.disabled = false;
        }
        event.target.value = ''; 
    },

    removeTemplateImage(targetInputId) {
        const input = document.getElementById(targetInputId);
        if (input) {
            input.value = '';
            if (this.showToast) {
                this.showToast('Mídia removida. Lembre-se de clicar em Editar/Salvar.');
            }
        }
    }
};
