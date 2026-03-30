import { db } from '../config/firebase.js';

export const clientsModule = {
    editClient(id) {
        const client = this.clients.find(c => c.id === id);
        if(!client) return;
        this.editingClientId = id;
        document.getElementById('c-name').value = client.name || '';
        document.getElementById('c-phone').value = client.phone || '';
        document.getElementById('c-email').value = client.email || '';
        document.getElementById('c-birthdate').value = client.birthdate || '';
        document.getElementById('c-city').value = client.city || '';
        document.getElementById('client-form-title').innerText = "Editar Cliente";
        document.getElementById('client-form-desc').innerText = "Atualize os dados deste cliente na sua base.";
        document.getElementById('client-submit-text').innerText = "Atualizar Cliente";
        this.navigateTo('client-register');
    },

    cancelClientEdit() {
        this.editingClientId = null;
        const form = document.getElementById('form-client');
        if(form) form.reset();
        document.getElementById('client-form-title').innerText = "Cadastrar Cliente";
        document.getElementById('client-form-desc').innerText = "Adicione um novo contato à sua base manualmente.";
        document.getElementById('client-submit-text').innerText = "Salvar Cliente";
        this.navigateTo('clients');
    },

    async deleteClient(id) {
        if (this.currentUserProfile && this.currentUserProfile.role !== 'admin') {
            if (typeof this.showToast === 'function') this.showToast('Você (vendedor) não tem permissão para excluir um cliente. Apenas edições são permitidas.', 'error');
            const c = this.clients.find(x => x.id === id);
            if (typeof this.saveAuditLog === 'function') this.saveAuditLog('client', 'attempt_delete', id, `Tentativa de exclusão bloqueada.<br><strong>Alvo:</strong> ${c ? c.name+' ('+c.phone+')' : id}`);
            return;
        }

        this.confirmAction(
            "Excluir Cliente",
            "Tem certeza que deseja excluir este cliente? Toda a relação será perdida definitivamente.",
            async () => {
                try {
                    await db.collection('clients').doc(id).delete();
                    if (typeof this.showToast === 'function') this.showToast('Cliente excluído com sucesso!', 'info');
                } catch(e) {
                    console.error("Erro ao excluir cliente:", e);
                    if (typeof this.showToast === 'function') this.showToast('Erro ao excluir cliente.', 'error');
                }
            }
        );
    },

    async deleteSelectedClients() {
        if (this.currentUserProfile && this.currentUserProfile.role !== 'admin') {
            if (typeof this.showToast === 'function') this.showToast('Ação bloqueada. Apenas Admins podem realizar exclusão em lote de clientes.', 'error');
            const checkboxes = document.querySelectorAll('.page.active .client-checkbox:checked');
            if (typeof this.saveAuditLog === 'function') this.saveAuditLog('client', 'attempt_delete', 'Lote', `Tentativa de exclusão em massa bloqueada.<br><strong>Quantidade Selecionada:</strong> ${checkboxes.length} cliente(s) simultâneos.`);
            return;
        }

        const checkboxes = document.querySelectorAll('.page.active .client-checkbox:checked');
        if (checkboxes.length === 0) {
            if (typeof this.showToast === 'function') this.showToast('Selecione pelo menos um cliente para excluir.', 'warning');
            return;
        }

        this.confirmAction(
            "Excluir Clientes em Massa",
            `Tem certeza que deseja excluir ${checkboxes.length} cliente(s)? Esta ação não pode ser desfeita.`,
            async () => {
                try {
                    const batch = db.batch();
                    checkboxes.forEach(cb => {
                        const docRef = db.collection('clients').doc(cb.value);
                        batch.delete(docRef);
                    });
                    await batch.commit();
                    if (typeof this.showToast === 'function') this.showToast(`${checkboxes.length} cliente(s) excluído(s)!`, 'info');
                    
                    const selectAllCb = document.getElementById('selectAllClients');
                    if (selectAllCb) selectAllCb.checked = false;
                } catch(e) {
                    console.error("Erro exclusão em massa:", e);
                    if (typeof this.showToast === 'function') this.showToast('Erro ao excluir clientes.', 'error');
                }
            }
        );
    },

    renderClientsTable() {
        const tbody = document.getElementById('clients-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const filterName = (document.getElementById('filter-name') || {value:''}).value.toLowerCase();
        const filterProduct = (document.getElementById('filter-sale-product') || {value:''}).value.toLowerCase();
        const filterStatus = (document.getElementById('filter-status') || {value:'all'}).value;
        const filterDateStart = (document.getElementById('filter-date-start') || {value:''}).value;
        const filterDateEnd = (document.getElementById('filter-date-end') || {value:''}).value;
        const filterSaleStore = (document.getElementById('filter-sale-store') || {value:'all'}).value;

        let filteredSales = [...this.sales].reverse();

        if (filterSaleStore !== 'all') {
            filteredSales = filteredSales.filter(sale => sale.sellerId === filterSaleStore || sale.storeId === filterSaleStore);
        }

        filteredSales = filteredSales.filter(sale => {
            if(!sale.date) return false;
            const [y, m, d] = sale.date.split('-');
            const saleDate = new Date(y, m-1, d);
            const diffDays = Math.floor((today - saleDate) / (1000 * 60 * 60 * 24));
            
            if (filterName && !sale.name.toLowerCase().includes(filterName)) return false;
            
            if (filterProduct) {
                let match = false;
                if (sale.items && sale.items.length > 0) {
                    match = sale.items.some(item => item.product && item.product.toLowerCase().includes(filterProduct));
                } else if (sale.product) {
                    match = sale.product.toLowerCase().includes(filterProduct);
                }
                if (!match) return false;
            }

            if (filterStatus === 'new' && diffDays >= 30) return false;
            if (filterStatus === 'restock' && (diffDays < 30 || diffDays >= 90)) return false;
            if (filterStatus === 'dormant' && diffDays < 90) return false;
            if (filterDateStart) {
                const [sy, sm, sd] = filterDateStart.split('-');
                if (saleDate < new Date(sy, sm-1, sd)) return false;
            }
            if (filterDateEnd) {
                const [ey, em, ed] = filterDateEnd.split('-');
                if (saleDate > new Date(ey, em-1, ed)) return false;
            }
            return true;
        });

        if (filteredSales.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748B; padding: 32px;">Nenhuma venda encontrada na nuvem.</td></tr>`;
            return;
        }

        filteredSales.forEach(sale => {
            const [y, m, d] = sale.date.split('-');
            const saleDate = new Date(y, m-1, d);
            const diffDays = Math.floor((today - saleDate) / (1000 * 60 * 60 * 24));
            
            let timeText = diffDays <= 0 ? "Hoje" : (diffDays === 1 ? "Ontem" : `Há ${diffDays} dias`);
            
            let timeStatus = `<span style="color:#10B981; font-weight: 500;">Novo <small style="color:var(--text-muted);font-weight:normal; font-size:12px;">(${timeText})</small></span>`;
            if (diffDays >= 30) timeStatus = `<span style="color:#F59E0B; font-weight: 500;">Repor <small style="color:var(--text-muted);font-weight:normal; font-size:12px;">(${timeText})</small></span>`;
            if (diffDays >= 90) timeStatus = `<span style="color:#EF4444; font-weight: 500;">Inativo <small style="color:var(--text-muted);font-weight:normal; font-size:12px;">(${timeText})</small></span>`;
            if (diffDays >= 180) timeStatus = `<span style="color:#64748B; font-weight: 500;">Ex-cliente <small style="color:var(--text-muted);font-weight:normal; font-size:12px;">(${timeText})</small></span>`;
            let productsHtml = '';
            let qtyHtml = '';
            let subtotalHtml = '';

            if (sale.items && sale.items.length > 0) {
                let mapped = sale.items.map(item => {
                    let subTotal = 0;
                    if (item.price !== undefined) {
                        subTotal = item.price * item.quantity;
                    } else {
                        const catalogItem = this.products.find(p => p.name === item.product);
                        if (catalogItem && catalogItem.price) subTotal = (parseFloat(catalogItem.price) || 0) * item.quantity;
                    }
                    return { prod: item.product, qty: item.quantity, subTotal: subTotal };
                });
                
                const knownTotal = mapped.reduce((acc, curr) => acc + curr.subTotal, 0);
                const unknownItems = mapped.filter(m => m.subTotal === 0);
                
                if (unknownItems.length > 0) {
                    const remainingValue = Math.max(0, sale.value - knownTotal);
                    if (unknownItems.length === 1) {
                        unknownItems[0].subTotal = remainingValue;
                    } else {
                        const perItem = remainingValue / unknownItems.length;
                        unknownItems.forEach(i => i.subTotal = perItem);
                    }
                }

                productsHtml = mapped.map(m => `<div style="padding: 6px 0; border-bottom: 1px solid #F1F5F9;">${m.prod}</div>`).join('');
                qtyHtml = mapped.map(m => `<div style="padding: 6px 0; text-align: center; border-bottom: 1px solid #F1F5F9; color: var(--text-muted); font-weight: 500;">x${m.qty}</div>`).join('');
                subtotalHtml = mapped.map(m => `<div style="padding: 6px 0; border-bottom: 1px solid #F1F5F9; color: #64748B;">R$ ${m.subTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>`).join('');
            } else {
                productsHtml = sale.product;
                qtyHtml = `<div style="text-align: center; color: var(--text-muted); font-weight: 500;">x${sale.quantity || 1}</div>`;
                subtotalHtml = `<div style="color: #64748B;">R$ ${(sale.value || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>`;
            }

            const clientObj = this.clients.find(c => c.phone && sale.phone && c.phone.replace(/\D/g, '') === sale.phone.replace(/\D/g, ''));
            const clientIdAttr = clientObj ? clientObj.id : sale.phone;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="text-align: center;"><input type="checkbox" class="sale-checkbox" value="${sale.id}" style="cursor: pointer; width: 16px; height: 16px;"></td>
                <td><strong>${sale.name}</strong><br><small style="color:#64748B">${sale.phone}</small></td>
                <td><div style="display: flex; flex-direction: column;">${productsHtml}</div></td>
                <td><div style="display: flex; flex-direction: column;">${qtyHtml}</div></td>
                <td><div style="display: flex; flex-direction: column;">${subtotalHtml}</div></td>
                <td>${saleDate.toLocaleDateString('pt-BR')}</td>
                <td><strong>R$ ${sale.value.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
                <td>${timeStatus}</td>
                <td class="admin-only" style="${this.currentUserProfile && this.currentUserProfile.role === 'admin' ? '' : 'display:none;'} color:var(--text-muted); font-size:12px; text-transform:capitalize;">${sale.sellerName || 'Sistema'}</td>
                <td style="text-align: center;">
                    <div style="display: flex; justify-content: center; gap: 8px;">
                        <button class="btn-icon" style="color: #EF4444;" onclick="app.deleteSale('${sale.id}')" title="Excluir Venda">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    },

    renderClientsList() {
        const tbody = document.getElementById('clients-list-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        const selectAllCb = document.getElementById('selectAllClients');
        if (selectAllCb) selectAllCb.checked = false;
        
        const filterName = (document.getElementById('filter-client-name') || {value:''}).value.toLowerCase();
        const minValInput = document.getElementById('filter-client-min');
        const maxValInput = document.getElementById('filter-client-max');
        const filterMin = minValInput ? parseFloat(minValInput.value) : NaN;
        const filterMax = maxValInput ? parseFloat(maxValInput.value) : NaN;
        
        const minQtyInput = document.getElementById('filter-client-qty-min');
        const maxQtyInput = document.getElementById('filter-client-qty-max');
        const filterQtyMin = minQtyInput ? parseInt(minQtyInput.value) : NaN;
        const filterQtyMax = maxQtyInput ? parseInt(maxQtyInput.value) : NaN;
        const filterClientStore = (document.getElementById('filter-client-store') || {value:'all'}).value;

        // Pre-calcula os gastos para poder filtrar e ordenar
        let clientsWithStats = this.clients.map(client => {
            const compras = this.sales.filter(s => s.phone && client.phone && s.phone.replace(/\D/g, '') === client.phone.replace(/\D/g, ''));
            const totalGasto = compras.reduce((acc, curr) => acc + (parseFloat(curr.value) || 0), 0);
            return {
                ...client,
                compras: compras,
                totalGasto: totalGasto
            };
        });
        
        const searchVal = document.getElementById('filter-client-name') ? document.getElementById('filter-client-name').value.toLowerCase().trim() : '';

        const sortSelect = document.getElementById('filter-client-sort');
        const sortVal = sortSelect ? sortSelect.value : 'recent';

        let displayClients = [...clientsWithStats]; // Start with clientsWithStats

        if (searchVal) {
            const cleanSearchPhone = searchVal.replace(/\D/g, '');
            displayClients = displayClients.filter(c => {
                const nameMatch = c.name && c.name.toLowerCase().includes(searchVal);
                const phoneMatch = cleanSearchPhone.length > 0 && c.phone && c.phone.replace(/\D/g, '').includes(cleanSearchPhone);
                return nameMatch || phoneMatch;
            });
        }
        
        if (!isNaN(filterMin) || !isNaN(filterMax) || !isNaN(filterQtyMin) || !isNaN(filterQtyMax)) {
            displayClients = displayClients.filter(c => {
                if (!isNaN(filterMin) && c.totalGasto < filterMin) return false;
                if (!isNaN(filterMax) && c.totalGasto > filterMax) return false;
                if (!isNaN(filterQtyMin) && c.compras.length < filterQtyMin) return false;
                if (!isNaN(filterQtyMax) && c.compras.length > filterQtyMax) return false;
                if (filterClientStore !== 'all' && c.sellerId !== filterClientStore && c.storeId !== filterClientStore) return false;
                return true;
            });
        }
        
        // Aplicar Ordenação
        if (sortVal === 'recent') {
            displayClients.sort((a, b) => b.totalGasto - a.totalGasto);
        } else if (sortVal === 'az') {
            displayClients.sort((a,b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
        } else if (sortVal === 'za') {
            displayClients.sort((a,b) => (b.name || '').localeCompare(a.name || '', 'pt-BR'));
        }

        this.currentFilteredClients = displayClients;

        if (displayClients.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748B; padding: 32px;">Nenhuma cliente encontrada em sua base do Firebase.</td></tr>`;
            return;
        }

        displayClients.forEach(client => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="text-align: center;"><input type="checkbox" class="client-checkbox" value="${client.id}" style="cursor: pointer; width: 16px; height: 16px;"></td>
                <td><strong>${client.name}</strong></td>
                <td>${client.phone}</td>
                <td>${client.compras.length} compra(s)</td>
                <td style="color:var(--primary); font-weight:600;">R$ ${client.totalGasto.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="color:var(--text-muted); font-size:12px; text-transform:capitalize;">${client.sellerName || 'Sistema'}</td>
                <td style="text-align: center;">
                    <button class="btn-icon" style="color: var(--primary); margin-right: 12px;" onclick="app.viewClientHistory('${client.id}')" title="Ver Histórico de Compras">
                        <i class="fas fa-history"></i>
                    </button>
                    <button class="btn-icon" style="color: var(--primary); margin-right: 12px;" onclick="app.editClient('${client.id}')" title="Editar Cliente">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" style="color: #EF4444;" onclick="app.deleteClient('${client.id}')" title="Excluir Cliente">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    },

    toggleSelectAllClients(source) {
        const checkboxes = document.querySelectorAll('.page.active .client-checkbox');
        checkboxes.forEach(cb => cb.checked = source.checked);
    },

    openPromoModal() {
        const checkboxes = document.querySelectorAll('.page.active .client-checkbox:checked, .page.active .sale-checkbox:checked');
        this.selectedClientsForPromo = [];
        if (checkboxes.length > 0) {
            checkboxes.forEach(cb => {
                let client = null;
                if (cb.classList.contains('client-checkbox')) {
                    client = this.clients.find(c => c.id === cb.value || (c.phone && c.phone.replace(/\D/g, '') === cb.value.replace(/\D/g, '')));
                } else if (cb.classList.contains('sale-checkbox')) {
                    const sale = this.sales.find(s => s.id === cb.value);
                    if (sale) {
                        client = this.clients.find(c => c.phone && sale.phone && c.phone.replace(/\D/g, '') === sale.phone.replace(/\D/g, ''));
                        if (!client && sale.name && sale.phone) {
                            client = { id: sale.phone, name: sale.name, phone: sale.phone };
                        }
                    }
                }

                if (client && !this.selectedClientsForPromo.find(x => (x.id === client.id) || (x.phone === client.phone))) {
                    this.selectedClientsForPromo.push(client);
                }
            });
        }
        
        if (this.selectedClientsForPromo.length === 0) {
            this.showToast('Por favor, selecione pelo menos um cliente válido marcando a caixinha na tabela.');
            return;
        }
        
        const modal = document.getElementById('promo-overlay');
        document.getElementById('promo-target-count').innerText = this.selectedClientsForPromo.length;
        document.getElementById('promo-product').value = '';
        document.getElementById('promo-link').value = '';
        
        const selectEl = document.getElementById('promo-template-select');
        if (selectEl) {
            selectEl.innerHTML = '';
            const promoList = Array.isArray(this.msgTemplates.promo) ? this.msgTemplates.promo : [];
            promoList.forEach((tpl, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.innerText = tpl.title;
                selectEl.appendChild(opt);
            });
        }

        this.updatePromoPreview();
        
        if (modal) modal.classList.add('active');
    },

    closePromoModal() {
        const modal = document.getElementById('promo-overlay');
        if (modal) modal.classList.remove('active');
    },

    updatePromoPreview() {
        const prod = document.getElementById('promo-product').value || '[Produto]';
        const link = document.getElementById('promo-link').value || '[Link]';
        const exampleName = this.selectedClientsForPromo && this.selectedClientsForPromo.length > 0 ? this.selectedClientsForPromo[0].name.split(' ')[0] : 'Maria';
        const previewEl = document.getElementById('promo-preview');
        
        const selectEl = document.getElementById('promo-template-select');
        const promoList = Array.isArray(this.msgTemplates.promo) ? this.msgTemplates.promo : [];
        const activeTplText = (selectEl && promoList[selectEl.value]) ? promoList[selectEl.value].text : "Mensagem não configurada.";

        let text = activeTplText.replace(/{nome}/g, exampleName).replace(/{produto}/g, prod || 'produto').replace(/{link}/g, link);
        if (previewEl) previewEl.innerText = text;
    },

    closeHistoryModal() {
        const modal = document.getElementById('history-overlay');
        if (modal) modal.classList.remove('active');
    },

    viewClientHistory(clientId) {
        this.currentHistoryClientId = clientId;
        const client = this.clients.find(c => c.id === clientId);
        if (!client) return;

        const infoContainer = document.getElementById('history-client-info');
        infoContainer.innerHTML = `
            <div style="font-weight: 600; font-size: 16px; color: var(--text-main);">${client.name}</div>
            <div style="color: var(--text-muted); font-size: 14px; margin-top: 4px; display: flex; gap: 12px; align-items: center;">
                <span><i class="fab fa-whatsapp"></i> ${client.phone}</span>
                ${client.email ? `<span><i class="fas fa-envelope"></i> ${client.email}</span>` : ''}
            </div>
        `;
        
        const filterStart = document.getElementById('history-filter-start');
        const filterEnd = document.getElementById('history-filter-end');
        if (filterStart) filterStart.value = '';
        if (filterEnd) filterEnd.value = '';

        this.renderClientHistory();

        const modal = document.getElementById('history-overlay');
        if (modal) modal.classList.add('active');
    },

    renderClientHistory() {
        if (!this.currentHistoryClientId) return;
        const client = this.clients.find(c => c.id === this.currentHistoryClientId);
        if (!client) return;
        
        const fStart = (document.getElementById('history-filter-start') || {value:''}).value;
        const fEnd = (document.getElementById('history-filter-end') || {value:''}).value;

        let compras = this.sales.filter(s => s.phone.replace(/\D/g, '') === client.phone.replace(/\D/g, ''));
        
        if (fStart || fEnd) {
            compras = compras.filter(item => {
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
            });
        }
        
        compras.sort((a, b) => new Date(b.date) - new Date(a.date));

        const content = document.getElementById('history-modal-content');
        if (compras.length === 0) {
            content.innerHTML = '<div class="empty-state" style="padding: 32px;"><i class="fas fa-shopping-bag"></i><p>Nenhuma compra encontrada para os filtros selecionados.</p></div>';
        } else {
            let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
            compras.forEach(sale => {
                const [y, m, d] = sale.date.split('-');
                const saleDate = new Date(y, m-1, d);
                const pDate = saleDate.toLocaleDateString('pt-BR');
                
                const today = new Date();
                today.setHours(0,0,0,0);
                const diffDays = Math.floor((today - saleDate) / (1000 * 60 * 60 * 24));
                let timeText = diffDays <= 0 ? "Hoje" : (diffDays === 1 ? "Ontem" : `Há ${diffDays} dias`);
                
                let timeStatus = `<span style="color:#10B981; font-weight: 500; font-size:12px;"><i class="fas fa-circle" style="font-size:8px; margin-right:4px;"></i>Novo (${timeText})</span>`;
                if (diffDays >= 30) timeStatus = `<span style="color:#F59E0B; font-weight: 500; font-size:12px;"><i class="fas fa-circle" style="font-size:8px; margin-right:4px;"></i>Reposição (${timeText})</span>`;
                if (diffDays >= 90) timeStatus = `<span style="color:#EF4444; font-weight: 500; font-size:12px;"><i class="fas fa-circle" style="font-size:8px; margin-right:4px;"></i>Inativo (${timeText})</span>`;
                if (diffDays >= 180) timeStatus = `<span style="color:#64748B; font-weight: 500; font-size:12px;"><i class="fas fa-circle" style="font-size:8px; margin-right:4px;"></i>Ex-cliente (${timeText})</span>`;

                html += `
                    <div style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: white; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-sm);">
                        <div>
                            <div style="font-weight: 600; color: var(--text-main); margin-bottom: 4px; font-size: 15px;">${sale.product} ${sale.quantity > 1 ? `<span style="color:var(--text-muted); font-weight:500;">x${sale.quantity}</span>` : ''}</div>
                            <div style="color: var(--text-muted); font-size: 13px; display: flex; align-items: center; gap: 8px;">${pDate} • ${timeStatus}</div>
                        </div>
                        <div style="font-weight: 700; color: var(--primary); font-size: 15px;">
                            R$ ${sale.value.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            content.innerHTML = html;
        }
    }
};
