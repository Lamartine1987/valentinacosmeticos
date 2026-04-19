import { db } from '../config/firebase.js';

export const settingsModule = {
    async loadSettings() {
        if(!db) return;
        try {
            const docApi = await db.collection("settings").doc("whatsapp_api").get();
            if (docApi.exists) {
                this.apiSettings = docApi.data();
                this.apiSettings = docApi.data();
                if (!this.apiSettings.instances) {
                    this.apiSettings.instances = [];
                    if (this.apiSettings.url) {
                        this.apiSettings.instances.push({
                            id: Date.now(),
                            storeId: 'loja_1',
                            provider: this.apiSettings.provider || 'evolution',
                            url: this.apiSettings.url,
                            token: this.apiSettings.token || '',
                            active: !!this.apiSettings.active
                        });
                    }
                }
                if(this.apiSettings.instances.length === 0) {
                    this.apiSettings.instances.push({id: Date.now(), storeId: 'loja_1', provider: 'zapi', url: '', token: '', active: true});
                }
                if (typeof this.renderApiInstances === 'function') {
                    this.renderApiInstances();
                }
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
                const tBirthday = document.getElementById('tpl-birthday');
                const tBirthdayImg = document.getElementById('tpl-birthday-img');

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
                if(tBirthday) tBirthday.value = this.msgTemplates.birthday || '';
                if(tBirthdayImg) tBirthdayImg.value = this.msgTemplates.birthdayImg || '';
                
                if (typeof this.msgTemplates.promo === 'string') {
                    this.msgTemplates.promo = [ { id: Date.now(), title: 'Campanha Padrão', text: this.msgTemplates.promo } ];
                } else if (!Array.isArray(this.msgTemplates.promo)) {
                    this.msgTemplates.promo = [ { id: Date.now(), title: 'Campanha Padrão', text: "Oi {nome}! Temos uma novidade incrível para você: o {produto} está com uma condição super especial hoje. Garanta o seu através do link: {link} 💖" } ];
                }
                this.renderPromoTemplates();
            }

            const docPix = await db.collection("settings").doc("pix_config").get();
            if (docPix.exists) {
                this.pixConfig = docPix.data();
                const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
                
                // Loja 1 (Falls back to legacy single-store properties if available)
                setVal('pix-key-loja_1', this.pixConfig?.loja_1?.pixKey || this.pixConfig?.pixKey);
                setVal('pix-merchant-loja_1', this.pixConfig?.loja_1?.merchant || this.pixConfig?.merchant);
                setVal('pix-city-loja_1', this.pixConfig?.loja_1?.city || this.pixConfig?.city);

                // Loja 2
                setVal('pix-key-loja_2', this.pixConfig?.loja_2?.pixKey);
                setVal('pix-merchant-loja_2', this.pixConfig?.loja_2?.merchant);
                setVal('pix-city-loja_2', this.pixConfig?.loja_2?.city);
            }

            // Finance settings
            const docFin = await db.collection("settings").doc("finance").get();
            if (docFin.exists && docFin.data().categories) {
                this.financeCategories = docFin.data().categories;
                if(this.populateCategoryDropdown) this.populateCategoryDropdown();
            }
            
            // Commission settings
            const docComm = await db.collection("settings").doc("commission_config").get();
            if(!window.app) window.app = window.app || {};
            if (docComm.exists) {
                window.app.commissionConfig = docComm.data();
                const globalRate = window.app.commissionConfig.globalRate;
                if (globalRate !== undefined && document.getElementById('setting-commission-global')) {
                    document.getElementById('setting-commission-global').value = globalRate;
                }
            } else {
                window.app.commissionConfig = { globalRate: 0 };
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
        this.confirmAction(
            "Excluir Modelo de Campanha",
            "Tem certeza que deseja remover este modelo de campanha promocional?",
            async () => {
                this.msgTemplates.promo.splice(index, 1);
                this.renderPromoTemplates();
            }
        );
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

    renderApiInstances() {
        const container = document.getElementById('api-instances-container');
        if (!container) return;
        container.innerHTML = '';
        if (!this.apiSettings || !Array.isArray(this.apiSettings.instances)) return;

        this.apiSettings.instances.forEach((inst, index) => {
            const div = document.createElement('div');
            div.style.cssText = "border: 1px solid var(--border); border-radius: 8px; padding: 16px; background: white; position: relative;";
            
            // Lógica para nome visual da loja
            let storeLabel = 'Loja 1';
            if (inst.storeId === 'loja_2') storeLabel = 'Loja 2';
            
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px;">
                    <h4 style="margin: 0; font-size: 15px; color: var(--text-main);"><i class="fas fa-store" style="color: var(--primary); margin-right: 6px;"></i> Conexão: ${storeLabel}</h4>
                    <button type="button" class="btn-icon" style="color: #EF4444; font-size: 14px;" onclick="app.removeApiInstance(${index})" title="Remover Instância"><i class="fas fa-trash"></i> Remover</button>
                </div>
                <div class="form-grid">
                    <div class="form-group" style="grid-column: span 2;">
                        <label>Loja Vinculada</label>
                        <select class="api-v-store" required>
                            <option value="loja_1" ${inst.storeId === 'loja_1' ? 'selected' : ''}>Loja 1</option>
                            <option value="loja_2" ${inst.storeId === 'loja_2' ? 'selected' : ''}>Loja 2</option>
                        </select>
                    </div>
                    <div class="form-group" style="grid-column: span 2;">
                        <label>Serviço da API</label>
                        <select class="api-v-provider" required onchange="const panel = this.parentElement.parentElement.querySelector('.w-motor-panel'); if(panel) panel.style.display = this.value === 'meumotor' ? 'block' : 'none'; const urlTokens = this.parentElement.parentElement.querySelector('.url-token-groups'); if(urlTokens) urlTokens.style.display = this.value === 'meumotor' ? 'none' : 'contents';">
                            <option value="zapi" ${inst.provider === 'zapi' ? 'selected' : ''}>Z-API / ChatPro</option>
                            <option value="evolution" ${inst.provider === 'evolution' ? 'selected' : ''}>Evolution API / WhaConnect</option>
                            <option value="meumotor" ${inst.provider === 'meumotor' ? 'selected' : ''}>WhatsApp Motor (Próprio)</option>
                            <option value="webhook" ${inst.provider === 'webhook' ? 'selected' : ''}>Webhook Externo</option>
                        </select>
                    </div>
                    <div class="url-token-groups" style="display: ${inst.provider === 'meumotor' ? 'none' : 'contents'};">
                        <div class="form-group" style="grid-column: span 2;">
                            <label>URL / Webhook Endpoint</label>
                            <input type="url" class="api-v-url" placeholder="https://api..." value="${inst.url || ''}">
                        </div>
                        <div class="form-group" style="grid-column: span 2;">
                            <label>Token de Autenticação</label>
                            <input type="password" class="api-v-token" placeholder="Bearer Token" value="${inst.token || ''}">
                        </div>
                    </div>
                    <div class="form-group" style="display: flex; align-items: center; gap: 8px; grid-column: span 2;">
                        <input type="checkbox" class="api-v-active" style="width: 20px; height: 20px;" ${inst.active ? 'checked' : ''}>
                        <label style="margin: 0; cursor: pointer; font-weight: 500;">Habilitar envios automáticos por esta instância</label>
                    </div>
                    <div class="form-group w-motor-panel" style="grid-column: span 2; display: ${inst.provider === 'meumotor' ? 'block' : 'none'}; padding: 16px; background: #F8FAFC; border: 1px solid var(--border); border-radius: 8px; margin-top: 12px; margin-bottom: 8px;">
                        <h4 style="margin-bottom: 8px; font-size: 14px; color: var(--text-main);"><i class="fas fa-qrcode" style="color: #10B981;"></i> Conectar WhatsApp (Ligar Aparelho)</h4>
                        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Leia o QRCode usando o aplicativo oficial do WhatsApp no modo "Aparelhos Conectados". Para o QR Code aparecer, é preciso primeiro Salvar as Configurações.</p>
                        <div style="display: flex; gap: 16px; align-items: center;">
                            <button type="button" class="btn-primary btn-generate-qr" style="background: #10B981; font-size: 13px; padding: 8px 16px; box-shadow: none;" onclick="app.generateQrCodeForInstance(${index})">
                                <i class="fas fa-sync-alt"></i> Exibir / Atualizar QR Code
                            </button>
                            <span id="qr-status-text-${index}" style="font-size: 13px; color: var(--text-muted); font-weight: 500;"></span>
                        </div>
                        <div id="qr-code-container-${index}" style="margin-top: 16px; display: none; padding: 16px; background: white; border-radius: 8px; border: 1px dashed var(--border); width: fit-content; text-align: center;"></div>
                    </div>
                </div>
            `;
            container.appendChild(div);
        });
    },

    async generateQrCodeForInstance(index) {
        try {
            const container = document.getElementById('api-instances-container');
            const row = container.children[index];
            if (!row) return;

            const providerInput = row.querySelector('.api-v-provider')?.value;
            const isMeuMotor = providerInput === 'meumotor';
            
            const statusText = document.getElementById(`qr-status-text-${index}`);
            const qrContainer = document.getElementById(`qr-code-container-${index}`);
            
            let urlInput = '';
            let tokenInput = '';
            let baseUrl = '';
            let instanceName = '';

            if (isMeuMotor) {
                const storeInput = row.querySelector('.api-v-store')?.value || 'loja_1';
                instanceName = storeInput.replace('_', '');
                baseUrl = 'https://apiz.com.br';
                tokenInput = 'minha_chave_super_secreta_123';
            } else {
                urlInput = row.querySelector('.api-v-url').value;
                tokenInput = row.querySelector('.api-v-token').value;

                if (!urlInput) {
                    if (statusText) {
                        statusText.textContent = "Preencha a URL da API primeiro e clique em Salvar!";
                        statusText.style.color = "#EF4444";
                    }
                    return;
                }

                try {
                    const url = new URL(urlInput);
                    baseUrl = url.origin;
                    const paths = url.pathname.split('/').filter(p => p);
                    if (paths.length >= 2) {
                        instanceName = paths[0]; 
                    } else {
                        instanceName = prompt("Não foi possível detectar o nome da instância pela URL. Digite o nome da instância manualmente:", "loja1");
                    }
                } catch (e) {
                    if (statusText) statusText.textContent = "URL Inválida.";
                    return;
                }
            }

            if (!instanceName) return;

            if (statusText) {
                statusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Solicitando status da API...';
                statusText.style.color = "var(--text-muted)";
            }
            if (qrContainer) {
                qrContainer.style.display = 'none';
                qrContainer.innerHTML = '';
            }

            const executeApiFetch = async (targetPath, method = 'GET', bodyObj = null) => {
                let reqUrl = `${baseUrl}${targetPath}`;
                const headers = { 'x-api-key': tokenInput };
                if (bodyObj) headers['Content-Type'] = 'application/json';
                
                let fetchOptions = {
                    method: method,
                    headers: headers
                };
                if (bodyObj) fetchOptions.body = JSON.stringify(bodyObj);

                if (window.location.protocol === 'https:' && reqUrl.startsWith('http://')) {
                    fetchOptions = {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            targetUrl: reqUrl,
                            targetHeaders: headers,
                            targetMethod: method,
                            targetBody: bodyObj
                        })
                    };
                    reqUrl = 'https://us-central1-valentinacosmeticos-5f239.cloudfunctions.net/apiProxy';
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                fetchOptions.signal = controller.signal;

                const response = await fetch(reqUrl, fetchOptions);
                clearTimeout(timeoutId);
                const result = await response.json();
                if (!response.ok) {
                    throw { status: response.status, message: result.error || 'Erro na API' };
                }
                return result;
            };

            const fetchStatus = () => executeApiFetch(`/instance/status/${instanceName}`);

            const webhookUrl = "https://us-central1-valentinacosmeticos-5f239.cloudfunctions.net/whatsappWebhook";

            let data;
            try {
                data = await fetchStatus();
                // Sempre garantimos que o webhook esteja configurado se a instância já existir
                try {
                    await executeApiFetch(`/instance/webhook`, 'POST', { instanceName, webhookUrl });
                } catch(wErr) { console.error("Erro ao atualizar webhook", wErr); }
            } catch (err) {
                console.error(err);
                if (err.message && err.message.includes('NOT_FOUND') || err.status === 404) {
                    if (statusText) statusText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando instância...';
                    await executeApiFetch(`/instance/create`, 'POST', { instanceName, webhookUrl });
                    await new Promise(r => setTimeout(r, 2000));
                    data = await fetchStatus();
                } else if (err.name === 'AbortError') {
                    if (statusText) { statusText.textContent = 'Erro: Timeout na conexão.'; statusText.style.color = "#EF4444"; }
                    return;
                } else {
                    try {
                        await executeApiFetch(`/instance/create`, 'POST', { instanceName, webhookUrl });
                        await new Promise(r => setTimeout(r, 2000));
                        data = await fetchStatus();
                    } catch (e2) {
                        if (statusText) { statusText.textContent = 'Erro ao contactar API. Verifique token/URL.'; statusText.style.color = "#EF4444"; }
                        return;
                    }
                }
            }

            if (!data) return;

            if (data.status === 'CONNECTED') {
                if (statusText) {
                    statusText.innerHTML = '<i class="fas fa-check-circle"></i> Instância já está Conectada e Online!';
                    statusText.style.color = "#10B981";
                }
            } else if (data.qr) {
                if (statusText) {
                    statusText.textContent = 'Aguardando leitura do QR Code...';
                    statusText.style.color = "var(--primary)";
                }
                if (qrContainer) {
                    qrContainer.style.display = 'block';
                    new QRCode(qrContainer, {
                        text: data.qr,
                        width: 256,
                        height: 256,
                        colorDark : "#000000",
                        colorLight : "#ffffff",
                        correctLevel : QRCode.CorrectLevel.H
                    });
                    
                    // Simple polling mechanism
                    let attempts = 0;
                    const checkInterval = setInterval(async () => {
                        attempts++;
                        try {
                            const pollData = await fetchStatus();
                            if (pollData.status === 'CONNECTED') {
                                clearInterval(checkInterval);
                                qrContainer.innerHTML = '<div style="color:#10B981; font-weight: bold; font-size: 16px;"><i class="fas fa-check-circle" style="font-size: 40px; margin-bottom: 8px;"></i><br>Conectado com Sucesso!</div>';
                                if (statusText) {
                                    statusText.innerHTML = 'WhatsApp Conectado!';
                                    statusText.style.color = "#10B981";
                                }
                            }
                        } catch (e) {}
                        if (attempts > 30) clearInterval(checkInterval); // Stop after 1 minute
                    }, 2000);
                }
            } else {
                if (statusText) {
                    statusText.textContent = `Status: ${data.status || 'Desconhecido'}. Tente novamente em alguns segundos.`;
                    statusText.style.color = "#F59E0B";
                }
            }

        } catch (error) {
            console.error("Erro na obtenção do QR Code:", error);
            const statusText = document.getElementById(`qr-status-text-${index}`);
            if (statusText) {
                statusText.textContent = "Erro interno ao consultar API.";
                statusText.style.color = "#EF4444";
            }
        }
    },

    addApiInstance() {

        if (!this.apiSettings) this.apiSettings = {};
        if (!Array.isArray(this.apiSettings.instances)) this.apiSettings.instances = [];
        this.apiSettings.instances.push({
            id: Date.now(),
            storeId: 'loja_2',
            provider: 'zapi',
            url: '',
            token: '',
            active: true
        });
        this.renderApiInstances();
    },

    removeApiInstance(index) {
        this.confirmAction(
            "Excluir Instância Z-API",
            "Atenção: Os disparos para clientes desta loja falharão ou serão roteados para a Matriz se você excluir e não repor. Confirma a exclusão?",
            async () => {
                this.apiSettings.instances.splice(index, 1);
                this.renderApiInstances();
            }
        );
    },

    switchSettingsTab(tabId) {
        document.querySelectorAll('.settings-tab-content').forEach(el => el.style.display = 'none');
        const tabContents = {
            'funnel': 'tab-content-funnel',
            'promo': 'tab-content-promo',
            'api': 'tab-content-api',
            'team': 'tab-content-team',
            'pix': 'tab-content-pix',
            'commission': 'tab-content-commission',
            'webhook': 'tab-content-webhook'
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

    async saveCommissionSettings() {
        const btn = document.querySelector('#tab-content-commission .btn-primary');
        const originalHtml = btn ? btn.innerHTML : '';
        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true; }
        
        try {
            const globalRate = parseFloat(document.getElementById('setting-commission-global').value) || 0;
            if (!window.app.commissionConfig) window.app.commissionConfig = {};
            window.app.commissionConfig.globalRate = globalRate;

            await db.collection("settings").doc("commission_config").set({ globalRate });
            if (typeof this.showToast === 'function') this.showToast('Configurações de comissão salvas!');
            else if (window.app && typeof window.app.showToast === 'function') window.app.showToast('Configurações de comissão salvas!');
        } catch (e) {
            console.error("Erro ao salvar comissões:", e);
            alert("Erro ao salvar: " + e.message);
        } finally {
            if (btn) { btn.innerHTML = originalHtml; btn.disabled = false; }
        }
    },

    generateWebhookUrl() {
        const storeId = document.getElementById('setting-webhook-store').value;
        const urlInput = document.getElementById('setting-webhook-url');
        const btnCopy = document.getElementById('btn-copy-webhook');
        
        if (!storeId) {
            urlInput.value = '';
            btnCopy.disabled = true;
            return;
        }

        const projectId = window.firebase ? window.firebase.app().options.projectId : 'valentinacosmeticos-5f239';
        const region = 'us-central1';
        const webhookEndpoint = `https://${region}-${projectId}.cloudfunctions.net/whatsappWebhook`;
        
        const finalUrl = `${webhookEndpoint}?storeId=${storeId}`;
        urlInput.value = finalUrl;
        btnCopy.disabled = false;
    },

    copyWebhookUrl() {
        const urlInput = document.getElementById('setting-webhook-url');
        if (!urlInput || !urlInput.value) return;

        urlInput.select();
        urlInput.setSelectionRange(0, 99999); 
        navigator.clipboard.writeText(urlInput.value).then(() => {
            if (typeof this.showToast === 'function') {
                this.showToast('URL copiada para a área de transferência!');
            } else if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast('URL copiada para a área de transferência!');
            }
        }).catch(err => {
            console.error('Falha ao copiar:', err);
        });
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
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748B; padding: 24px;">Nenhum usuário cadastrado.</td></tr>`;
                return;
            }

            window.app = window.app || {};
            window.app.teamUsersList = [];

            snapshot.forEach(doc => {
                const user = doc.data();
                user.id = doc.id;
                
                // Manager only sees users from their own store
                if (window.app && window.app.currentUserProfile && window.app.currentUserProfile.role === 'manager') {
                    if (user.storeId !== window.app.currentUserProfile.storeId) return;
                }

                window.app.teamUsersList.push(user);

                const tr = document.createElement('tr');
                
                let roleBadge = user.role === 'admin' 
                    ? `<span style="background: #FEF3C7; color: #D97706; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;"><i class="fas fa-crown"></i> Admin</span>` 
                    : user.role === 'manager' ? `<span style="background: #e0f2fe; color: #0284c7; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;"><i class="fas fa-user-tie"></i> Gerente</span>` : `<span style="background: #E0E7FF; color: #4338CA; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;"><i class="fas fa-user-tag"></i> Consultor de Vendas</span>`;
                
                let storeLabel = 'Acesso Global';
                if (user.storeId && user.storeId !== 'all') {
                    storeLabel = user.storeId === 'loja_1' ? 'Loja 1' : 'Loja 2';
                }

                tr.innerHTML = `
                    <td><strong>${user.name || 'Sem nome'}</strong></td>
                    <td style="color: var(--text-muted);">${user.email || 'N/A'}</td>
                    <td>${roleBadge}</td>
                    <td><span style="background: #F1F5F9; color: var(--text-muted); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;"><i class="fas fa-store"></i> ${storeLabel}</span></td>
                    <td style="text-align: center;"><i class="fas fa-check-circle" style="color: #10B981;" title="Ativo"></i></td>
                    <td style="text-align: center;">
                        <button class="btn-icon" onclick="app.editTeamMember('${user.id}')" title="Editar" style="color: #3B82F6; margin-right: 8px;"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" onclick="app.deleteTeamMember('${user.id}', '${(user.name || '').replace(/'/g, "\\'")}')" title="Excluir" style="color: #EF4444;"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Erro ao carregar lista de usuários:", e);
        }
    },

    openTeamModal(editUser = null) {
        const overlay = document.getElementById('team-overlay');
        const form = document.getElementById('form-team');
        if (form) form.reset();
        
        const titleEl = overlay ? overlay.querySelector('h2') : null;
        const submitBtn = overlay ? overlay.querySelector('button[type="submit"]') : null;
        const hintEl = document.getElementById('t-password-hint');
        
        if (editUser && editUser.id) {
            document.getElementById('t-id').value = editUser.id;
            document.getElementById('t-name').value = editUser.name || '';
            document.getElementById('t-email').value = editUser.email || '';
            if (document.getElementById('t-commission')) document.getElementById('t-commission').value = editUser.commissionRate !== undefined && editUser.commissionRate !== null ? editUser.commissionRate : '';
            document.getElementById('t-role').value = editUser.role || 'seller';
            if(document.getElementById('t-store')) document.getElementById('t-store').value = editUser.storeId || 'loja_1';
            document.getElementById('t-password').required = false;
            
            if(titleEl) titleEl.innerHTML = '<i class="fas fa-user-edit" style="color: var(--primary); margin-right: 8px;"></i> Editar Colaborador';
            if(submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Atualizar Acesso';
            if(hintEl) hintEl.style.display = 'inline';
        } else {
            document.getElementById('t-id').value = '';
            if (document.getElementById('t-commission')) document.getElementById('t-commission').value = '';
            document.getElementById('t-password').required = true;
            
            if(titleEl) titleEl.innerHTML = '<i class="fas fa-user-tie" style="color: var(--primary); margin-right: 8px;"></i> Novo Colaborador';
            if(submitBtn) submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Cadastrar Acesso';
            if(hintEl) hintEl.style.display = 'none';
        }

        const isAdm = (editUser && editUser.role === 'admin');
        const loggedUserIsManager = (window.app && window.app.currentUserProfile && window.app.currentUserProfile.role === 'manager');

        document.getElementById('t-store-container').style.display = isAdm ? 'none' : 'block';
        const st = document.getElementById('t-store');
        const roleSel = document.getElementById('t-role');
        if (st) st.required = !isAdm;

        if (loggedUserIsManager) {
            if(roleSel) { roleSel.value = 'seller'; roleSel.disabled = true; } // Managers only create sellers
            if(st) { st.value = window.app.currentUserProfile.storeId; st.disabled = true; } // Locked to manager's store
        } else {
            if(roleSel) roleSel.disabled = false;
            if(st) st.disabled = false;
        }

        if(overlay) overlay.classList.add('active');
    },

    editTeamMember(id) {
        if (!window.app || !window.app.teamUsersList) return;
        const user = window.app.teamUsersList.find(u => u.id === id);
        if(user) this.openTeamModal(user);
    },

    deleteTeamMember(id, name) {
        this.confirmAction(
            "Excluir Colaborador",
            `Tem certeza que deseja excluir o acesso de ${name}? Esta ação não pode ser desfeita e o usuário perderá acesso imediato.`,
            async () => {
                try {
                    const functions = firebase.app().functions('us-central1');
                    const deleteUserFn = functions.httpsCallable('deleteUser');
                    const result = await deleteUserFn({ uid: id });
                    
                    if (result.data.success) {
                        if (typeof this.showToast === 'function') this.showToast('Colaborador removido com sucesso!');
                        this.loadTeamList();
                        if(window.app && typeof window.app.loadUsers === 'function') {
                            window.app.loadUsers();
                        }
                    }
                } catch(e) {
                    console.error("Erro na exclusão:", e);
                    if (typeof this.showToast === 'function') this.showToast('Erro ao remover colaborador: ' + e.message, 'error');
                }
            }
        );
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
                    const editId = document.getElementById('t-id').value;
                    const commVal = document.getElementById('t-commission') ? document.getElementById('t-commission').value : '';
                    const payload = {
                        name: document.getElementById('t-name').value.trim(),
                        email: document.getElementById('t-email').value.trim(),
                        password: document.getElementById('t-password').value,
                        role: document.getElementById('t-role').value,
                        storeId: document.getElementById('t-store').value,
                        commissionRate: commVal !== '' ? parseFloat(commVal) : null
                    };

                    const functions = firebase.app().functions('us-central1');
                    
                    if (editId) {
                        payload.uid = editId;
                        const updateUserFn = functions.httpsCallable('updateUser');
                        const result = await updateUserFn(payload);
                        
                        if (result.data.success) {
                            if(window.app && typeof window.app.showToast === 'function') {
                                window.app.showToast('Acesso atualizado com sucesso!');
                            }
                        }
                    } else {
                        const createUserFn = functions.httpsCallable('createUser');
                        const result = await createUserFn(payload);
                        
                        if (result.data.success) {
                            if(window.app && typeof window.app.showToast === 'function') {
                                window.app.showToast('Novo colaborador criado com sucesso!');
                            }
                        }
                    }

                    this.closeTeamModal();
                    this.loadTeamList();
                    if(window.app && typeof window.app.loadUsers === 'function') {
                        window.app.loadUsers();
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
