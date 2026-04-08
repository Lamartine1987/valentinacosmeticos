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
        
        // Setup initial month filter to current month YYYY-MM
        const monthFilter = document.getElementById('finance-filter-month');
        if (monthFilter) {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            monthFilter.value = `${y}-${m}`;
        }
    },

    async submitExpense(e) {
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btn.disabled = true;

        const newExpense = {
            description: document.getElementById('e-desc').value.trim(),
            amount: parseFloat(document.getElementById('e-amount').value),
            date: document.getElementById('e-date').value,
            category: document.getElementById('e-category').value,
            storeId: document.getElementById('e-store').value,
            expenseType: document.getElementById('e-type').value,
            createdAt: new Date().toISOString()
        };

        if (this.currentUserProfile && this.currentUserProfile.role !== 'admin') {
            this.showToast('Erro: Apenas administradores podem lançar despesas.');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        if (this.user && this.currentUserProfile) {
            newExpense.sellerId = this.user.uid;
            newExpense.sellerName = this.currentUserProfile.name || 'Sistema';
        }

        try {
            await db.collection("expenses").add(newExpense);
            this.showToast('Despesa registrada com sucesso!');
            e.target.reset();
            // Refilter to today automatically if date is cleared
            document.getElementById('e-date').value = new Date().toISOString().split('T')[0];
            
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
        if (!this.currentUserProfile || this.currentUserProfile.role !== 'admin') return;
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
        const fMonth = (document.getElementById('finance-filter-month') || {value:''}).value; // format YYYY-MM
        const fStore = (document.getElementById('finance-filter-store') || {value:'all'}).value;

        let totalRevenue = 0;
        let totalExpenses = 0;
        let expensesList = [];
        let expensesByCategory = {};

        // Parse target month
        let targetYear = null;
        let targetMonth = null;
        if (fMonth) {
            const parts = fMonth.split('-');
            targetYear = parseInt(parts[0], 10);
            targetMonth = parseInt(parts[1], 10);
        }

        // Loop Sales for Revenue matching the month/store
        if (this.sales) {
            this.sales.forEach(sale => {
                if (!sale.date) return;
                const sparts = sale.date.split('-'); // YYYY-MM-DD
                const sYear = parseInt(sparts[0], 10);
                const sMonth = parseInt(sparts[1], 10);

                if (targetYear !== null && targetMonth !== null) {
                    if (sYear !== targetYear || sMonth !== targetMonth) return;
                }
                if (fStore !== 'all' && sale.storeId !== fStore) return;

                totalRevenue += (sale.value || 0);
            });
        }

        // Loop Expenses matching the month/store
        if (this.expenses) {
            this.expenses.forEach(exp => {
                if (!exp.date) return;
                const eparts = exp.date.split('-');
                const eYear = parseInt(eparts[0], 10);
                const eMonth = parseInt(eparts[1], 10);

                if (targetYear !== null && targetMonth !== null) {
                    if (eYear !== targetYear || eMonth !== targetMonth) return;
                }
                if (fStore !== 'all' && exp.storeId !== fStore) return;

                totalExpenses += (exp.amount || 0);
                expensesList.push(exp);

                // Group by category for chart
                let cat = exp.category || 'Outros';
                expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (exp.amount || 0);
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
                        <td>
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
            if (fMonth) {
                const parts = fMonth.split('-');
                printMonthEl.textContent = `${parts[1]}/${parts[0]}`;
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
        this.drawFinanceChart(expensesByCategory);
    },

    drawFinanceChart(dataObj) {
        const ctx = document.getElementById('chart-expenses');
        if (!ctx) return;
        
        if (!window.Chart) {
            console.error("Chart.js is not loaded.");
            return;
        }

        const labels = Object.keys(dataObj);
        const data = Object.values(dataObj);
        
        // Define standard vivid colors
        const bgColors = [
            '#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#EC4899', '#6366F1', '#14B8A6'
        ];

        // Custom Legends fallback mapping
        const legendContainer = document.getElementById('fin-category-legend');
        if (legendContainer) {
            legendContainer.innerHTML = '';
            labels.forEach((lb, i) => {
                const color = bgColors[i % bgColors.length];
                const vl = data[i];
                legendContainer.innerHTML += `
                    <div style="display:flex; justify-content:space-between; font-size: 13px;">
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

        if (this.expenseChartInstance) {
            this.expenseChartInstance.data.labels = labels;
            this.expenseChartInstance.data.datasets[0].data = data;
            this.expenseChartInstance.data.datasets[0].backgroundColor = bgColors.slice(0, labels.length);
            this.expenseChartInstance.update();
            return;
        }

        this.expenseChartInstance = new Chart(ctx, {
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
