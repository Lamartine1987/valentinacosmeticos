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

    renderReconciliationDashboard(isLoadMore = false) {
        if (isLoadMore !== true) {
            this.recVisibleCount = 50;
        }
        const tbody = document.getElementById('reconciliation-dashboard-body');
        if (!tbody) return;

        const filterName = (document.getElementById('rec-filter-name')?.value || '').toLowerCase();
        const filterStatus = document.getElementById('rec-filter-status')?.value || 'pending';
        const filterStartDate = document.getElementById('rec-filter-start-date')?.value;
        const filterEndDate = document.getElementById('rec-filter-end-date')?.value;
        const filterDateType = document.getElementById('rec-filter-date-type')?.value || 'projected';
        const filterStore = document.getElementById('rec-filter-store')?.value || 'all';
        const filterType = document.getElementById('rec-filter-type')?.value || 'all';

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
            
            if (filterName) {
                let matchName = s.name && s.name.toLowerCase().includes(filterName);
                let matchNsu = false;
                
                if (s.payments && s.payments.length > 0) {
                    matchNsu = s.payments.some(p => p.nsu && String(p.nsu).toLowerCase().includes(filterName));
                }
                if (!matchNsu && s.nsu) {
                    matchNsu = String(s.nsu).toLowerCase().includes(filterName);
                }
                
                if (!matchName && !matchNsu) return false;
            }

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
            const dateToCompare = filterDateType === 'sale' ? inst.originalDate : inst.projectedDate;
            if (filterStartDate && dateToCompare < filterStartDate) return false;
            if (filterEndDate && dateToCompare > filterEndDate) return false;
            
            if (filterStatus === 'pending' && inst.isPaid) return false;
            if (filterStatus === 'reconciled' && !inst.isPaid) return false;
            
            if (filterType === 'credit' && inst.payment.method !== 'credit_card') return false;
            if (filterType === 'debit' && inst.payment.method !== 'debit_card') return false;

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

        let renderInstallments = filteredInstallments;

        if (filterDateType === 'sale') {
            const grouped = {};
            filteredInstallments.forEach(inst => {
                const groupId = `${inst.sale.id}_${inst.payment.id || inst.payment.nsu || 'card'}`;
                if (!grouped[groupId]) {
                    grouped[groupId] = {
                        sale: inst.sale,
                        payment: inst.payment,
                        originalDate: inst.originalDate,
                        projectedDate: inst.originalDate, 
                        totalInstallments: inst.totalInstallments,
                        grossValue: 0,
                        paidValue: 0,
                        pendingValue: 0,
                        allPaid: true,
                        anyPaid: false,
                        isGrouped: true,
                        paidCount: 0
                    };
                }
                grouped[groupId].grossValue += inst.grossValue;
                if (inst.isPaid) {
                    grouped[groupId].paidValue += parseFloat(inst.paidInfo.netValue || 0);
                    grouped[groupId].anyPaid = true;
                    grouped[groupId].paidCount++;
                } else {
                    grouped[groupId].pendingValue += inst.grossValue;
                    grouped[groupId].allPaid = false;
                }
            });
            
            renderInstallments = Object.values(grouped);
            renderInstallments.sort((a, b) => new Date(a.originalDate) - new Date(b.originalDate));
            renderInstallments.sort((a, b) => new Date(a.projectedDate) - new Date(b.projectedDate));
        }

        const visibleInstallments = renderInstallments.slice(0, this.recVisibleCount);

        let html = '';
        visibleInstallments.forEach(inst => {
            const sale = inst.sale;
            
            const pDateParts = inst.projectedDate.split('-');
            const displayDate = `${pDateParts[2]}/${pDateParts[1]}/${pDateParts[0]}`;
            
            const origDateParts = inst.originalDate.split('-');
            const displayOrigDate = `${origDateParts[2]}/${origDateParts[1]}/${origDateParts[0]}`;

            let statusHtml = '';
            let actionBtn = '';
            let instHtml = '';
            const saleValueStr = inst.grossValue.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            let paidValueDisplay = '';
            let pendingValueDisplay = '';

            let textMode = inst.payment.method === 'debit_card' ? 'Débito' : 'Crédito';
            let brand = inst.payment.cardBrand ? `<span style="font-size: 11px; display: block; color: var(--text-muted);">${inst.payment.cardBrand}</span>` : '';

            if (inst.isGrouped) {
                paidValueDisplay = inst.paidValue.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                pendingValueDisplay = inst.pendingValue.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                instHtml = `<div>${brand}${textMode}<br><strong style="color:var(--primary);">Total em ${inst.totalInstallments}x</strong></div>`;

                if (inst.allPaid) {
                    statusHtml = `<span style="background:#10B981; color:white; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600;"><i class="fas fa-check-double"></i> Recebida</span>`;
                } else if (inst.anyPaid) {
                    statusHtml = `<span style="background:#F59E0B; color:white; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600;"><i class="fas fa-adjust"></i> Parcial (${inst.paidCount}/${inst.totalInstallments})</span>`;
                } else {
                    statusHtml = `<span style="background:#EF4444; color:white; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600;"><i class="fas fa-clock"></i> Pendente</span>`;
                }
                actionBtn = `<button class="btn-icon" style="color: #64748B; opacity: 0.5;" title="Filtre por Data Prevista para baixar/desfazer parcelas" disabled><i class="fas fa-layer-group"></i></button>`;
            } else {
                paidValueDisplay = inst.isPaid ? parseFloat(inst.paidInfo.netValue || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0,00';
                pendingValueDisplay = inst.isPaid ? '0,00' : saleValueStr;
                instHtml = `<div>${brand}${textMode}<br><strong style="color:var(--primary);">Parcela ${inst.installmentNumber}/${inst.totalInstallments}</strong></div>`;

                if (inst.isPaid) {
                    if (inst.paidInfo && inst.paidInfo.manual) {
                        statusHtml = `<span style="background:#10B981; color:white; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600;" title="Baixa Manual"><i class="fas fa-hand-holding-usd"></i> Recebida</span>`;
                    } else {
                        statusHtml = `<span style="background:#10B981; color:white; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600;"><i class="fas fa-check-double"></i> Recebida</span>`;
                    }
                    actionBtn = `<button class="btn-icon" style="color: #F59E0B;" onclick="app.unreconcileInstallment('${sale.id}', '${inst.instKey}')" title="Desfazer Baixa Desta Parcela"><i class="fas fa-undo"></i></button>`;
                } else {
                    statusHtml = `<span style="background:#EF4444; color:white; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600;"><i class="fas fa-clock"></i> Pendente</span>`;
                    actionBtn = `<button style="background:#ECFDF5; color:#10B981; border:1px solid #10B981; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px;" onclick="app.openManualReconciliation('${sale.id}', '${inst.instKey}')" title="Dar Baixa Manual"><i class="fas fa-check"></i> Baixar</button>`;
                }
            }

            const sellerName = sale.sellerName || 'Sistema';

            html += `
                <tr>
                    <td>
                        <div style="font-weight: 500;">${sale.name || 'Cliente Diverso'}</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                            ${sale.phone ? `<span>${sale.phone}</span><br>` : ''}
                            Vendedor: <strong>${sellerName}</strong>
                        </div>
                    </td>
                    <td>
                        <strong style="color: var(--primary);">${displayDate}</strong>
                        <div style="font-size: 11px; color: var(--text-muted);">Venda: ${displayOrigDate}</div>
                    </td>
                    <td>${inst.payment.nsu || '-'}</td>
                    <td style="text-align: center;">${instHtml}</td>
                    <td><strong style="color:var(--text-main);">R$ ${saleValueStr}</strong></td>
                    <td><strong style="color:#10B981;">R$ ${paidValueDisplay}</strong></td>
                    <td><strong style="color:#F59E0B;">R$ ${pendingValueDisplay}</strong></td>
                    <td>${statusHtml}</td>
                    <td style="text-align: center;">${actionBtn}</td>
                </tr>
            `;
        });

        // PERFORMANCE: Preservar scroll atual
        const scrollContainer = tbody.closest('.table-responsive') || document.documentElement;
        const currentScroll = scrollContainer.scrollTop || 0;

        tbody.innerHTML = html;

        // Adicionar sentinela para Infinite Scroll no fim da tabela
        if (renderInstallments.length > this.recVisibleCount) {
            const sentinelRow = document.createElement('tr');
            sentinelRow.innerHTML = `<td colspan="9" style="text-align:center; padding: 20px; color: var(--text-muted);"><i class="fas fa-circle-notch fa-spin"></i> Carregando mais parcelas...</td>`;
            tbody.appendChild(sentinelRow);

            if (this.recObserver) this.recObserver.disconnect();
            this.recObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    if (this.recObserver) this.recObserver.disconnect();
                    this.recVisibleCount += 50;
                    this.renderReconciliationDashboard(true);
                }
            }, { rootMargin: '0px 0px 300px 0px' });
            this.recObserver.observe(sentinelRow);
        } else {
            if (this.recObserver) this.recObserver.disconnect();
        }

        if (isLoadMore === true && currentScroll > 0) {
            scrollContainer.scrollTop = currentScroll;
        }
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
            let sheetName = workbook.SheetNames[0];
            
            if (operator === 'rede') {
                const targetSheet = workbook.SheetNames.find(s => s.toLowerCase().includes('pagamentos'));
                if (targetSheet) sheetName = targetSheet;
            } else if (operator === 'getnet') {
                const targetSheet = workbook.SheetNames.find(s => s.toLowerCase().includes('detalhado'));
                if (targetSheet) sheetName = targetSheet;
            }
            
            const worksheet = workbook.Sheets[sheetName];
            console.log(`[Reconciliação] Planilha carregada. Aba selecionada: ${sheetName}`);
            
            // Lógica para encontrar o cabeçalho real (pular linhas de título)
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            let headerRowIndex = 0;
            console.log(`[Reconciliação] Linhas brutas da aba:`, rawData.length);

            for (let i = 0; i < Math.min(20, rawData.length); i++) {
                const row = rawData[i];
                if (!row) continue;
                
                const isHeader = row.some(c => {
                    if (typeof c !== 'string') return false;
                    const str = c.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    return str === 'data original da venda' || 
                           str === 'data da venda' || 
                           str === 'data de venda' || 
                           str === 'data' ||
                           str === 'data de recebimento' ||
                           str === 'nsu/cv' || 
                           str === 'nsu' || 
                           str === 'stone id' || 
                           str === 'documento' ||
                           str === 'numero comprovante de venda (nsu)';
                });
                
                if (isHeader) {
                    headerRowIndex = i;
                    console.log(`[Reconciliação] Cabeçalho detectado na linha índice ${i}:`, row);
                    break;
                }
            }
            
            if (headerRowIndex === 0) {
                console.log(`[Reconciliação] AVISO: Nenhum cabeçalho reconhecido nas primeiras 20 linhas. Usando linha 0.`);
            }

            const json = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });
            console.log(`[Reconciliação] Dados JSON extraídos:`, json.length, `linhas.`);
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
                nsu = getVal(['stone id']) || getVal(['documento']);
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
            } else if (operator === 'rede') {
                const getExact = (possibleKeys) => {
                    for (const key of Object.keys(row)) {
                        const cleanKey = key.toLowerCase().trim();
                        const noAccent = cleanKey.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        if (possibleKeys.includes(cleanKey) || possibleKeys.includes(noAccent)) return row[key];
                    }
                    return null;
                };
                
                date = getExact(['data original da venda']);
                nsu = getExact(['nsu/cv', 'numero da autorizacao', 'número da autorização']);
                brand = getExact(['bandeira']);
                product = getExact(['modalidade']);
                installments = getExact(['numero de parcelas', 'número de parcelas']);
                installmentNo = getExact(['parcela']);
                grossValue = getExact(['valor bruto da parcela original']);
                netValue = getExact(['valor liquido da parcela', 'valor líquido da parcela']);
                
                if (grossValue !== null && netValue !== null) {
                    fees = cleanNum(grossValue) - cleanNum(netValue);
                }
            } else if (operator === 'getnet') {
                date = getVal(['data da venda', 'data de venda', 'data original da venda']);
                nsu = getVal(['número comprovante de venda (nsu)', 'numero comprovante de venda (nsu)', 'comprovante de venda (nsu)', 'nsu']);
                brand = getVal(['bandeira / modalidade', 'bandeira']);
                product = getVal(['lançamento', 'lancamento', 'tipo de lançamento']);
                grossValue = getVal(['valor bruto', 'valor da venda']);
                netValue = getVal(['valor líquido', 'valor liquido', 'valor da parcela']);
                
                let discount = cleanNum(getVal(['desconto', 'taxa']) || 0);
                fees = Math.abs(discount);
                if (fees === 0 && grossValue && netValue) {
                    fees = cleanNum(grossValue) - cleanNum(netValue);
                }
                
                let parcelasStr = getVal(['parcelas']);
                if (parcelasStr && typeof parcelasStr === 'string' && parcelasStr.includes(' de ')) {
                    const parts = parcelasStr.split(' de ');
                    installmentNo = parseInt(parts[0].trim());
                    installments = parseInt(parts[1].trim());
                } else if (parcelasStr && String(parcelasStr).match(/^\d+$/)) {
                    installmentNo = 1;
                    installments = parseInt(parcelasStr);
                }
                console.log(`[Reconciliação Getnet] Linha processada: Data=${date}, NSU=${nsu}, Bruto=${grossValue}, Líquido=${netValue}, Parcelas=${installmentNo}/${installments}`);
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
        
        extratoData.forEach(item => {
            let match = null;
            let status = 'not_found';

            const extratoNsu = String(item.nsu || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

            // 1. Tenta match exato por NSU em TODAS as vendas (inclusive já conciliadas)
            if (extratoNsu) {
                match = this.sales.find(s => {
                    if (s.payments && s.payments.length > 0) {
                        return s.payments.some(p => String(p.nsu || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === extratoNsu);
                    }
                    return String(s.nsu || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === extratoNsu;
                });
            }

            let allMatches = [];
            // 2. Se não achou, tenta match por Data + Valor Bruto
            if (!match) {
                // Para busca por valor, priorizamos apenas as vendas pendentes
                const pendingSales = this.sales.filter(s => !s.reconciled);
                const possibleMatches = pendingSales.filter(s => {
                    const sDateRaw = String(s.date || '').split('T')[0];
                    const extratoDateRaw = String(item.date || '').split('T')[0];
                    
                    // Tolerância de 1 dia na data (ajuste de fechamento de lote na madrugada)
                    const sDateObj = new Date(sDateRaw);
                    const extratoDateObj = new Date(extratoDateRaw);
                    const diffTime = Math.abs(extratoDateObj - sDateObj);
                    const diffDays = diffTime / (1000 * 60 * 60 * 24);
                    const sameDate = diffDays <= 1; 

                    let expectedValue = 0;
                    if (s.payments && s.payments.length > 0) {
                        s.payments.forEach(p => {
                            if (p.method === 'credit_card' || p.method === 'debit_card') expectedValue += parseFloat(p.value || 0);
                        });
                    } else {
                        expectedValue = parseFloat(s.value) || 0;
                    }
                    
                    // Tratamento matemático. Máquinas exportam Valor Bruto total OU Valor Bruto da parcela.
                    const isTotalMatch = Math.abs(expectedValue - item.grossValue) < 0.1;
                    
                    let isInstallmentMatch = false;
                    if (item.installments > 1) {
                        const expectedInstallmentValue = expectedValue / item.installments;
                        isInstallmentMatch = Math.abs(expectedInstallmentValue - item.grossValue) < 0.1;
                    }
                    
                    return sameDate && (isTotalMatch || isInstallmentMatch);
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
                
                let crmNsu = item.crmSale.nsu;
                if (item.crmSale.payments && item.crmSale.payments.length > 0) {
                    const crmPayment = item.crmSale.payments.find(p => p.nsu === item.extrato.nsu) || item.crmSale.payments[0];
                    crmNsu = crmPayment.nsu || crmNsu;
                }

                crmInfo = `
                    <div style="font-size: 13px;">
                        <strong>${item.crmSale.name}</strong> <span style="font-size: 11px; color: var(--primary);">${statusText}</span><br>
                        <span style="color: var(--text-muted);">${item.crmSale.product}</span><br>
                        <span style="color: var(--text-muted); font-size: 11px;">NSU CRM: <strong>${crmNsu || 'Não inf.'}</strong></span>
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
                 actionBtn = `
                    <div style="display: flex; gap: 4px; justify-content: center; flex-direction: column;">
                        <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="app.manualMatch(${index})" title="Vincular à venda existente"><i class="fas fa-link"></i> Vincular</button>
                 `;
                 if (window.app && window.app.user && window.app.user.email === 'teste@teste.com') {
                     actionBtn += `
                        <button class="btn-primary" style="padding: 4px 8px; font-size: 11px; background: #8B5CF6;" onclick="const d = app.reconciliationData[${index}]; app.openRetroactiveSaleModal(d.extrato)" title="Criar Venda a partir do Extrato"><i class="fas fa-plus"></i> Criar Venda</button>
                     `;
                 }
                 actionBtn += `</div>`;
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
                    <td><div style="font-size: 12px; font-weight: 500;">${item.extrato.brand}</div></td>
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
    },

    openManualReconciliation(saleId, instKey) {
        this.currentManualReconcile = { saleId, instKey };
        const sale = this.sales.find(s => s.id === saleId);
        if (!sale) return;

        let instData = null;
        let pIndex = 0;
        let installmentNumber = 1;
        for (let idx = 0; idx < (sale.payments || []).length; idx++) {
            let p = sale.payments[idx];
            if (p.method === 'credit_card' || p.method === 'debit_card') {
                let instCount = parseInt(p.installments || 1);
                for (let j = 1; j <= instCount; j++) {
                    let expectedKey = String(j);
                    if (sale.payments && sale.payments.length > 1) {
                        expectedKey = `${p.nsu || p.id || 'card'}_${j}`;
                    }
                    if (expectedKey === instKey) {
                        instData = p;
                        installmentNumber = j;
                        break;
                    }
                }
            }
            if (instData) break;
        }

        if (!instData) return;

        const grossValue = (parseFloat(instData.value || 0) / parseInt(instData.installments || 1));
        document.getElementById('manual-reconcile-gross').textContent = `R$ ${grossValue.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('manual-reconcile-nsu').value = instData.nsu || '';
        
        // Find expected date
        let expectedDate = sale.date;
        const parts = sale.date.split('-');
        if (parts.length === 3) {
            let d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            if (instData.method === 'credit_card') {
                d.setDate(d.getDate() + (30 * installmentNumber));
            } else {
                d.setDate(d.getDate() + 1);
            }
            expectedDate = d.toISOString().split('T')[0];
        }
        document.getElementById('manual-reconcile-date').value = expectedDate;
        document.getElementById('manual-reconcile-net').value = '';

        document.getElementById('manual-reconcile-overlay').style.display = 'flex';
    },

    closeManualReconciliation() {
        document.getElementById('manual-reconcile-overlay').style.display = 'none';
        this.currentManualReconcile = null;
    },

    async confirmManualReconciliation() {
        if (!this.currentManualReconcile) return;
        const { saleId, instKey } = this.currentManualReconcile;
        
        const sale = this.sales.find(s => s.id === saleId);
        if (!sale) return;

        const nsu = document.getElementById('manual-reconcile-nsu').value.trim();
        const date = document.getElementById('manual-reconcile-date').value;
        const netValueStr = document.getElementById('manual-reconcile-net').value;
        
        if (!date) {
            if (typeof this.showToast === 'function') this.showToast('Preencha a data do recebimento', 'error');
            return;
        }
        if (!netValueStr) {
            if (typeof this.showToast === 'function') this.showToast('Preencha o valor líquido', 'error');
            return;
        }

        const netValue = parseFloat(netValueStr.replace(/\./g, '').replace(',', '.'));

        let instData = null;
        let paymentIndex = -1;
        for (let idx = 0; idx < (sale.payments || []).length; idx++) {
            let p = sale.payments[idx];
            if (p.method === 'credit_card' || p.method === 'debit_card') {
                let instCount = parseInt(p.installments || 1);
                for (let j = 1; j <= instCount; j++) {
                    let expectedKey = String(j);
                    if (sale.payments && sale.payments.length > 1) {
                        expectedKey = `${p.nsu || p.id || 'card'}_${j}`;
                    }
                    if (expectedKey === instKey) {
                        instData = p;
                        paymentIndex = idx;
                        break;
                    }
                }
            }
            if (instData) break;
        }

        if (!instData) return;
        const grossValue = (parseFloat(instData.value || 0) / parseInt(instData.installments || 1));
        const fees = grossValue - netValue;

        if (nsu && instData.nsu !== nsu) {
            sale.payments[paymentIndex].nsu = nsu;
        }

        if (!sale.paidInstallments) sale.paidInstallments = {};
        
        sale.paidInstallments[instKey] = {
            date: date,
            grossValue: grossValue,
            netValue: netValue,
            fees: fees,
            manual: true,
            nsu: nsu || instData.nsu
        };

        // Check if fully reconciled
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
        sale.reconciled = Object.keys(sale.paidInstallments).length >= totalInstallments;
        
        let totalNetValue = Object.values(sale.paidInstallments).reduce((acc, curr) => acc + (parseFloat(curr.netValue) || 0), 0);
        let totalFeeValue = Object.values(sale.paidInstallments).reduce((acc, curr) => acc + (parseFloat(curr.fees) || 0), 0);

        try {
            await db.collection('sales').doc(saleId).update({
                reconciled: sale.reconciled,
                paidInstallments: sale.paidInstallments,
                netValue: totalNetValue,
                feeValue: totalFeeValue,
                payments: sale.payments
            });
            if (typeof this.showToast === 'function') this.showToast('Baixa manual realizada com sucesso!', 'success');
            this.closeManualReconciliation();
            if (typeof this.renderReconciliationDashboard === 'function') this.renderReconciliationDashboard();
        } catch (error) {
            console.error('Erro ao salvar baixa manual', error);
            if (typeof this.showToast === 'function') this.showToast('Erro ao salvar', 'error');
        }
    },

    openRetroactiveSaleModal(extratoItem = null) {
        const form = document.getElementById('form-retroactive-sale');
        if (form) form.reset();

        if (extratoItem) {
            let safeDate = extratoItem.date || '';
            if (safeDate.includes('/')) {
                document.getElementById('rs-date').value = safeDate.split('/').reverse().join('-');
            } else if (safeDate.includes('-')) {
                document.getElementById('rs-date').value = safeDate;
            }
            document.getElementById('rs-value').value = extratoItem.grossValue;
            document.getElementById('rs-payment-method').value = (extratoItem.type === 'debit') ? 'debit_card' : 'credit_card';
            
            // Try matching brand
            const brandSelect = document.getElementById('rs-brand');
            const exBrand = (extratoItem.brand || '').toLowerCase();
            let foundMatch = false;
            for (let i = 0; i < brandSelect.options.length; i++) {
                if (brandSelect.options[i].value.toLowerCase() === exBrand) {
                    brandSelect.selectedIndex = i;
                    foundMatch = true;
                    break;
                }
            }
            if (!foundMatch) brandSelect.value = 'Outros';

            document.getElementById('rs-installments').value = extratoItem.installments || 1;
            document.getElementById('rs-nsu').value = extratoItem.nsu || '';
            
            this._currentRetroactiveExtratoId = extratoItem.nsu || String(Date.now());
        } else {
            this._currentRetroactiveExtratoId = null;
        }
        
        document.getElementById('retroactive-sale-overlay').style.display = 'flex';
    },

    closeRetroactiveSaleModal() {
        document.getElementById('retroactive-sale-overlay').style.display = 'none';
        this._currentRetroactiveExtratoId = null;
    },

    async submitRetroactiveSale(e) {
        e.preventDefault();
        const btn = document.getElementById('rs-submit-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        btn.disabled = true;

        try {
            const val = parseFloat(document.getElementById('rs-value').value) || 0;
            const payMethod = document.getElementById('rs-payment-method').value;
            const inst = parseInt(document.getElementById('rs-installments').value) || 1;
            const brand = document.getElementById('rs-brand').value;
            const nsuVal = document.getElementById('rs-nsu').value;

            const saleData = {
                name: document.getElementById('rs-client').value || 'Cliente Avulso',
                phone: document.getElementById('rs-phone').value || '',
                date: document.getElementById('rs-date').value,
                product: 'Venda Retroativa',
                value: val,
                paymentMethod: payMethod,
                installments: inst,
                cardBrand: brand,
                nsu: nsuVal,
                payments: [{
                    method: payMethod,
                    installments: inst,
                    value: val,
                    cardBrand: brand,
                    nsu: nsuVal,
                    id: 'card'
                }],
                items: [{
                    product: 'Venda Retroativa',
                    quantity: 1,
                    price: val
                }],
                quantity: 1
            };

            await this.saveSale(saleData);
            
            this.closeRetroactiveSaleModal();
            
            if (this._currentRetroactiveExtratoId) {
                // Return to reconciliation upload view and re-process matches if needed
                if (typeof this.processMatches === 'function') {
                    this.processMatches();
                }
            } else {
                this.renderReconciliationDashboard();
            }
        } catch(error) {
            console.error("Erro ao salvar venda retroativa:", error);
            if (typeof this.showToast === 'function') this.showToast('Erro ao salvar venda retroativa.', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};
