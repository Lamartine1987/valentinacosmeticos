import { db } from '../config/firebase.js';

export const financeModule = {
    setupFinance() {
        const formExpense = document.getElementById('form-expense');
        if (formExpense) {
            formExpense.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.submitExpense(e);
            });
        }
        
        // Setup initial date filter to current month range YYYY-MM-DD
        const financeStart = document.getElementById('finance-filter-start');
        const financeEnd = document.getElementById('finance-filter-end');
        if (financeStart && financeEnd) {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
            financeStart.value = `${y}-${m}-01`;
            financeEnd.value = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
        }

        const descInput = document.getElementById('e-desc');
        if (descInput) {
            descInput.addEventListener('change', (e) => {
                if (!this.expenses) return;
                const val = e.target.value.trim().toLowerCase();
                const match = this.expenses.find(exp => exp.description && exp.description.trim().toLowerCase() === val);
                if (match) {
                    if (match.category) document.getElementById('e-category').value = match.category;
                    if (match.storeId) document.getElementById('e-store').value = match.storeId;
                    if (match.expenseType) document.getElementById('e-type').value = match.expenseType;
                    if (match.amount) document.getElementById('e-amount').value = match.amount;
                }
            });
        }
    },

    async fetchInfraCost() {
        if (!this.currentUserProfile || this.currentUserProfile.role !== 'admin') return;
        
        const card = document.getElementById('fin-infra-card');
        const loader = document.getElementById('fin-infra-loader');
        const statLabel = document.getElementById('fin-stat-infra');
        
        if (!card || !loader || !statLabel) return;

        // If already fetched and cached this session, don't refetch
        if (this._infraCostFetched) return;
        
        card.style.display = 'flex';
        loader.style.display = 'inline-block';
        statLabel.textContent = 'R$ --,--';

        try {
            const user = firebase.auth().currentUser;
            if (!user) throw new Error("Usuário não autenticado");
            const token = await user.getIdToken();

            const getCosts = firebase.functions().httpsCallable('getInfrastructureCosts');
            const result = await getCosts({ token: token });
            
            const resultData = result.data || {};
            
            if (resultData.status === 'success') {
                statLabel.textContent = `R$ ${resultData.finalCost.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
                this._infraCostFetched = true;
            } else if (resultData.status === 'pending') {
                statLabel.textContent = 'R$ 0,00';
                statLabel.parentElement.innerHTML += '<div style="font-size:10px; color:var(--text-muted); margin-top:2px;">Sincronizando BigQuery... (Pode levar até 24h)</div>';
                this._infraCostFetched = true;
            } else {
                statLabel.textContent = 'Erro de Sinc.';
                console.error('Infra error:', resultData.error);
            }
        } catch (e) {
            console.error('Failed to fetch infra costs:', e);
            statLabel.textContent = 'Falha API';
        } finally {
            loader.style.display = 'none';
        }
    },

    async openFirebaseCostHistory() {
        if (!this.currentUserProfile || this.currentUserProfile.role !== 'admin') return;
        
        const modal = document.getElementById('firebase-cost-history-modal');
        if (!modal) return;
        
        const tbody = document.getElementById('firebase-cost-list');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
        }
        
        modal.classList.add('active');

        try {
            const snapshot = await db.collection('firebase_costs').orderBy('period', 'desc').get();
            if (!tbody) return;
            
            if (snapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding: 20px;">Nenhum histórico encontrado. O primeiro faturamento será registrado no próximo dia 1º.</td></tr>';
                return;
            }
            
            tbody.innerHTML = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                
                // Formatar a data de registro
                let dataRegistro = '-';
                if (data.timestamp && data.timestamp.toDate) {
                    const d = data.timestamp.toDate();
                    dataRegistro = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight: 500;">${data.period}</td>
                    <td style="color: #D97706; font-weight: bold;">R$ ${(data.finalCost || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td>${data.currency || 'BRL'}</td>
                    <td style="color: var(--text-muted); font-size: 13px;">${dataRegistro}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error('Erro ao buscar histórico de custos do Firebase:', e);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#EF4444; padding: 20px;">Erro ao carregar o histórico.</td></tr>';
            }
        }
    },

    async submitExpense(e) {
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btn.disabled = true;

        const isEditing = !!this.editingExpenseId;

        const newExpense = {
            description: document.getElementById('e-desc').value.trim(),
            amount: parseFloat(document.getElementById('e-amount').value),
            date: document.getElementById('e-date').value,
            category: document.getElementById('e-category').value,
            storeId: document.getElementById('e-store').value,
            expenseType: document.getElementById('e-type').value,
            createdAt: new Date().toISOString()
        };

        if (this.currentUserProfile && (this.currentUserProfile.role !== 'admin' && this.currentUserProfile.role !== 'manager')) {
            this.showToast('Erro: Apenas administradores ou gestores da loja podem lançar despesas.');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        if (this.user && this.currentUserProfile) {
            newExpense.sellerId = this.user.uid;
            newExpense.sellerName = this.currentUserProfile.name || 'Sistema';
            
            if (this.currentUserProfile.role === 'manager') {
                let sId = this.currentUserProfile.storeId || 'loja_1';
                if (sId === 'matriz') sId = 'loja_1';
                if (sId === 'filial_1') sId = 'loja_2';
                newExpense.storeId = sId;
            }
        }

        try {
            if (isEditing) {
                // Prevent overriding sellerId/createdAt
                const updateData = {
                    description: newExpense.description,
                    amount: newExpense.amount,
                    date: newExpense.date,
                    category: newExpense.category,
                    storeId: newExpense.storeId,
                    expenseType: newExpense.expenseType,
                    updatedAt: new Date().toISOString()
                };
                await db.collection("expenses").doc(this.editingExpenseId).update(updateData);
                this.showToast('Despesa atualizada com sucesso!');
                this.editingExpenseId = null;
            } else {
                await db.collection("expenses").add(newExpense);
                this.showToast('Despesa registrada com sucesso!');
            }
            
            e.target.reset();
            // Refilter to today automatically if date is cleared
            document.getElementById('e-date').value = (new Date(Date.now() - (new Date()).getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            
            // Close the modal
            const modal = document.getElementById('finance-expense-modal');
            if (modal) modal.classList.remove('active');
        } catch (err) {
            console.error(err);
            this.showToast('Erro ao salvar despesa.');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async deleteExpense(id) {
        if (!this.currentUserProfile || (this.currentUserProfile.role !== 'admin' && this.currentUserProfile.role !== 'manager')) return;
        this.confirmAction(
            "Excluir Despesa",
            "Tem certeza que deseja apagar este registro do histórico?",
            async () => {
                try {
                    await db.collection("expenses").doc(id).delete();
                    this.showToast("Despesa excluída com sucesso.");
                } catch(e) {
                    console.error(e);
                    this.showToast("Erro ao excluir.");
                }
            }
        );
    },

    openExpenseModal() {
        this.editingExpenseId = null;
        const form = document.getElementById('form-expense');
        if(form) {
            form.reset();
            document.getElementById('e-date').value = (new Date(Date.now() - (new Date()).getTimezoneOffset() * 60000)).toISOString().split('T')[0];
            const btn = form.querySelector('button[type="submit"]');
            if(btn) btn.innerHTML = '<i class="fas fa-save"></i> Registrar Despesa';
        }
        document.getElementById('finance-expense-modal').classList.add('active');
    },

    editExpense(id) {
        if (!this.expenses) return;
        const exp = this.expenses.find(e => e.id === id);
        if (!exp) return;
        
        this.editingExpenseId = id;
        
        const form = document.getElementById('form-expense');
        if(form) {
            document.getElementById('e-desc').value = exp.description || '';
            document.getElementById('e-amount').value = exp.amount || '';
            document.getElementById('e-date').value = exp.date || '';
            document.getElementById('e-category').value = exp.category || 'Geral';
            document.getElementById('e-store').value = exp.storeId || 'loja_1';
            document.getElementById('e-type').value = exp.expenseType || 'Variável';
            
            const btn = form.querySelector('button[type="submit"]');
            if(btn) btn.innerHTML = '<i class="fas fa-save"></i> Atualizar Despesa';
        }
        document.getElementById('finance-expense-modal').classList.add('active');
    },

    populateCategoryDropdown() {
        const select = document.getElementById('e-category');
        if (!select) return;
        
        select.innerHTML = '';
        if (!this.financeCategories || this.financeCategories.length === 0) {
            const opt = document.createElement('option');
            opt.value = "Geral";
            opt.textContent = "Geral";
            select.appendChild(opt);
            return;
        }

        this.financeCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        });
    },

    renderFinanceCategoriesModal() {
        const modal = document.getElementById('finance-categories-modal');
        if (!modal) return;
        const listContainer = document.getElementById('fin-categories-list');
        listContainer.innerHTML = '';

        if (this.financeCategories && this.financeCategories.length > 0) {
            this.financeCategories.forEach((cat, index) => {
                const item = document.createElement('div');
                item.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background: #F8FAFC; transition: all 0.2s;";
                item.innerHTML = `
                    <span style="font-weight: 500; color: var(--text-main); font-size: 14px;">${cat}</span>
                    <button class="btn-icon" style="color: #EF4444; background: rgba(239, 68, 68, 0.1); width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center;" onclick="if(window.app) app.deleteFinanceCategory(${index})" title="Excluir Categoria">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
                listContainer.appendChild(item);
            });
        } else {
            listContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 14px; background: #F8FAFC; border-radius: 8px; border: 1px dashed var(--border);">Nenhuma categoria customizada.</div>';
        }

        modal.classList.add('active');
    },

    async addFinanceCategory() {
        const input = document.getElementById('new-fin-category');
        if (!input) return;
        let val = input.value.trim();
        if (!val) return;

        let cats = this.financeCategories || [];
        if (cats.includes(val)) {
            this.showToast('Esta categoria já existe!');
            return;
        }

        cats.push(val);
        input.value = '';
        await this.saveFinanceCategories(cats);
    },

    async deleteFinanceCategory(index) {
        if (!this.financeCategories || !this.financeCategories[index]) return;
        let cats = [...this.financeCategories];
        cats.splice(index, 1);
        await this.saveFinanceCategories(cats);
    },

    async saveFinanceCategories(newList) {
        try {
            await db.collection("settings").doc("finance").set({ categories: newList }, { merge: true });
            this.financeCategories = newList;
            this.showToast('Categorias atualizadas!');
            this.renderFinanceCategoriesModal();
            if(this.populateCategoryDropdown) this.populateCategoryDropdown();
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao salvar categorias.');
        }
    },

    renderFinanceDashboard() {
        const fStart = (document.getElementById('finance-filter-start') || {value:''}).value;
        const fEnd = (document.getElementById('finance-filter-end') || {value:''}).value;
        const fStore = (document.getElementById('finance-filter-store') || {value:'all'}).value;

        let totalRevenue = 0;
        let totalExpenses = 0;
        let expensesList = [];
        let expensesByCategoryAll = {};
        let expensesByCategoryLoja1 = {};
        let expensesByCategoryLoja2 = {};

        // Parse target dates
        let startFull = null, endFull = null;
        if (fStart) {
            const [y, m, d] = fStart.split('-');
            startFull = new Date(y, m-1, d);
            startFull.setHours(0,0,0,0);
        }
        if (fEnd) {
            const [y, m, d] = fEnd.split('-');
            endFull = new Date(y, m-1, d);
            endFull.setHours(23,59,59,999);
        }

        // Loop Sales for Revenue matching the date range/store
        if (this.sales) {
            this.sales.forEach(sale => {
                if (!sale.date) return;
                const sparts = sale.date.split('-'); // YYYY-MM-DD
                const sYear = parseInt(sparts[0], 10);
                const sMonth = parseInt(sparts[1], 10);
                const sDay = parseInt(sparts[2] || 1, 10);
                const localSaleDate = new Date(sYear, sMonth-1, sDay);

                if (startFull && localSaleDate < startFull) return;
                if (endFull && localSaleDate > endFull) return;
                if (fStore !== 'all' && sale.storeId !== fStore) return;

                totalRevenue += (sale.value || 0);
            });
        }

        // Loop Expenses matching the date range/store
        if (this.expenses) {
            this.expenses.forEach(exp => {
                if (!exp.date) return;
                const eparts = exp.date.split('-');
                const eYear = parseInt(eparts[0], 10);
                const eMonth = parseInt(eparts[1], 10);
                const eDay = parseInt(eparts[2] || 1, 10);
                const localExpDate = new Date(eYear, eMonth-1, eDay);

                if (startFull && localExpDate < startFull) return;
                if (endFull && localExpDate > endFull) return;
                if (fStore !== 'all' && exp.storeId !== fStore) return;

                totalExpenses += (exp.amount || 0);
                expensesList.push(exp);

                // Group by category for chart
                let cat = exp.category || 'Outros';
                let amt = exp.amount || 0;
                
                expensesByCategoryAll[cat] = (expensesByCategoryAll[cat] || 0) + amt;

                if (exp.storeId === 'loja_1' || exp.storeId === 'matriz') {
                    expensesByCategoryLoja1[cat] = (expensesByCategoryLoja1[cat] || 0) + amt;
                } else if (exp.storeId === 'loja_2' || exp.storeId === 'filial_1') {
                    expensesByCategoryLoja2[cat] = (expensesByCategoryLoja2[cat] || 0) + amt;
                }
            });
        }

        // Sort descending by date
        expensesList.sort((a,b) => {
            const ta = new Date(a.date).getTime();
            const tb = new Date(b.date).getTime();
            return tb - ta;
        });

        // Update Stats Widgets
        const netProfit = totalRevenue - totalExpenses;
        let margin = 0;
        if (totalRevenue > 0) {
            margin = (netProfit / totalRevenue) * 100;
        }

        document.getElementById('fin-stat-revenue').innerText = `R$ ${totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('fin-stat-expenses').innerText = `R$ ${totalExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('fin-stat-profit').innerText = `R$ ${netProfit.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        const marginEl = document.getElementById('fin-stat-margin');
        marginEl.innerText = `${margin.toFixed(1)}%`;
        
        if (netProfit < 0) {
            document.getElementById('fin-stat-profit').style.color = '#EF4444';
            marginEl.style.color = '#EF4444';
        } else {
            document.getElementById('fin-stat-profit').style.color = '#1ed760';
            marginEl.style.color = '#8B5CF6'; // purple default if positive
        }

        // Populate Table
        const tbody = document.getElementById('finance-table-body');
        if (tbody) {
            tbody.innerHTML = '';
            if (expensesList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">Nenhuma despesa lançada neste período.</td></tr>';
            } else {
                expensesList.forEach(exp => {
                    const tr = document.createElement('tr');
                    
                    let dateFmt = "-";
                    if(exp.date) {
                        const [y, m, d] = exp.date.split('-');
                        dateFmt = `${d}/${m}/${y}`;
                    }

                    tr.innerHTML = `
                        <td>${dateFmt}</td>
                        <td style="font-weight: 500;">${exp.description}</td>
                        <td>
                            <span class="c-tag" style="background:#F1F5F9; color:#475569;">${exp.category || 'Geral'}</span>
                            <span class="c-tag" style="background:${exp.expenseType === 'Fixa' ? '#DBEAFE' : '#FFEDD5'}; color:${exp.expenseType === 'Fixa' ? '#1D4ED8' : '#C2410C'}; margin-left:4px;">${exp.expenseType || 'Variável'}</span>
                        </td>
                        <td>${exp.storeId === 'loja_2' ? 'Loja 2' : 'Loja 1'}</td>
                        <td style="color: #EF4444; font-weight: bold;">R$ ${(exp.amount||0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td class="hide-print" style="white-space: nowrap;">
                            <button class="btn-icon" style="color: #3B82F6; margin-right: 8px;" onclick="if(window.app) app.editExpense('${exp.id}')" title="Editar Despesa">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon" style="color: #EF4444;" onclick="if(window.app) app.deleteExpense('${exp.id}')" title="Excluir Despesa">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }

        // Update Print Labels
        const printMonthEl = document.getElementById('print-f-month');
        const printStoreEl = document.getElementById('print-f-store');
        if (printMonthEl) {
            if (fStart || fEnd) {
                let startText = fStart ? fStart.split('-').reverse().join('/') : 'Início';
                let endText = fEnd ? fEnd.split('-').reverse().join('/') : 'Atual';
                if (startText === endText) {
                     printMonthEl.textContent = startText;
                } else {
                     printMonthEl.textContent = `${startText} até ${endText}`;
                }
            } else {
                printMonthEl.textContent = 'Todo Histórico';
            }
        }
        if (printStoreEl) {
            if (fStore === 'loja_1') printStoreEl.textContent = 'Loja 1';
            else if (fStore === 'loja_2') printStoreEl.textContent = 'Loja 2';
            else printStoreEl.textContent = 'Todas as Lojas';
        }

        // Render Chart
        const cardAll = document.getElementById('fin-breakdown-card-all');
        const cardLoja1 = document.getElementById('fin-breakdown-card-loja1');
        const cardLoja2 = document.getElementById('fin-breakdown-card-loja2');

        if (cardAll && cardLoja1 && cardLoja2) {
            if (fStore === 'all') {
                cardAll.style.display = 'flex';
                cardLoja1.style.display = 'flex';
                cardLoja2.style.display = 'flex';
                
                this.drawFinanceChart('all', expensesByCategoryAll);
                this.drawFinanceChart('loja1', expensesByCategoryLoja1);
                this.drawFinanceChart('loja2', expensesByCategoryLoja2);
            } else if (fStore === 'loja_1') {
                cardAll.style.display = 'none';
                cardLoja1.style.display = 'flex';
                cardLoja2.style.display = 'none';

                this.drawFinanceChart('loja1', expensesByCategoryAll); // has only loja_1 data due to early filtering
            } else if (fStore === 'loja_2') {
                cardAll.style.display = 'none';
                cardLoja1.style.display = 'none';
                cardLoja2.style.display = 'flex';

                this.drawFinanceChart('loja2', expensesByCategoryAll); // has only loja_2 data due to early filtering
            }
        } else {
            // Fallback just in case old DOM is still there
            this.drawFinanceChart('all', expensesByCategoryAll);
        }

        this.updateExpenseDescriptionAutocomplete();
    },

    updateExpenseDescriptionAutocomplete() {
        const dataList = document.getElementById('expense-desc-list');
        if (!dataList) return;

        dataList.innerHTML = '';
        if (!this.expenses || this.expenses.length === 0) return;

        const descSet = new Set();
        const uniqueDescs = [];
        
        this.expenses.forEach(exp => {
            if (exp.description) {
                const cleanDesc = exp.description.trim();
                const lowerDesc = cleanDesc.toLowerCase();
                if (cleanDesc && !descSet.has(lowerDesc)) {
                    descSet.add(lowerDesc);
                    uniqueDescs.push(cleanDesc);
                }
            }
        });

        uniqueDescs.sort((a, b) => a.localeCompare(b));

        uniqueDescs.forEach(desc => {
            const opt = document.createElement('option');
            opt.value = desc;
            dataList.appendChild(opt);
        });
    },

    drawFinanceChart(suffix, dataObj) {
        const ctx = document.getElementById(suffix === 'all' && !document.getElementById('chart-expenses-all') ? 'chart-expenses' : `chart-expenses-${suffix}`);
        if (!ctx) return;
        
        if (!window.Chart) {
            console.error("Chart.js is not loaded.");
            return;
        }

        const labels = Object.keys(dataObj);
        const data = Object.values(dataObj);
        
        const total = data.reduce((acc, curr) => acc + curr, 0);
        const totalEl = document.getElementById(`fin-breakdown-total-${suffix}`);
        if (totalEl) {
            totalEl.innerText = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }
        
        // Define standard vivid colors
        const bgColors = [
            '#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#EC4899', '#6366F1', '#14B8A6'
        ];

        // Custom Legends fallback mapping
        const legendContainer = document.getElementById(suffix === 'all' && !document.getElementById('fin-category-legend-all') ? 'fin-category-legend' : `fin-category-legend-${suffix}`);
        if (legendContainer) {
            legendContainer.innerHTML = '';
            labels.forEach((lb, i) => {
                const color = bgColors[i % bgColors.length];
                const vl = data[i];
                legendContainer.innerHTML += `
                    <div style="display:flex; justify-content:space-between; font-size: 13px; padding-bottom: 8px; border-bottom: 1px dashed var(--border);">
                        <span style="display:flex; align-items:center; gap:6px;">
                            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${color};"></span>
                            ${lb}
                        </span>
                        <strong style="color: var(--text-main);">R$ ${vl.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>
                    </div>
                `;
            });

            if(labels.length === 0) {
                 legendContainer.innerHTML = `<span style="font-size: 13px; color: var(--text-muted);">Sem dados gráficos.</span>`;
            }
        }

        if (!this.expenseChartInstances) {
            this.expenseChartInstances = {};
        }

        if (this.expenseChartInstances[suffix]) {
            this.expenseChartInstances[suffix].data.labels = labels;
            this.expenseChartInstances[suffix].data.datasets[0].data = data;
            this.expenseChartInstances[suffix].data.datasets[0].backgroundColor = bgColors.slice(0, labels.length);
            this.expenseChartInstances[suffix].update();
            return;
        }

        this.expenseChartInstances[suffix] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: bgColors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false // we rendered custom legends next to it
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let val = context.raw || 0;
                                return ' R$ ' + val.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }
};
