import { db } from '../config/firebase.js';

export const reconciliationModule = {
    reconciliationData: [],

    toggleReconciliationView() {
        const dashboardView = document.getElementById('reconciliation-dashboard-view');
        const uploadView = document.getElementById('reconciliation-upload-view');
        
        if (dashboardView.style.display === 'none') {
            dashboardView.style.display = 'block';
            uploadView.style.display = 'none';
            this.renderReconciliationDashboard();
        } else {
            dashboardView.style.display = 'none';
            uploadView.style.display = 'block';
        }
    },

    renderReconciliationDashboard() {
        const tbody = document.getElementById('reconciliation-dashboard-body');
        if (!tbody) return;

        const filterName = (document.getElementById('rec-filter-name')?.value || '').toLowerCase();
        const filterStatus = document.getElementById('rec-filter-status')?.value || 'pending';
        const filterStartDate = document.getElementById('rec-filter-start-date')?.value;
        const filterEndDate = document.getElementById('rec-filter-end-date')?.value;
        const filterStore = document.getElementById('rec-filter-store')?.value || 'all';

        let pendingTotal = 0;
        let paidTotal = 0;
        let feesTotal = 0;

        // 1. Encontrar todas as vendas com cartão (sem filtrar data ainda)
        let cardSales = this.sales.filter(s => {
            let hasCard = false;
            if (s.payments && s.payments.length > 0) {
                hasCard = s.payments.some(p => p.method === 'credit_card' || p.method === 'debit_card');
            } else {
                hasCard = s.paymentMethod === 'credit_card' || s.paymentMethod === 'debit_card';
            }
            if (!hasCard) return false;
            if (filterStore !== 'all' && s.storeId !== filterStore) return false;
            if (filterName && (!s.name || !s.name.toLowerCase().includes(filterName))) return false;
            return true;
        });

        // 2. Desmembrar em parcelas
        let virtualInstallments = [];

        cardSales.forEach(sale => {
            let saleDate = new Date(sale.date + 'T12:00:00'); // Evita timezone issues

            // Se for múltiplos pagamentos (ex: split card)
            let paymentsToProcess = [];
            if (sale.payments && sale.payments.length > 0) {
                paymentsToProcess = sale.payments.filter(p => p.method === 'credit_card' || p.method === 'debit_card');
            } else {
                paymentsToProcess = [{
                    method: sale.paymentMethod,
                    installments: sale.installments || 1,
                    value: parseFloat(sale.value || 0),
                    cardBrand: sale.cardBrand,
                    nsu: sale.nsu,
                    id: 'card'
                }];
            }

            paymentsToProcess.forEach(p => {
                let totalInst = parseInt(p.installments || 1);
                let instValue = parseFloat(p.value || 0) / totalInst;

                for (let i = 1; i <= totalInst; i++) {
                    let projectedDate = new Date(saleDate.getTime());
                    
                    if (p.method === 'debit_card') {
                        projectedDate.setDate(projectedDate.getDate() + 1); // D+1 para débito
                    } else if (totalInst === 1) {
                        projectedDate.setDate(projectedDate.getDate() + 30); // D+30 para crédito à vista
                    } else {
                        // Parcelado: D + 30*i
                        projectedDate.setDate(projectedDate.getDate() + (30 * i));
                    }

                    let projectedDateStr = projectedDate.toISOString().split('T')[0];
                    
                    let instKey = String(i);
                    if (sale.payments && sale.payments.length > 1) {
                        instKey = `${p.nsu || p.id || 'card'}_${i}`;
                    }

                    let paidInfo = null;
                    if (sale.paidInstallments && sale.paidInstallments[instKey]) {
                        paidInfo = sale.paidInstallments[instKey];
                    } else if (sale.paidInstallments && sale.paidInstallments[i] && !sale.payments) {
                        paidInfo = sale.paidInstallments[i]; // fallback
                    }

                    let isPaid = !!paidInfo;

                    virtualInstallments.push({
                        sale: sale,
                        payment: p,
                        installmentNumber: i,
                        totalInstallments: totalInst,
                        projectedDate: projectedDateStr,
                        originalDate: sale.date,
                        grossValue: instValue,
                        isPaid: isPaid,
                        paidInfo: paidInfo,
                        instKey: instKey
                    });
                }
            });
        });

        // 3. Filtrar as parcelas pela data (filterStartDate, filterEndDate) e pelo status
        let filteredInstallments = virtualInstallments.filter(inst => {
            if (filterStartDate && inst.projectedDate < filterStartDate) return false;
            if (filterEndDate && inst.projectedDate > filterEndDate) return false;
            
            if (filterStatus === 'pending' && inst.isPaid) return false;
            if (filterStatus === 'reconciled' && !inst.isPaid) return false;
            
            return true;
        });

        // 4. Calcular KPIs baseados NAS PARCELAS filtradas
        filteredInstallments.forEach(inst => {
            if (inst.isPaid) {
                paidTotal += parseFloat(inst.paidInfo.netValue || 0);
                feesTotal += parseFloat(inst.paidInfo.fees || 0);
            } else {
                pendingTotal += inst.grossValue;
            }
        });

        const elPending = document.getElementById('stat-rec-pending');
        const elPaid = document.getElementById('stat-rec-paid');
        const elFees = document.getElementById('stat-rec-fees');
        if(elPending) elPending.innerText = `R$ ${pendingTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if(elPaid) elPaid.innerText = `R$ ${paidTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        if(elFees) elFees.innerText = `R$ ${feesTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        if (filteredInstallments.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 32px;">Nenhuma parcela encontrada com os filtros atuais.</td></tr>`;
            return;
        }

        // Ordenar por Data Prevista crescente (o mais próximo a receber primeiro)
        filteredInstallments.sort((a, b) => new Date(a.projectedDate) - new Date(b.projectedDate));

        let html = '';
        filteredInstallments.forEach(inst => {
            const sale = inst.sale;
            
            const pDateParts = inst.projectedDate.split('-');
            const displayDate = `${pDateParts[2]}/${pDateParts[1]}/${pDateParts[0]}`;
            
            const origDateParts = inst.originalDate.split('-');
            const displayOrigDate = `${origDateParts[2]}/${origDateParts[1]}/${origDateParts[0]}`;

            let productsHtml = '';
            if (sale.items && sale.items.length > 0) {
                productsHtml = sale.items.map(i => i.product).join(', ');
            } else {
                productsHtml = sale.product || '-';
            }

            let statusHtml = '';
            let actionBtn = '';
            
            if (inst.isPaid) {
                statusHtml = `<span style="background:#10B981; color:white; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600;"><i class="fas fa-check-double"></i> Recebida</span>`;
                actionBtn = `<button class="btn-icon" style="color: #F59E0B;" onclick="app.unreconcileInstallment('${sale.id}', '${inst.instKey}')" title="Desfazer Baixa Desta Parcela"><i class="fas fa-undo"></i></button>`;
            } else {
                statusHtml = `<span style="background:#EF4444; color:white; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600;"><i class="fas fa-clock"></i> Pendente</span>`;
                actionBtn = `<button class="btn-icon" style="color: #64748B; opacity: 0.5;" title="Nenhuma ação" disabled><i class="fas fa-minus"></i></button>`;
            }

            const saleValueStr = inst.grossValue.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            
            let paidValueDisplay = inst.isPaid ? parseFloat(inst.paidInfo.grossValue || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0,00';
            let pendingValueDisplay = inst.isPaid ? '0,00' : saleValueStr;

            let textMode = inst.payment.method === 'debit_card' ? 'Débito' : 'Crédito';
            let brand = inst.payment.cardBrand ? `<span style="font-size: 11px; display: block; color: var(--text-muted);">${inst.payment.cardBrand}</span>` : '';
            let instHtml = `<div>${brand}${textMode}<br><strong style="color:var(--primary);">Parcela ${inst.installmentNumber}/${inst.totalInstallments}</strong></div>`;

            html += `
                <tr>
                    <td><strong>${sale.name}</strong><br><small style="color:var(--text-muted);">${sale.phone}</small></td>
                    <td>
                        <strong style="color: var(--primary);">${displayDate}</strong><br>
                        <small style="color: var(--text-muted); font-size: 10px;">Venda: ${displayOrigDate}</small>
                    </td>
                    <td><div style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${productsHtml}">${productsHtml}</div></td>
                    <td style="text-align: center;">${instHtml}</td>
                    <td><strong style="color:var(--text-main);">R$ ${saleValueStr}</strong></td>
                    <td><strong style="color:#10B981;">R$ ${paidValueDisplay}</strong></td>
                    <td><strong style="color:#F59E0B;">R$ ${pendingValueDisplay}</strong></td>
                    <td>${statusHtml}</td>
                    <td style="text-align: center;">${actionBtn}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    sortReconciliationData(column) {
        if (!this.reconciliationData || this.reconciliationData.length === 0) return;
        
        if (this.currentSortColumn === column) {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortColumn = column;
            this.currentSortDirection = 'asc'; // Data default is often asc (oldest first), but we can toggle
        }

        this.reconciliationData.sort((a, b) => {
            let valA, valB;
            if (column === 'grossValue') {
                valA = a.extrato.grossValue || 0;
                valB = b.extrato.grossValue || 0;
                return this.currentSortDirection === 'asc' ? valA - valB : valB - valA;
            } else if (column === 'date') {
                valA = new Date(a.extrato.date).getTime() || 0;
                valB = new Date(b.extrato.date).getTime() || 0;
                return this.currentSortDirection === 'asc' ? valA - valB : valB - valA;
            }
            return 0;
        });

        this.renderReconciliationResults();
    },

    processReconciliation() {
        const operatorInput = document.getElementById('reconciliation-operator');
        const operator = operatorInput ? operatorInput.value : 'generic';

        const fileInput = document.getElementById('reconciliation-file');
        if (!fileInput.files || fileInput.files.length === 0) {
            this.showToast('Por favor, selecione um arquivo de extrato primeiro.', 'error');
            return;
        }
        
        const file = fileInput.files[0];
        const ext = file.name.split('.').pop().toLowerCase();
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target.result;
            if (ext === 'csv') {
                this.parseCSV(data, operator);
            } else if (ext === 'xlsx' || ext === 'xls') {
                this.parseExcel(data, operator);
            } else {
                this.showToast('Formato de arquivo não suportado (Apenas CSV e Excel).', 'error');
            }
        };
        
        if (ext === 'csv') {
            reader.readAsText(file);
        } else {
            reader.readAsBinaryString(file);
        }
    },

    handleReconciliationFile(event) {
        const file = event.target.files[0];
        const infoDiv = document.getElementById('reconciliation-file-info');
        if (file) {
            infoDiv.innerText = `Arquivo selecionado: ${file.name}`;
            infoDiv.style.display = 'block';
        } else {
            infoDiv.style.display = 'none';
        }
    },

    parseCSV(csvText, operator) {
        if (typeof Papa !== 'undefined') {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    this.normalizeAndMatchExtrato(results.data, operator);
                }
            });
        } else {
            this.showToast('Erro interno: Biblioteca CSV não carregada.', 'error');
        }
    },

    parseExcel(binaryStr, operator) {
        if (typeof XLSX !== 'undefined') {
            const workbook = XLSX.read(binaryStr, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);
            this.normalizeAndMatchExtrato(json, operator);
        } else {
            this.showToast('Erro interno: Biblioteca Excel não carregada.', 'error');
        }
    },

    normalizeAndMatchExtrato(rawData, operator) {
        if (!rawData || rawData.length === 0) {
            this.showToast('O arquivo parece estar vazio ou tem um formato inválido.', 'error');
            return;
        }

        const normalizedData = [];

        rawData.forEach(row => {
            const getVal = (possibleKeys) => {
                for (const key of Object.keys(row)) {
                    const cleanKey = key.toLowerCase().trim();
                    if (possibleKeys.some(pk => cleanKey === pk || cleanKey.includes(pk))) {
                        return row[key];
                    }
                }
                return null;
            };

            const cleanNum = (val) => {
                if (typeof val === 'number') return val;
                if (!val) return 0;
                return parseFloat(String(val).replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
            };
            
            const cleanDate = (val) => {
                if (!val) return '';
                // Excel serial date check (ex: 45000)
                if (typeof val === 'number' || (String(val).match(/^\d+(\.\d+)?$/) && parseFloat(val) > 30000)) {
                    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                    const days = Math.floor(parseFloat(val));
                    const jsDate = new Date(excelEpoch.getTime() + days * 86400000);
                    return jsDate.toISOString().split('T')[0];
                }
                
                const str = String(val).trim().split(' ')[0]; // Remove timezone ou horas
                const parts = str.split('/');
                if (parts.length === 3) {
                    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2].substring(0,4);
                    return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
                const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
                return str; 
            };

            let date, nsu, grossValue, netValue, brand, product, installments, installmentNo, fees;

            if (operator === 'stone') {
                date = getVal(['data da venda', 'data de venda', 'data transacao']);
                nsu = getVal(['stone id', 'documento']);
                brand = getVal(['bandeira']);
                product = getVal(['produto']);
                installments = getVal(['qtd de parcelas', 'parcelas']);
                installmentNo = getVal(['nº da parcela', 'n da parcela', 'numero da parcela']);
                grossValue = getVal(['valor bruto']);
                netValue = getVal(['valor líquido', 'valor liquido']);
                
                // Em alguns extratos vem descontos separados
                let mdr = cleanNum(getVal(['desconto de mdr', 'mdr']));
                let antecip = cleanNum(getVal(['desconto de antecipação', 'antecipacao']));
                let uni = cleanNum(getVal(['desconto unificado', 'unificado']));
                
                // O desconto total geralmente é a soma (em módulo)
                fees = Math.abs(mdr) + Math.abs(antecip) + Math.abs(uni);
                if (fees === 0 && grossValue && netValue) {
                    fees = cleanNum(grossValue) - cleanNum(netValue);
                }
            } else {
                // Lógica genérica (Tenta adivinhar)
                date = getVal(['data', 'venda', 'pagamento', 'date']);
                nsu = getVal(['nsu', 'autorização', 'cv', 'transação', 'autorizacao', 'doc']);
                grossValue = getVal(['bruto', 'valor da venda', 'valor total']);
                netValue = getVal(['líquido', 'valor líquido', 'recebido', 'liquido']);
                brand = getVal(['bandeira', 'cartao']);
                product = getVal(['produto', 'tipo', 'modalidade']);
                installments = getVal(['parcela', 'qtd']);
                if (grossValue && netValue) {
                    fees = cleanNum(grossValue) - cleanNum(netValue);
                }
            }
            
            // Impede que CNPJs (como a coluna Documento da Stone) sejam confundidos com NSU
            if (nsu && typeof nsu === 'string' && nsu.match(/^\d{2}\.\d{3}\.\d{3}\/\d{4}\-\d{2}$/)) {
                nsu = '';
            }

            if (date && (grossValue !== null || netValue !== null)) {
                let parsedInstallments = parseInt(installments) || 1;
                let parsedInstallmentNo = parseInt(installmentNo) || 1;
                let installmentsDisplay = installmentNo && installments ? `${parsedInstallmentNo}/${parsedInstallments}` : `${parsedInstallments}x`;

                normalizedData.push({
                    date: cleanDate(date),
                    nsu: String(nsu || '').trim(),
                    brand: String(brand || '-').trim(),
                    product: String(product || '-').trim(),
                    installments: parsedInstallments,
                    installmentNo: parsedInstallmentNo,
                    installmentsDisplay: installmentsDisplay,
                    grossValue: cleanNum(grossValue),
                    netValue: cleanNum(netValue),
                    fees: cleanNum(fees || 0),
                    originalRow: row
                });
            }
        });

        this.matchWithCRM(normalizedData);
    },

    matchWithCRM(extratoData) {
        this.reconciliationData = [];
        
        // Busca todas as vendas que ainda não estão totalmente conciliadas
        const pendingSales = this.sales.filter(s => !s.reconciled);

        extratoData.forEach(item => {
            let match = null;
            let status = 'not_found';

            // 1. Tenta match exato por NSU
            if (item.nsu && item.nsu.length > 3) {
                match = pendingSales.find(s => {
                    if (s.payments && s.payments.length > 0) {
                        return s.payments.some(p => p.nsu === item.nsu);
                    }
                    return s.nsu === item.nsu;
                });
            }

            let allMatches = [];
            // 2. Se não achou, tenta match por Data + Valor Bruto
            if (!match) {
                const possibleMatches = pendingSales.filter(s => {
                    const sameDate = s.date === item.date;
                    let expectedValue = 0;
                    if (s.payments && s.payments.length > 0) {
                        s.payments.forEach(p => {
                            if (p.method === 'credit_card' || p.method === 'debit_card') expectedValue += parseFloat(p.value || 0);
                        });
                    } else {
                        expectedValue = parseFloat(s.value) || 0;
                    }
                    
                    if (item.installments > 1) {
                        expectedValue = expectedValue / item.installments;
                    }
                    // Tolerância de centavos
                    const sameValue = Math.abs(expectedValue - item.grossValue) < 0.1;
                    return sameDate && sameValue;
                });

                if (possibleMatches.length === 1) {
                    match = possibleMatches[0];
                } else if (possibleMatches.length > 1) {
                    status = 'divergent'; // Múltiplos
                    match = possibleMatches[0]; // Sugere o primeiro
                    allMatches = possibleMatches;
                }
            }

            if (match) {
                // Checa se essa parcela específica já foi paga e registrada
                if (match.paidInstallments && match.paidInstallments[item.installmentNo]) {
                    status = 'already_paid';
                    // Mantém o match para exibir que é daquela venda, mas status already_paid
                } else {
                    if (status !== 'divergent') status = 'matched';
                }
            }

            this.reconciliationData.push({
                extrato: item,
                crmSale: match,
                status: status,
                possibleMatches: allMatches
            });
        });

        this.renderReconciliationResults();
    },

    renderReconciliationResults() {
        const tbody = document.getElementById('reconciliation-list-body');
        const card = document.getElementById('reconciliation-results-card');
        if (!tbody || !card) return;

        tbody.innerHTML = '';
        
        if (this.reconciliationData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">Nenhum dado válido encontrado no arquivo. Verifique o formato.</td></tr>';
            card.style.display = 'block';
            return;
        }

        let html = '';
        this.reconciliationData.forEach((item, index) => {
            let statusBadge = '';
            if (item.status === 'matched') {
                statusBadge = '<span style="color: #10B981; font-weight: bold;"><i class="fas fa-check-circle"></i></span>';
            } else if (item.status === 'divergent') {
                statusBadge = '<span style="color: #F59E0B; font-weight: bold;" title="Múltiplas vendas com o mesmo valor nesta data."><i class="fas fa-exclamation-circle"></i></span>';
            } else if (item.status === 'already_paid') {
                statusBadge = '<span style="color: #64748B; font-weight: bold;" title="Parcela já registrada como paga."><i class="fas fa-check-double"></i></span>';
            } else {
                statusBadge = '<span style="color: #EF4444; font-weight: bold;"><i class="fas fa-times-circle"></i></span>';
            }

            let crmInfo = '<span style="color: var(--text-muted);">Nenhuma Venda Localizada</span>';
            if (item.status === 'divergent' && item.possibleMatches && item.possibleMatches.length > 1) {
                const namesList = item.possibleMatches.map(m => `<strong>${m.name}</strong>`).join(', ');
                crmInfo = `
                    <div style="font-size: 13px;">
                        <span style="color: #F59E0B; font-weight: 600;"><i class="fas fa-exclamation-triangle"></i> Múltiplas Vendas Encontradas:</span><br>
                        <span style="font-size: 12px; color: var(--text-main); display: inline-block; margin-top: 4px;">${namesList}</span><br>
                        <small style="color: var(--text-muted); display: inline-block; margin-top: 4px;">Utilize o botão 'Vincular' para selecionar a correta.</small>
                    </div>
                `;
            } else if (item.crmSale) {
                let statusText = item.crmSale.paidInstallments ? `(${Object.keys(item.crmSale.paidInstallments).length}/${item.crmSale.installments || item.extrato.installments} pagas)` : '';
                crmInfo = `
                    <div style="font-size: 13px;">
                        <strong>${item.crmSale.name}</strong> <span style="font-size: 11px; color: var(--primary);">${statusText}</span><br>
                        <span style="color: var(--text-muted);">${item.crmSale.product}</span>
                    </div>
                `;
            }

            let actionBtn = '';
            if (item.status === 'matched') {
                 actionBtn = `
                    <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
                        <span style="font-size: 12px; color: #10B981; font-weight: 500;">Pronto para Baixa</span>
                        <button class="btn-icon" style="color: #EF4444; font-size: 11px; padding: 2px 6px; background: #FEE2E2; border-radius: 4px;" onclick="app.unlinkMatch(${index})" title="Desfazer Vínculo"><i class="fas fa-unlink"></i> Desfazer</button>
                    </div>
                 `;
            } else if (item.status === 'already_paid') {
                 actionBtn = `<span style="font-size: 12px; color: #64748B; font-weight: 500;">Parcela já paga</span>`;
            } else {
                 actionBtn = `<button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="app.manualMatch(${index})"><i class="fas fa-link"></i> Vincular</button>`;
            }
            
            let safeDate = item.extrato.date || '';
            let displayDate = safeDate.includes('-') ? safeDate.split('-').reverse().join('/') : safeDate;

            let checkboxHtml = '';
            if (item.status === 'matched') {
                checkboxHtml = `<input type="checkbox" class="reconciliation-checkbox" value="${index}" checked style="cursor: pointer; width: 16px; height: 16px;">`;
            } else {
                checkboxHtml = `<input type="checkbox" disabled style="cursor: not-allowed; width: 16px; height: 16px; opacity: 0.5;">`;
            }

            html += `
                <tr>
                    <td style="text-align: center;">${checkboxHtml}</td>
                    <td style="text-align: center; font-size: 18px;">${statusBadge}</td>
                    <td>${displayDate}</td>
                    <td>${item.extrato.nsu || '-'}</td>
                    <td><div style="font-size: 12px; font-weight: 500;">${item.extrato.brand}</div><div style="font-size: 11px; color: var(--text-muted);">${item.extrato.product}</div></td>
                    <td style="text-align: center; font-weight: 500;">${item.extrato.installmentsDisplay || (item.extrato.installments + 'x')}</td>
                    <td style="font-weight: 500;">R$ ${item.extrato.grossValue.toFixed(2)}</td>
                    <td style="color: #EF4444; font-size: 13px;">R$ ${item.extrato.fees.toFixed(2)}</td>
                    <td style="color: #10B981; font-weight: bold;">R$ ${item.extrato.netValue.toFixed(2)}</td>
                    <td>${crmInfo}</td>
                    <td style="text-align: center;">${actionBtn}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        card.style.display = 'block';
        
        const selectAll = document.getElementById('selectAllReconciliation');
        if (selectAll) selectAll.checked = true;

        this.showToast('Arquivo processado. Verifique os resultados.');
    },

    toggleSelectAllReconciliation(checkbox) {
        const checkboxes = document.querySelectorAll('.reconciliation-checkbox');
        checkboxes.forEach(cb => {
            if (!cb.disabled) cb.checked = checkbox.checked;
        });
    },

    manualMatch(index) {
        this.currentManualMatchIndex = index;
        const item = this.reconciliationData[index];
        
        const extratoInfo = document.getElementById('manual-match-extrato-info');
        if (extratoInfo) {
            let safeDate = item.extrato.date || '';
            let displayDate = safeDate.includes('-') ? safeDate.split('-').reverse().join('/') : safeDate;
            
            extratoInfo.innerHTML = `
                <div style="display: flex; justify-content: space-between;">
                    <span><i class="far fa-calendar"></i> ${displayDate}</span>
                    <span><i class="fas fa-money-bill-wave"></i> R$ ${item.extrato.netValue.toFixed(2)} Líquido</span>
                </div>
                <div style="margin-top: 4px; font-size: 13px;">
                    NSU: <strong>${item.extrato.nsu || 'Não informado'}</strong> | Bandeira: <strong>${item.extrato.brand || '-'}</strong>
                </div>
            `;
        }
        
        const searchInput = document.getElementById('manual-match-search');
        if(searchInput) searchInput.value = '';
        
        this.renderManualMatchSales();
        
        const modal = document.getElementById('manual-match-overlay');
        if (modal) modal.classList.add('active');
    },

    closeManualMatchModal() {
        const modal = document.getElementById('manual-match-overlay');
        if (modal) modal.classList.remove('active');
        this.currentManualMatchIndex = null;
    },

    renderManualMatchSales() {
        const tbody = document.getElementById('manual-match-sales-body');
        if (!tbody) return;
        
        const searchInput = document.getElementById('manual-match-search');
        const searchVal = searchInput ? searchInput.value.toLowerCase() : '';
        const pendingSales = this.sales.filter(s => !s.reconciled);
        
        let filtered = pendingSales;
        const currentItem = this.reconciliationData[this.currentManualMatchIndex];

        if (searchVal) {
            filtered = pendingSales.filter(s => s.name && s.name.toLowerCase().includes(searchVal));
        } else if (currentItem && currentItem.possibleMatches && currentItem.possibleMatches.length > 0) {
            filtered = currentItem.possibleMatches;
        }
        
        // Sort by date (newest first)
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td style="text-align: center; color: var(--text-muted); padding: 16px;">Nenhuma venda pendente encontrada.</td></tr>';
            return;
        }
        
        let html = '';
        filtered.forEach(sale => {
            const [y, m, d] = sale.date.split('-');
            const displayDate = `${d}/${m}/${y}`;
            html += `
                <tr>
                    <td>
                        <strong>${sale.name}</strong><br>
                        <small style="color: var(--text-muted);">${displayDate} - ${sale.product}</small>
                    </td>
                    <td style="text-align: right; font-weight: 500;">
                        R$ ${parseFloat(sale.value || 0).toFixed(2)}
                    </td>
                    <td style="width: 80px; text-align: center;">
                        <button class="btn-primary" style="padding: 4px 12px; font-size: 11px;" onclick="app.confirmManualMatch('${sale.id}')">Vincular</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },

    confirmManualMatch(saleId) {
        if (this.currentManualMatchIndex === null || this.currentManualMatchIndex === undefined) return;
        
        const sale = this.sales.find(s => s.id === saleId);
        if (!sale) return;
        
        this.reconciliationData[this.currentManualMatchIndex].crmSale = sale;
        this.reconciliationData[this.currentManualMatchIndex].status = 'matched';
        
        this.renderReconciliationResults();
        this.closeManualMatchModal();
        this.showToast('Venda vinculada manualmente com sucesso!', 'success');
    },

    unlinkMatch(index) {
        if (this.reconciliationData[index]) {
            this.reconciliationData[index].crmSale = null;
            this.reconciliationData[index].status = 'not_found';
            this.renderReconciliationResults();
            this.showToast('Vínculo desfeito.', 'info');
        }
    },

    async confirmReconciliation() {
        const checkboxes = document.querySelectorAll('.reconciliation-checkbox:checked');
        const selectedIndexes = Array.from(checkboxes).map(cb => parseInt(cb.value));

        const toUpdate = this.reconciliationData.filter((item, index) => 
            item.status === 'matched' && item.crmSale && selectedIndexes.includes(index)
        );
        
        if (toUpdate.length === 0) {
            this.showToast('Selecione pelo menos uma venda pronta para confirmação.', 'error');
            return;
        }

        const btn = document.querySelector('#reconciliation-results-card .btn-primary');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btn.disabled = true;

        try {
            const batch = db.batch();
            toUpdate.forEach(item => {
                const ref = db.collection('sales').doc(item.crmSale.id);
                
                let paidInstallments = item.crmSale.paidInstallments || {};
                // Como uma venda pode ter múltiplos cartões com a mesma parcela "1", usamos um prefixo NSU se possível para evitar sobrescrita
                let instKey = item.extrato.installmentNo;
                if (item.crmSale.payments && item.crmSale.payments.length > 1) {
                    instKey = `${item.extrato.nsu || 'card'}_${item.extrato.installmentNo}`;
                }
                
                paidInstallments[instKey] = {
                    date: item.extrato.date,
                    grossValue: item.extrato.grossValue,
                    netValue: item.extrato.netValue,
                    fees: item.extrato.fees > 0 ? item.extrato.fees : (item.extrato.grossValue - item.extrato.netValue),
                    nsu: item.extrato.nsu
                };

                // Cálculo totalInst atualizado para lidar com array
                let totalInstallments = item.crmSale.installments || item.extrato.installments;
                if (item.crmSale.payments && item.crmSale.payments.length > 0) {
                    let totalInstCalc = 0;
                    item.crmSale.payments.forEach(p => {
                        if (p.method === 'credit_card' || p.method === 'debit_card') {
                            totalInstCalc += parseInt(p.installments || 1);
                        }
                    });
                    if (totalInstCalc > 0) totalInstallments = totalInstCalc;
                }

                let isFullyReconciled = Object.keys(paidInstallments).length >= totalInstallments;

                let totalNetValue = Object.values(paidInstallments).reduce((acc, curr) => acc + curr.netValue, 0);
                let totalFeeValue = Object.values(paidInstallments).reduce((acc, curr) => acc + curr.fees, 0);

                batch.update(ref, {
                    reconciled: isFullyReconciled,
                    paidInstallments: paidInstallments,
                    netValue: totalNetValue,
                    feeValue: totalFeeValue,
                    nsu: item.crmSale.nsu || item.extrato.nsu, // atualiza o NSU se estava vazio
                    brand: item.extrato.brand,
                    productType: item.extrato.product,
                    installments: totalInstallments,
                    reconciledAt: new Date().toISOString()
                });
            });

            await batch.commit();
            this.showToast(`${toUpdate.length} venda(s) baixada(s) com sucesso!`);
            
            // Remove da lista os itens que foram processados com sucesso
            this.reconciliationData = this.reconciliationData.filter((item, index) => !selectedIndexes.includes(index));
            
            // Atualiza os dados se a tabela principal ou dashboard estiverem abertos
            if (typeof this.renderSalesTable === 'function') this.renderSalesTable();
            if (typeof this.renderReconciliationDashboard === 'function') this.renderReconciliationDashboard();
            
            if (this.reconciliationData.length === 0) {
                // Se não sobrou nada na tabela de importação, limpa e volta ao painel
                document.getElementById('reconciliation-file').value = '';
                document.getElementById('reconciliation-file-info').style.display = 'none';
                document.getElementById('reconciliation-results-card').style.display = 'none';
                
                document.getElementById('reconciliation-dashboard-view').style.display = 'block';
                document.getElementById('reconciliation-upload-view').style.display = 'none';
            } else {
                // Se sobraram itens para revisar, atualiza a tabela na tela
                this.renderReconciliationResults();
            }
            
        } catch (error) {
            console.error("Erro ao confirmar conciliação:", error);
            this.showToast('Erro ao salvar conciliação.', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async unreconcileSale(id) {
        if (this.currentUserProfile && this.currentUserProfile.role !== 'admin') {
            if (typeof this.showToast === 'function') this.showToast('Apenas administradores podem desfazer conciliações.', 'error');
            return;
        }

        const sale = this.sales.find(s => s.id === id);
        if (!sale) return;

        this.confirmAction(
            "Desfazer Conciliação Bancária",
            "Atenção: Ao confirmar, esta venda voltará para o status de Pendente de Conciliação, e todo o histórico de parcelas pagas, taxas e valores líquidos será removido. Deseja prosseguir?",
            async () => {
                try {
                    await db.collection('sales').doc(id).update({
                        reconciled: false,
                        reconciledAt: firebase.firestore.FieldValue.delete(),
                        paidInstallments: firebase.firestore.FieldValue.delete(),
                        netValue: firebase.firestore.FieldValue.delete(),
                        feeValue: firebase.firestore.FieldValue.delete(),
                        nsu: firebase.firestore.FieldValue.delete(),
                        brand: firebase.firestore.FieldValue.delete(),
                        installments: firebase.firestore.FieldValue.delete(),
                    });
                    if (typeof this.showToast === 'function') this.showToast('Conciliação desfeita com sucesso!', 'info');
                    if (typeof this.renderReconciliationDashboard === 'function') this.renderReconciliationDashboard();
                } catch(e) {
                    console.error("Erro ao desfazer conciliação:", e);
                    if (typeof this.showToast === 'function') this.showToast('Erro ao desfazer conciliação.', 'error');
                }
            }
        );
    },

    async unreconcileInstallment(saleId, instKey) {
        if (this.currentUserProfile && this.currentUserProfile.role !== 'admin') {
            if (typeof this.showToast === 'function') this.showToast('Apenas administradores podem desfazer conciliações.', 'error');
            return;
        }

        const sale = this.sales.find(s => s.id === saleId);
        if (!sale || !sale.paidInstallments || !sale.paidInstallments[instKey]) return;

        this.confirmAction(
            'Desfazer Baixa da Parcela',
            `Tem certeza que deseja desfazer a baixa bancária apenas desta parcela?`,
            async () => {
                try {
                    let newPaidInstallments = { ...sale.paidInstallments };
                    delete newPaidInstallments[instKey];
                    
                    let totalNetValue = Object.values(newPaidInstallments).reduce((acc, curr) => acc + (parseFloat(curr.netValue) || 0), 0);
                    let totalFeeValue = Object.values(newPaidInstallments).reduce((acc, curr) => acc + (parseFloat(curr.fees) || 0), 0);
                    
                    let totalInstallments = sale.installments || 1;
                    if (sale.payments && sale.payments.length > 0) {
                        let totalInstCalc = 0;
                        sale.payments.forEach(p => {
                            if (p.method === 'credit_card' || p.method === 'debit_card') {
                                totalInstCalc += parseInt(p.installments || 1);
                            }
                        });
                        if (totalInstCalc > 0) totalInstallments = totalInstCalc;
                    }

                    let isFullyReconciled = Object.keys(newPaidInstallments).length >= totalInstallments;

                    const updateData = {
                        reconciled: isFullyReconciled,
                        paidInstallments: newPaidInstallments,
                        netValue: totalNetValue,
                        feeValue: totalFeeValue
                    };

                    await db.collection('sales').doc(saleId).update(updateData);
                    this.showToast('Baixa da parcela desfeita com sucesso.', 'success');
                    if (typeof this.renderReconciliationDashboard === 'function') this.renderReconciliationDashboard();
                } catch (error) {
                    console.error("Erro ao desfazer baixa:", error);
                    this.showToast('Erro ao desfazer baixa.', 'error');
                }
            }
        );
    }
};
