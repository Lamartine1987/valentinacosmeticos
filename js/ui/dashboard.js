import { db } from '../config/firebase.js';

export const dashboardModule = {
    getActions() {
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const actions = [];
        this.sales.forEach(sale => {
            if (!sale.date) return;
            const [y, m, d] = sale.date.split('-');
            const saleDate = new Date(y, m-1, d);
            
            const diffTime = today - saleDate;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
            
            const client = this.clients.find(c => c.phone && c.phone.replace(/\D/g, '') === sale.phone.replace(/\D/g, ''));
            const sName = client ? client.shortName : '';

            if (diffDays <= 2) {
                actions.push({ ...sale, type: 'thanks', days: diffDays, label: 'Agradecimento', colorClass: 'tag-thanks',
                    msg: this.parseTemplate('thanks', sale.name, sName, sale.product),
                    status: sale.msg_thanks_status || 'pending'
                });
            } else if (diffDays >= 15 && diffDays < 30) {
                actions.push({ ...sale, type: 'd15', days: diffDays, label: 'Acompanhamento', colorClass: 'tag-promo',
                    msg: this.parseTemplate('d15', sale.name, sName, sale.product),
                    status: sale.msg_d15_status || 'pending'
                });
            } else if (diffDays >= 30 && diffDays <= 45) {
                actions.push({ ...sale, type: 'restock', days: diffDays, label: 'Reposição', colorClass: 'tag-restock',
                    msg: this.parseTemplate('restock', sale.name, sName, sale.product),
                    status: sale.msg_restock_status || 'pending'
                });
            } else if (diffDays >= 46 && diffDays <= 120) {
                 actions.push({ ...sale, type: 'dormant', days: diffDays, label: 'Saudades', colorClass: 'tag-dormant',
                    msg: this.parseTemplate('dormant', sale.name, sName, sale.product),
                    status: sale.msg_dormant_status || 'pending'
                });
            } else if (diffDays >= 121) {
                 actions.push({ ...sale, type: 'lost', days: diffDays, label: 'Ex-cliente', colorClass: 'tag-lost',
                    msg: this.parseTemplate('lost', sale.name, sName, sale.product),
                    status: sale.msg_lost_status || 'pending'
                });
            }
        });
        
        if (this.promos) {
            this.promos.forEach(promo => {
                const promoDate = new Date(promo.createdAt);
                const diffTime = today - new Date(promoDate.getFullYear(), promoDate.getMonth(), promoDate.getDate());
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays <= 7 && diffDays >= 0) { // Mostrar histórico recente no dashboard
                    actions.push({
                        id: promo.id,
                        name: promo.name,
                        phone: promo.phone,
                        product: promo.product,
                        type: 'promo',
                        days: diffDays,
                        label: 'Promoção',
                        colorClass: 'tag-promo',
                        msg: promo.msg,
                        status: promo.status || 'sent',
                        date: promo.createdAt ? promo.createdAt.split('T')[0] : (new Date(Date.now() - (new Date()).getTimezoneOffset() * 60000)).toISOString().split('T')[0]
                    });
                }
            });
        }
        
        return actions.sort((a, b) => {
            const getTs = (obj) => {
                if (obj.createdAt) return new Date(obj.createdAt).getTime();
                if (obj.date) {
                    const [y, m, d] = obj.date.split('-');
                    return new Date(y, m-1, d).getTime();
                }
                return 0;
            };
            return getTs(b) - getTs(a);
        });
    },

    renderDashboard() {
        const fStart = (document.getElementById('dash-filter-start') || {value:''}).value;
        const fEnd = (document.getElementById('dash-filter-end') || {value:''}).value;
        const fType = (document.getElementById('dash-filter-type') || {value:'all'}).value;
        const fStoreSeller = (document.getElementById('dash-filter-store') || {value:'all'}).value;

        let filteredSales = [...this.sales];
        let actions = this.getActions();

        if (fStoreSeller !== 'all') {
            filteredSales = filteredSales.filter(sale => sale.sellerId === fStoreSeller || sale.storeId === fStoreSeller);
            actions = actions.filter(act => act.sellerId === fStoreSeller || act.storeId === fStoreSeller);
        }

        if (fStart || fEnd) {
            const filterDates = (item) => {
                if(!item.date) return false;
                const [y, m, d] = item.date.split('-');
                const itemDate = new Date(y, m-1, d);
                itemDate.setHours(0,0,0,0);
                
                if (fStart) {
                    const [sy, sm, sd] = fStart.split('-');
                    if (itemDate < new Date(sy, sm-1, sd)) return false;
                }
                if (fEnd) {
                    const [ey, em, ed] = fEnd.split('-');
                    if (itemDate > new Date(ey, em-1, ed)) return false;
                }
                return true;
            };

            filteredSales = filteredSales.filter(filterDates);
            actions = actions.filter(filterDates);
            
            const uniquePhones = new Set(filteredSales.map(s => s.phone.replace(/\D/g, '')));
            document.getElementById('stat-total-clients').innerText = uniquePhones.size;
        } else {
            document.getElementById('stat-total-clients').innerText = this.clients.length;
        }

        if (fType !== 'all') {
            actions = actions.filter(a => a.type === fType);
        }

        const totalSales = filteredSales.reduce((acc, curr) => acc + curr.value, 0);
        document.getElementById('stat-total-sales').innerText = `R$ ${totalSales.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        this.currentDashboardActions = actions;
        const pendingCount = actions.filter(a => a.status === 'pending' || a.status === 'failed').length;

        const badge = document.getElementById('noti-badge');
        badge.innerText = pendingCount;
        if(pendingCount > 0) { badge.style.display = 'block'; } else { badge.style.display = 'none'; }
        document.getElementById('stat-pending-contact').innerText = pendingCount;

        const btnDispararTodos = document.getElementById('btn-disparar-todos');
        if (btnDispararTodos) {
            if (pendingCount > 0) {
                btnDispararTodos.style.display = 'flex';
                btnDispararTodos.innerHTML = `<i class="fas fa-paper-plane" style="margin-right: 6px;"></i> Disparar Pendentes (${pendingCount})`;
            } else {
                btnDispararTodos.style.display = 'none';
            }
        }

        const listContainer = document.getElementById('action-list-container');
        listContainer.innerHTML = '';
        if(actions.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle" style="color: #10B981;"></i>
                    <h3 style="color: var(--text-main); margin-bottom: 8px;">Tudo em dia!</h3>
                    <p>Você não tem nenhuma ação de pós-venda pendente no momento.</p>
                </div>`;
            return;
        }

        actions.forEach(action => {
            const encodedMsg = encodeURIComponent(action.msg);
            const cleanPhone = action.phone.replace(/\D/g, '');
            const waLink = `https://wa.me/55${cleanPhone}?text=${encodedMsg}`;
            const item = document.createElement('div');
            item.className = 'action-item';
            
            let daysText = action.days === 0 ? 'Hoje' : (action.days === 1 ? 'Ontem' : `Há ${action.days} dias`);
            
            let actionHtml = `
                <div class="client-info">
                    <div style="display: flex; align-items: center;">
                        <span class="c-name">${action.name}</span>
                        <span class="c-tag ${action.colorClass}">${action.label}</span>
                    </div>
                    <span class="c-meta"><strong>${action.product}</strong> • ${action.type === 'promo' ? 'Enviado ' + daysText : 'Comprou ' + daysText}</span>
                </div>
            `;
            
            if (action.status === 'sent') {
                actionHtml += `
                    <div style="display: flex; align-items: center; gap: 8px; color: #10B981; font-weight: 500;">
                        <i class="fas fa-check-double"></i><span>Enviado pela API</span>
                    </div>
                `;
            } else if (action.status === 'aborted') {
                actionHtml += `
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 6px; color: #F59E0B; font-weight: 600;">
                            <i class="fas fa-shield-alt"></i><span>Cancelado (Anti-Spam)</span>
                        </div>
                        <span style="font-size: 11px; color: var(--text-muted);">Cliente comprou recentemente.</span>
                    </div>
                `;
            } else {
                let isFailed = action.status === 'failed';
                let btnText = isFailed ? 'Tentar de Novo' : 'Disparar na API';
                let btnIcon = isFailed ? 'fa-redo' : 'fa-paper-plane';
                let btnColor = isFailed ? 'background: #EF4444; color: white;' : 'background: var(--primary); color: white;';
                
                actionHtml += `
                    <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                        ${isFailed ? '<span style="font-size:11px; color:#EF4444; font-weight:600;"><i class="fas fa-exclamation-circle"></i> Falha no Disparo Anterior</span>' : ''}
                        <div style="display:flex; gap:8px;">
                            <a href="${waLink}" target="_blank" class="btn-icon" style="border:1px solid var(--border); padding:6px 12px; border-radius:8px; color:var(--text-main); font-size:13px; text-decoration:none;" title="Abrir WhatsApp Web Manualmente (Fallback)">
                                <i class="fab fa-whatsapp" style="color:#25D366; font-size:14px;"></i> Web
                            </a>
                            <button id="btn-resend-${action.id}-${action.type}" style="padding:6px 16px; font-size:13px; border-radius:8px; border:none; cursor:pointer; font-weight:500; display:flex; gap:6px; align-items:center; transition:0.2s; ${btnColor}" onclick="app.resendActionMsg('${action.id}', '${action.type}', '${action.phone}')">
                                <i class="fas ${btnIcon}"></i> ${btnText}
                            </button>
                        </div>
                    </div>
                `;
            }

            item.innerHTML = actionHtml;
            listContainer.appendChild(item);
        });
    },

    renderBirthdays() {
        const listContainer = document.getElementById('birthdays-list-container');
        if (!listContainer) return;
        
        const btnCampanha = document.getElementById('btn-disparar-aniversarios');
        const bdayMonthLabel = document.getElementById('bday-month-label');
        
        listContainer.innerHTML = '';
        
        const today = new Date();
        const currentMonth = today.getMonth() + 1; // 1-12
        
        const monthsPT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        if (bdayMonthLabel) bdayMonthLabel.textContent = monthsPT[currentMonth-1];

        // Find birthdays
        const birthdays = [];
        this.clients.forEach(client => {
            if (client.birthdate) {
                // Support DD/MM/YYYY or DD/MM formats used by the system
                const parts = client.birthdate.split('/');
                if (parts.length >= 2) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10);
                    const year = parts[2] ? parseInt(parts[2], 10) : null;
                    if (month === currentMonth) {
                        birthdays.push({ ...client, day, year });
                    }
                }
            }
        });

        // Sort by day
        birthdays.sort((a, b) => a.day - b.day);

        if (birthdays.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-check" style="color: #fbcfe8; font-size: 32px; margin-bottom: 12px;"></i>
                    <p style="color: var(--text-muted);">Nenhum aniversariante encontrado neste mês.</p>
                </div>`;
            if (btnCampanha) btnCampanha.style.display = 'none';
            return;
        }

        if (btnCampanha) btnCampanha.style.display = 'flex';

        birthdays.forEach(client => {
            const item = document.createElement('div');
            item.className = 'action-item';
            
            // If year exists and is somewhat valid, calculate age
            let clientAge = '';
            if (client.year && client.year > 1900) {
                let age = today.getFullYear() - client.year;
                clientAge = ` (${age} anos)`;
            }
            
            item.innerHTML = `
                <div class="client-info" style="flex-direction: row; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <input type="checkbox" class="bday-cb" value="${client.id}" checked style="width: 16px; height: 16px; cursor: pointer; accent-color: #db2777;">
                        <div>
                            <div style="display: flex; align-items: center;">
                                <span class="c-name">${client.name}</span>
                            </div>
                            <span class="c-meta"><i class="fas fa-gift" style="color: #db2777; margin-right: 4px;"></i> Dia ${client.day}${clientAge}</span>
                        </div>
                    </div>
                </div>
            `;
            listContainer.appendChild(item);
        });
    },

    dispararAniversarios() {
        // Collect checked client IDs
        const checkboxes = document.querySelectorAll('.bday-cb:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.value);
        
        if (selectedIds.length === 0) {
            this.showToast('Selecione pelo menos um aniversariante para disparar a campanha.', true);
            return;
        }
        
        // Define selected IDs for the global state so openPromoModal picks them up
        if (window.app) {
            window.app.selectedClientIds = new Set(selectedIds); // Overwrite existing selections
            
            if (typeof window.app.openPromoModal === 'function') {
                window.app.openPromoModal();
            } else if (typeof this.openPromoModal === 'function') {
                this.openPromoModal();
            }
        }
    },

    async dispararTodos() {
        if (!this.currentDashboardActions) return;
        
        const pendingActions = this.currentDashboardActions.filter(a => a.status === 'pending' || a.status === 'failed');
        if (pendingActions.length === 0) return;
        
        if (!this.apiSettings || !this.apiSettings.active) {
            alert('Atenção: O disparo em massa funciona melhor com a API Z-API conectada. No modo gratuito (Web), o sistema tentará abrir várias abas do WhatsApp simultaneamente, o que muitas vezes é bloqueado pelo seu navegador (libere os pop-ups).');
        }

        const btn = document.getElementById('btn-disparar-todos');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 6px;"></i> Disparando...';
        btn.disabled = true;

        let delayInterval = (!this.apiSettings || !this.apiSettings.active) ? 600 : 2000;
        
        for (let i = 0; i < pendingActions.length; i++) {
            const action = pendingActions[i];
            app.resendActionMsg(action.id, action.type, action.phone, action.msg);
            await new Promise(resolve => setTimeout(resolve, delayInterval));
        }
        
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        this.showToast(pendingActions.length + ' disparos foram processados!');
    },

    async resendActionMsg(saleId, type, phone, fallbackMsg) {
        let msg = fallbackMsg;
        let imgUrl = "";
        let storeId = 'loja_1';
        if (!msg) {
            const action = this.currentDashboardActions && this.currentDashboardActions.find(a => a.id === saleId && a.type === type);
            if (action && action.msg) {
                msg = action.msg;
                if (action.storeId) storeId = action.storeId;
            } else {
                this.showToast("Não foi possível carregar a mensagem original.");
                return;
            }
        } else {
            // Se foi passado via dispararTodos
            const action = this.currentDashboardActions && this.currentDashboardActions.find(a => a.id === saleId && a.type === type);
            if (action && action.storeId) storeId = action.storeId;
        }
        
        if (this.msgTemplates && this.msgTemplates[`${type}Img`]) {
            imgUrl = this.msgTemplates[`${type}Img`];
        }

        if (!this.apiSettings || !this.apiSettings.url) {
            this.showToast("Integração API do WhatsApp não está configurada corretamente!");
            return;
        }
        
        const btnId = `btn-resend-${saleId}-${type}`;
        const btn = document.getElementById(btnId);
        const originalHtml = btn ? btn.innerHTML : '';
        if(btn) { 
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; 
            btn.disabled = true; 
        }
        
        const success = await this.sendWhatsAppMessage(phone, msg, imgUrl, 'image', storeId);
        const statusField = `msg_${type}_status`;
        
        try {
            await db.collection("sales").doc(saleId).update({ [statusField]: success ? 'sent' : 'failed' });
        } catch(e) { console.error("Erro ao atualizar status na nuvem", e); }
        
        if (success) {
            this.showToast("Sucesso! Mensagem disparada pela API.");
        } else {
            this.showToast("Falha ao enviar via API. Verifique os logs no Console.");
            if(btn) {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        }
    }
};
