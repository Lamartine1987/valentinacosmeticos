export const reportsModule = {
    populateReportFilters() {
        const clientDt = document.getElementById('dt-report-clients');
        const prodDt = document.getElementById('dt-report-products');
        const cityDt = document.getElementById('dt-report-cities');
        if (!clientDt || !prodDt) return;

        clientDt.innerHTML = '';
        prodDt.innerHTML = '';
        if (cityDt) cityDt.innerHTML = '';

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
        
        const uniqueCities = [...new Set(this.clients.map(c => c.city))].filter(Boolean).sort();

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
        
        if (cityDt) {
            uniqueCities.forEach(city => {
                const opt = document.createElement('option');
                opt.value = city;
                cityDt.appendChild(opt);
            });
        }
        
        const sellerFilter = document.getElementById('report-filter-seller');
        if (sellerFilter) {
            const currentSellerVal = sellerFilter.value;
            sellerFilter.innerHTML = '<option value="all">Todos os Membros</option>';
            let sellers = [];
            if (window.app && window.app.teamUsersList) {
                sellers = window.app.teamUsersList.map(u => u.name).filter(Boolean);
            } else {
                sellers = [...new Set(this.sales.map(s => s.sellerName))].filter(Boolean);
            }
            sellers.sort().forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                sellerFilter.appendChild(opt);
            });
            if (currentSellerVal && Array.from(sellerFilter.options).some(opt => opt.value === currentSellerVal)) {
                sellerFilter.value = currentSellerVal;
            } else {
                sellerFilter.value = 'all';
            }
        }
    },

    renderReports() {
        const fStart = (document.getElementById('report-filter-start') || {value:''}).value;
        const fEnd = (document.getElementById('report-filter-end') || {value:''}).value;
        const fClient = (document.getElementById('report-filter-client') || {value:''}).value.trim().toLowerCase();
        const fProd = (document.getElementById('report-filter-product') || {value:''}).value.trim().toLowerCase();
        const fCity = (document.getElementById('report-filter-city') || {value:''}).value.trim().toLowerCase();
        const fStore = (document.getElementById('report-filter-store') || {value:'all'}).value;
        const fSeller = (document.getElementById('report-filter-seller') || {value:'all'}).value;
        const topProductsLimit = parseInt((document.getElementById('report-top-products-limit') || {value: 5}).value) || 5;
        const topClientsLimit = parseInt((document.getElementById('report-top-clients-limit') || {value: 10}).value) || 10;
        const timeGrouping = (document.getElementById('report-time-grouping') || {value: 'month'}).value;

        const printDetails = document.getElementById('print-header-details');
        if (printDetails) {
            const consultorName = fSeller === 'all' ? 'Todos' : fSeller;
            let dateStr = 'Todo o histórico';
            if (fStart && fEnd) dateStr = `De ${fStart.split('-').reverse().join('/')} até ${fEnd.split('-').reverse().join('/')}`;
            else if (fStart) dateStr = `A partir de ${fStart.split('-').reverse().join('/')}`;
            else if (fEnd) dateStr = `Até ${fEnd.split('-').reverse().join('/')}`;
            printDetails.innerText = `Consultor: ${consultorName} | Período: ${dateStr}`;
        }

        if (document.getElementById('lbl-top-products')) {
            document.getElementById('lbl-top-products').innerText = `Top ${topProductsLimit} Produtos Mais Vendidos`;
        }
        if (document.getElementById('lbl-top-clients')) {
            document.getElementById('lbl-top-clients').innerText = `Top ${topClientsLimit} Clientes Mais Valiosos (LTV)`;
        }

        let filteredSales = [...this.sales];

        if (fClient) filteredSales = filteredSales.filter(s => s.name && s.name.toLowerCase().includes(fClient));
        if (fProd) filteredSales = filteredSales.filter(s => s.product && s.product.toLowerCase().includes(fProd));
        if (fStore !== 'all') filteredSales = filteredSales.filter(s => s.storeId === fStore);
        if (fSeller !== 'all') filteredSales = filteredSales.filter(s => s.sellerName === fSeller);
        
        if (fCity) {
            filteredSales = filteredSales.filter(s => {
                const clientObj = this.clients.find(c => (c.phone === s.phone) || (c.name === s.name));
                return clientObj && clientObj.city && clientObj.city.toLowerCase().includes(fCity);
            });
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
        }

        let totalYear = 0;
        let totalMonth = 0;
        let totalDay = 0;
        let allTimeTotal = 0;
        let totalCommissions = 0;
        
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        const currentDay = new Date().getDate();
        
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
        const dailyRevenue = {};
        const yearlyRevenue = {};
        const productCounts = {};
        const clientGlobalAgg = {};
        const storeRevenue = {};
        const sellerCommissions = {};

        filteredSales.forEach(sale => {
            const val = Number(sale.value) || 0;
            allTimeTotal += val;
            
            const sName = (sale.sellerName && sale.sellerName.trim() !== '') ? sale.sellerName : 'Sistema/Desconhecido';
            if (!sellerCommissions[sName]) sellerCommissions[sName] = { count: 0, total: 0, totalRevenue: 0 };
            sellerCommissions[sName].count += 1;
            sellerCommissions[sName].totalRevenue += val;
            
            if (sale.commissionValue) {
                const cv = parseFloat(sale.commissionValue);
                totalCommissions += cv;
                sellerCommissions[sName].total += cv;
            }

            const clientName = (sale.name && sale.name.trim() !== '') ? sale.name.trim() : 'Desconhecido';
            if (!clientGlobalAgg[clientName]) clientGlobalAgg[clientName] = 0;
            clientGlobalAgg[clientName] += val;
            
            const sId = sale.storeId || 'loja_1';
            if (!storeRevenue[sId]) storeRevenue[sId] = 0;
            storeRevenue[sId] += val;

            if (sale.date) {
                const [y, m, dStr] = sale.date.split('-');
                const year = parseInt(y);
                const month = parseInt(m);
                const day = parseInt(dStr || '1');
                
                if (!dailyRevenue[sale.date]) dailyRevenue[sale.date] = 0;
                dailyRevenue[sale.date] += val;
                
                if (!yearlyRevenue[year]) yearlyRevenue[year] = 0;
                yearlyRevenue[year] += val;

                if (year === chartYear) {
                    totalYear += val;
                    monthlyRevenue[month - 1] += val;
                    if (year === currentYear && month === currentMonth) {
                        totalMonth += val;
                        if (day === currentDay) {
                            totalDay += val;
                        }
                    }
                }
            }
            if (sale.items && sale.items.length > 0) {
                sale.items.forEach(item => {
                    const prodName = item.product;
                    if (fProd && !prodName.toLowerCase().includes(fProd)) return;
                    if (!productCounts[prodName]) productCounts[prodName] = {count: 0, value: 0};
                    const qty = parseInt(item.quantity) || 1;
                    productCounts[prodName].count += qty;
                    let itemVal = (parseFloat(item.price) || 0) * qty;
                    if (itemVal === 0 && val > 0) itemVal = val / sale.items.length;
                    productCounts[prodName].value += itemVal;
                });
            } else if (sale.product) {
                const prods = sale.product.split(',').map(p => p.trim());
                if (prods.length > 1) {
                    const valPerProd = val / prods.length;
                    prods.forEach(p => {
                        if (fProd && !p.toLowerCase().includes(fProd)) return;
                        if (!productCounts[p]) productCounts[p] = {count: 0, value: 0};
                        productCounts[p].count += 1;
                        productCounts[p].value += valPerProd;
                    });
                } else {
                    const prodName = sale.product.trim();
                    if (fProd && !prodName.toLowerCase().includes(fProd)) return;
                    if (!productCounts[prodName]) productCounts[prodName] = {count: 0, value: 0};
                    const qty = parseInt(sale.quantity) || 1;
                    productCounts[prodName].count += qty;
                    productCounts[prodName].value += val;
                }
            }
        });

        const sortedProducts = Object.keys(productCounts)
            .map(p => ({ name: p, count: productCounts[p].count, value: productCounts[p].value }))
            .sort((a, b) => b.count - a.count)
            .slice(0, topProductsLimit);
            
        const prodLabels = sortedProducts.map(p => p.name);
        const prodData = sortedProducts.map(p => p.count);

        if (document.getElementById('report-total-year')) {
            const role = (window.app && window.app.currentUserProfile) ? window.app.currentUserProfile.role : 'seller';
            const realTicketAvg = filteredSales.length > 0 ? (allTimeTotal / filteredSales.length) : 0;
            
            if (role === 'seller') {
                if (document.getElementById('lbl-report-total')) document.getElementById('lbl-report-total').innerText = 'Faturamento Mensal';
                if (document.getElementById('lbl-report-month')) document.getElementById('lbl-report-month').innerText = 'Faturamento Diário';
                if (document.getElementById('lbl-report-ticket')) document.getElementById('lbl-report-ticket').innerText = 'Ticket Médio';
                
                document.getElementById('report-total-year').innerText = totalMonth.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
                document.getElementById('report-total-month').innerText = totalDay.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
            } else {
                if (document.getElementById('lbl-report-total')) document.getElementById('lbl-report-total').innerText = 'Faturamento Total';
                if (document.getElementById('lbl-report-month')) document.getElementById('lbl-report-month').innerText = 'Faturamento do Mês';
                if (document.getElementById('lbl-report-ticket')) document.getElementById('lbl-report-ticket').innerText = 'Ticket Médio Geral';
                
                document.getElementById('report-total-year').innerText = allTimeTotal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
                document.getElementById('report-total-month').innerText = totalMonth.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
            }
            
            document.getElementById('report-ticket-avg').innerText = realTicketAvg.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        }
        
        if (document.getElementById('stat-total-commissions')) {
            document.getElementById('stat-total-commissions').innerText = `R$ ${totalCommissions.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }

        let revLabels = [];
        let revData = [];
        let revTitle = 'Faturamento';

        if (timeGrouping === 'day') {
            const sortedDates = Object.keys(dailyRevenue).sort();
            revLabels = sortedDates.map(d => {
                const [y, m, day] = d.split('-');
                return `${day}/${m}`;
            });
            revData = sortedDates.map(d => dailyRevenue[d]);
            revTitle = 'Faturamento Diário';
        } else if (timeGrouping === 'year') {
            const sortedYears = Object.keys(yearlyRevenue).sort();
            revLabels = sortedYears;
            revData = sortedYears.map(y => yearlyRevenue[y]);
            revTitle = 'Faturamento Anual';
        } else {
            revLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            revData = monthlyRevenue;
            revTitle = 'Faturamento (' + chartYear + ')';
        }

        const revCanvas = document.getElementById('chart-revenue');
        if (typeof Chart !== 'undefined' && revCanvas) {
            const ctxRev = revCanvas.getContext('2d');
            if (this.charts.revenue) this.charts.revenue.destroy();
            this.charts.revenue = new Chart(ctxRev, {
                type: 'bar',
                data: {
                    labels: revLabels,
                    datasets: [{
                        label: revTitle,
                        data: revData,
                        backgroundColor: 'rgba(109, 40, 217, 0.7)',
                        borderColor: 'rgba(109, 40, 217, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: { animation: { duration: 0 }, responsive: true, scales: { y: { beginAtZero: true } } }
            });
        }

        const listProducts = document.getElementById('list-top-products');
        if (listProducts) {
            listProducts.innerHTML = '';
            if (sortedProducts.length === 0) {
                listProducts.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; margin-top: 20px;">Nenhum produto vendido no período.</p>';
            } else {
                const maxProdCount = sortedProducts[0].count;
                sortedProducts.forEach((p, idx) => {
                    const pct = Math.max(1, (p.count / maxProdCount) * 100);
                    const row = document.createElement('div');
                    row.style.cssText = "position: relative; padding: 12px; border-bottom: 1px solid var(--border); overflow: hidden;";
                    row.innerHTML = `
                        <div style="position: absolute; top: 0; left: 0; height: 100%; background: var(--primary-light); width: ${pct}%; opacity: 0.6; z-index: 0; border-top-right-radius: 6px; border-bottom-right-radius: 6px; transition: width 0.5s ease;"></div>
                        <div style="position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-weight: bold; color: var(--text-muted); width: 24px;">#${idx + 1}</span>
                                <span style="font-size: 13px; color: var(--text-main); font-weight: 500;">${p.name}</span>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <div style="font-size: 13px; font-weight: bold; color: var(--primary); background: rgba(255,255,255,0.7); border: 1px solid var(--primary-light); padding: 4px 8px; border-radius: 4px; white-space: nowrap; backdrop-filter: blur(2px);">
                                    ${p.count} un
                                </div>
                                <div style="font-size: 13px; font-weight: bold; color: #10B981; background: rgba(255,255,255,0.7); border: 1px solid #DEF7EC; padding: 4px 8px; border-radius: 4px; white-space: nowrap; backdrop-filter: blur(2px);">
                                    R$ ${p.value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                </div>
                            </div>
                        </div>
                    `;
                    listProducts.appendChild(row);
                });
            }
        }

        const listClients = document.getElementById('list-top-clients');
        if (listClients) {
            listClients.innerHTML = '';
            const sortedClients = Object.keys(clientGlobalAgg)
                .filter(c => c !== 'Desconhecido')
                .map(c => ({ name: c, value: clientGlobalAgg[c] }))
                .sort((a, b) => b.value - a.value)
                .slice(0, topClientsLimit);

            if (sortedClients.length === 0) {
                listClients.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; margin-top: 20px;">Nenhum cliente no período.</p>';
            } else {
                const maxClientValue = sortedClients[0].value;
                sortedClients.forEach((c, idx) => {
                    const pct = Math.max(1, (c.value / maxClientValue) * 100);
                    const row = document.createElement('div');
                    row.style.cssText = "position: relative; padding: 12px; border-bottom: 1px solid var(--border); overflow: hidden;";
                    row.innerHTML = `
                        <div style="position: absolute; top: 0; left: 0; height: 100%; background: #DEF7EC; width: ${pct}%; opacity: 0.8; z-index: 0; border-top-right-radius: 6px; border-bottom-right-radius: 6px; transition: width 0.5s ease;"></div>
                        <div style="position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-weight: bold; color: var(--text-muted); width: 24px;">#${idx + 1}</span>
                                <span style="font-size: 13px; color: var(--text-main); font-weight: 500;">${c.name}</span>
                            </div>
                            <div style="font-size: 13px; font-weight: bold; color: #059669; background: rgba(255,255,255,0.7); border: 1px solid #A7F3D0; padding: 4px 8px; border-radius: 4px; white-space: nowrap; backdrop-filter: blur(2px);">
                                R$ ${c.value.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                            </div>
                        </div>
                    `;
                    listClients.appendChild(row);
                });
            }
        }

        const storeTotalsContainer = document.getElementById('report-store-totals');
        if (storeTotalsContainer) {
            storeTotalsContainer.innerHTML = '';
            
            // Reapply seller restriction if needed, but the pie chart is built from filteredSales so it's already accurate
            // except if role=seller we were limiting global total to current month. 
            // The pie chart itself uses storeRevenue which comes directly from filteredSales (without currentMonth check).
            // For sellers we might want to restrict storeRevenue to currentMonth too if we want it to match perfectly.
            const role = (window.app && window.app.currentUserProfile) ? window.app.currentUserProfile.role : 'seller';
            
            let displayRevenue = {};
            if (role === 'seller') {
                filteredSales.forEach(s => {
                    if (s.date) {
                        const [y, m, d] = s.date.split('-');
                        if (parseInt(y) === currentYear && parseInt(m) === currentMonth) {
                            const sId = s.storeId || 'loja_1';
                            if(!displayRevenue[sId]) displayRevenue[sId] = 0;
                            displayRevenue[sId] += (Number(s.value) || 0);
                        }
                    }
                });
            } else {
                displayRevenue = storeRevenue;
            }

            Object.keys(displayRevenue).forEach(k => {
                const sName = k === 'loja_1' ? 'Loja 1' : (k === 'loja_2' ? 'Loja 2' : k);
                const sVal = displayRevenue[k];
                if (sVal > 0) {
                    const storeColor = k === 'loja_1' ? '#10B981' : (k === 'loja_2' ? '#3B82F6' : '#F59E0B');
                    const div = document.createElement('div');
                    div.style.cssText = "text-align: center;";
                    div.innerHTML = `
                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
                            <span style="display:inline-block; width:8px; height:8px; background:${storeColor}; border-radius:50%; margin-right:4px;"></span>${sName}
                        </div>
                        <div style="font-size: 16px; font-weight: bold; color: var(--text-main);">R$ ${sVal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
                    `;
                    storeTotalsContainer.appendChild(div);
                }
            });
            
            if(Object.keys(displayRevenue).length === 0 || Object.values(displayRevenue).every(v => v === 0)) {
                storeTotalsContainer.innerHTML = '<div style="font-size: 13px; color: var(--text-muted);">Sem dados</div>';
            }
        }

        const storeCanvas = document.getElementById('chart-stores');
        if (typeof Chart !== 'undefined' && storeCanvas) {
            const ctxStore = storeCanvas.getContext('2d');
            if (this.charts.stores) this.charts.stores.destroy();
            
            const storeLabels = Object.keys(storeRevenue).map(k => k === 'loja_1' ? 'Loja 1' : (k === 'loja_2' ? 'Loja 2' : k));
            const storeData = Object.keys(storeRevenue).map(k => storeRevenue[k]);
            const hasStoreData = storeData.some(v => v > 0);

            this.charts.stores = new Chart(ctxStore, {
                type: 'doughnut',
                data: {
                    labels: hasStoreData ? storeLabels : ['Nenhuma venda'],
                    datasets: [{
                        data: hasStoreData ? storeData : [1],
                        backgroundColor: hasStoreData ? ['#3B82F6', '#10B981', '#F59E0B'] : ['#E2E8F0'],
                        borderWidth: 0
                    }]
                },
                options: { 
                    animation: { duration: 0 },
                    responsive: true, 
                    maintainAspectRatio: false, 
                    plugins: { 
                         legend: { position: 'bottom' },
                         tooltip: {
                             callbacks: {
                                 label: function(context) {
                                     if (!hasStoreData) return ' R$ 0,00';
                                     return ' R$ ' + context.parsed.toLocaleString('pt-BR', {minimumFractionDigits: 2});
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
        
        const commissionListBody = document.getElementById('report-commission-list');
        const commissionTableContainer = document.getElementById('report-commission-table');
        if (commissionListBody && commissionTableContainer) {
            commissionListBody.innerHTML = '';
            const sellers = Object.keys(sellerCommissions).sort((a,b) => sellerCommissions[b].total - sellerCommissions[a].total);
            
            if (sellers.length === 0) {
                commissionListBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">Nenhuma venda contendo comissão no período.</td></tr>';
            } else {
                sellers.forEach(seller => {
                    const info = sellerCommissions[seller];
                    const avgTicket = info.count > 0 ? info.totalRevenue / info.count : 0;
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td style="text-transform: capitalize;"><strong>${seller}</strong></td>
                        <td style="text-align: center; font-weight: 500; color: var(--text-muted);">${info.count}</td>
                        <td style="text-align: center; font-weight: bold; color: var(--text-main);">R$ ${avgTicket.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style="text-align: right; color: #10B981; font-weight: bold; font-size: 15px;">R$ ${info.total.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    `;
                    commissionListBody.appendChild(row);
                });
            }
            
            if (window.app && window.app.currentUserProfile && window.app.currentUserProfile.role === 'admin') {
                commissionTableContainer.style.display = 'block';
            } else {
                commissionTableContainer.style.display = 'none';
            }
        }
    }
};
