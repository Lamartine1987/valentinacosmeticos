export const reportsModule = {
    populateReportFilters() {
        const clientDt = document.getElementById('dt-report-clients');
        const prodDt = document.getElementById('dt-report-products');
        if (!clientDt || !prodDt) return;

        clientDt.innerHTML = '';
        prodDt.innerHTML = '';

        const uniqueClients = [...new Set(this.sales.map(s => s.name))].filter(Boolean).sort();
        const allProducts = [];
        this.sales.forEach(sale => {
            if (sale.items && sale.items.length > 0) {
                sale.items.forEach(item => allProducts.push(item.product));
            } else if (sale.product) {
                const prods = sale.product.split(',').map(p => p.trim());
                prods.forEach(p => allProducts.push(p));
            }
        });
        const uniqueProducts = [...new Set(allProducts)].filter(Boolean).sort();

        uniqueClients.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            clientDt.appendChild(opt);
        });
        
        uniqueProducts.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            prodDt.appendChild(opt);
        });
    },

    renderReports() {
        const fStart = (document.getElementById('report-filter-start') || {value:''}).value;
        const fEnd = (document.getElementById('report-filter-end') || {value:''}).value;
        const fClient = (document.getElementById('report-filter-client') || {value:''}).value.trim().toLowerCase();
        const fProd = (document.getElementById('report-filter-product') || {value:''}).value.trim().toLowerCase();

        let filteredSales = [...this.sales];

        if (fClient) filteredSales = filteredSales.filter(s => s.name && s.name.toLowerCase().includes(fClient));
        if (fProd) filteredSales = filteredSales.filter(s => s.product && s.product.toLowerCase().includes(fProd));

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
        }

        let totalYear = 0;
        let totalMonth = 0;
        let allTimeTotal = 0;
        
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        
        // Define o ano base para o gráfico
        let chartYear = currentYear;
        if (fStart) {
            chartYear = parseInt(fStart.split('-')[0]);
        } else if (filteredSales.length > 0) {
            let maxYear = 0;
            filteredSales.forEach(s => {
                if (s.date) {
                    const y = parseInt(s.date.split('-')[0]);
                    if (y > maxYear) maxYear = y;
                }
            });
            if (maxYear > 0) chartYear = maxYear;
        }
        
        const monthlyRevenue = Array(12).fill(0);
        const productCounts = {};
        const clientGlobalAgg = {};

        filteredSales.forEach(sale => {
            const val = Number(sale.value) || 0;
            allTimeTotal += val;

            const clientName = (sale.name && sale.name.trim() !== '') ? sale.name.trim() : 'Desconhecido';
            if (!clientGlobalAgg[clientName]) clientGlobalAgg[clientName] = 0;
            clientGlobalAgg[clientName] += val;

            if (sale.date) {
                const [y, m] = sale.date.split('-');
                const year = parseInt(y);
                const month = parseInt(m);
                
                if (year === chartYear) {
                    totalYear += val;
                    monthlyRevenue[month - 1] += val;
                    if (year === currentYear && month === currentMonth) {
                        totalMonth += val;
                    }
                }
            }
            if (sale.items && sale.items.length > 0) {
                sale.items.forEach(item => {
                    const prodName = item.product;
                    if (fProd && !prodName.toLowerCase().includes(fProd)) return;
                    if (!productCounts[prodName]) productCounts[prodName] = 0;
                    productCounts[prodName] += (parseInt(item.quantity) || 1);
                });
            } else if (sale.product) {
                const prods = sale.product.split(',').map(p => p.trim());
                if (prods.length > 1) {
                    prods.forEach(p => {
                        if (fProd && !p.toLowerCase().includes(fProd)) return;
                        if (!productCounts[p]) productCounts[p] = 0;
                        productCounts[p] += 1;
                    });
                } else {
                    const prodName = sale.product.trim();
                    if (fProd && !prodName.toLowerCase().includes(fProd)) return;
                    if (!productCounts[prodName]) productCounts[prodName] = 0;
                    productCounts[prodName] += (parseInt(sale.quantity) || 1);
                }
            }
        });

        const sortedProducts = Object.keys(productCounts)
            .map(p => ({ name: p, count: productCounts[p] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
            
        const prodLabels = sortedProducts.map(p => p.name);
        const prodData = sortedProducts.map(p => p.count);

        if (document.getElementById('report-total-year')) {
            document.getElementById('report-total-year').innerText = allTimeTotal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
            document.getElementById('report-total-month').innerText = totalMonth.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
            const realTicketAvg = filteredSales.length > 0 ? (allTimeTotal / filteredSales.length) : 0;
            document.getElementById('report-ticket-avg').innerText = realTicketAvg.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        }

        const revCanvas = document.getElementById('chart-revenue');
        if (typeof Chart !== 'undefined' && revCanvas) {
            const ctxRev = revCanvas.getContext('2d');
            if (this.charts.revenue) this.charts.revenue.destroy();
            this.charts.revenue = new Chart(ctxRev, {
                type: 'bar',
                data: {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                    datasets: [{
                        label: 'Faturamento (' + chartYear + ')',
                        data: monthlyRevenue,
                        backgroundColor: 'rgba(109, 40, 217, 0.7)',
                        borderColor: 'rgba(109, 40, 217, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: { responsive: true, scales: { y: { beginAtZero: true } } }
            });
        }

        const prodCanvas = document.getElementById('chart-products');
        if (typeof Chart !== 'undefined' && prodCanvas) {
            const ctxProd = prodCanvas.getContext('2d');
            if (this.charts.products) this.charts.products.destroy();
            
            const hasData = prodData.length > 0;

            this.charts.products = new Chart(ctxProd, {
                type: 'doughnut',
                data: {
                    labels: hasData ? prodLabels : ['Nenhuma venda encontrada'],
                    datasets: [{
                        data: hasData ? prodData : [1],
                        backgroundColor: hasData ? ['#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#3B82F6'] : ['#E2E8F0'],
                        borderWidth: 0
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    plugins: { 
                         legend: { position: 'bottom' },
                         tooltip: {
                             callbacks: {
                                 label: function(context) {
                                     if (!hasData) return ' 0 unidades vendidas';
                                     return ' ' + context.formattedValue + ' unidades vendidas';
                                 }
                             }
                         }
                    } 
                }
            });
        }

        const topClientsCanvas = document.getElementById('chart-top-clients');
        if (typeof Chart !== 'undefined' && topClientsCanvas) {
            const ctxTopClients = topClientsCanvas.getContext('2d');
            if (this.charts.topClients) this.charts.topClients.destroy();
            
            const sortedClients = Object.keys(clientGlobalAgg)
                .filter(c => c !== 'Desconhecido')
                .map(c => ({ name: c, value: clientGlobalAgg[c] }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 10);
                
            const hasClientData = sortedClients.length > 0;
            const clientLabels = hasClientData ? sortedClients.map(c => c.name) : ['Nenhuma venda encontrada'];
            const clientData = hasClientData ? sortedClients.map(c => c.value) : [0];

            this.charts.topClients = new Chart(ctxTopClients, {
                type: 'bar',
                data: {
                    labels: clientLabels,
                    datasets: [{
                        label: 'Total Comprado (R$)',
                        data: clientData,
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: { 
                    responsive: true,
                    indexAxis: 'y',
                    scales: { 
                        x: { 
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return 'R$ ' + value;
                                }
                            }
                        } 
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    if (!hasClientData) return ' R$ 0,00';
                                    return ' R$ ' + context.parsed.x.toLocaleString('pt-BR', {minimumFractionDigits: 2});
                                }
                            }
                        }
                    }
                }
            });
        }

        const filteredClientsContainer = document.getElementById('report-filtered-clients');
        const filteredClientsList = document.getElementById('report-clients-list');

        if ((fProd || fClient || fStart || fEnd) && filteredClientsContainer && filteredClientsList) {
            filteredClientsContainer.style.display = 'block';
            filteredClientsList.innerHTML = '';
            
            const clientAgg = {};
            filteredSales.forEach(s => {
                if (s.name && s.name.trim() !== '') {
                    if (!clientAgg[s.name]) {
                        clientAgg[s.name] = { totalQty: 0, totalValue: 0 };
                    }
                    clientAgg[s.name].totalQty += (parseInt(s.quantity) || 1);
                    const val = Number(s.value) || 0;
                    clientAgg[s.name].totalValue += val;
                }
            });
            
            const uniqueClientNames = Object.keys(clientAgg).sort((a, b) => {
                if (clientAgg[b].totalQty !== clientAgg[a].totalQty) return clientAgg[b].totalQty - clientAgg[a].totalQty;
                return clientAgg[b].totalValue - clientAgg[a].totalValue;
            });
            
            if (uniqueClientNames.length === 0) {
                 filteredClientsList.innerHTML = '<p style="color: var(--text-muted); font-size: 14px; padding: 12px; border: 1px dashed var(--border); text-align: center; border-radius: 8px;">Nenhum cliente atende aos filtros atuais.</p>';
            } else {
                 uniqueClientNames.forEach(cName => {
                     const clientObj = this.clients.find(c => c.name === cName);
                     const clientPhone = clientObj && clientObj.phone ? clientObj.phone : 'Não cadastrado';
                     const qtyInfo = clientAgg[cName];
                     
                     const div = document.createElement('div');
                     div.style.cssText = "display:flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: 0.2s;";
                     div.innerHTML = `
                        <div style="display:flex; align-items: center; gap: 12px;">
                            <div style="background: #E0E7FF; color: #4F46E5; width: 40px; height: 40px; border-radius: 50%; display:flex; align-items:center; justify-content:center; font-weight: bold; font-size: 16px;">
                                ${cName.charAt(0).toUpperCase()}
                            </div>
                            <div style="display:flex; flex-direction: column; gap: 4px;">
                                <h4 style="font-size: 14px; font-weight: 600; color: var(--text-main); margin: 0;">${cName}</h4>
                                <span style="font-size: 12px; color: var(--text-muted); margin: 0;"><i class="fab fa-whatsapp" style="color: #25D366; margin-right: 4px; font-size: 12px;"></i>${clientPhone}</span>
                            </div>
                        </div>
                        <div style="text-align: right; display: flex; flex-direction: column; justify-content: center; gap: 4px;">
                            <span style="display: inline-block; background: #FEF3C7; color: #D97706; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">${qtyInfo.totalQty} Unidade${qtyInfo.totalQty > 1 ? 's' : ''}</span>
                            <span style="font-size: 12px; color: var(--text-main); font-weight: 700;">R$ ${qtyInfo.totalValue.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                     `;
                     filteredClientsList.appendChild(div);
                 });
            }
        } else if (filteredClientsContainer) {
            filteredClientsContainer.style.display = 'none';
        }
    }
};
