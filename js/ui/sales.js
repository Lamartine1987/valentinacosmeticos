import { db } from '../config/firebase.js';

export const salesModule = {
    addSaleItem() {
        const container = document.getElementById('sale-items-container');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'sale-item-row';
        row.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; align-items:center; position:relative;';
        row.innerHTML = `
            <div style="flex: 1 1 200px; position:relative;">
                <input type="text" class="sale-item-product" title="Nome do Produto" autocomplete="off" placeholder="Ex: Hidratação..." style="padding:12px 14px; border:1px solid var(--border); border-radius:8px; font-size:14px; width:100%; box-sizing:border-box; outline:none;">
                <div class="product-suggestions autocomplete-suggestions" style="display:none; position:absolute; top:calc(100% + 4px); left:0; width: max-content; min-width: 100%; max-width: 80vw; max-height: 280px; overflow-y: auto; background: white; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100;"></div>
            </div>
            <div style="flex: 0 0 110px; position:relative;" title="Valor Unitário"><span style="position:absolute; left:12px; top:13px; color:#94A3B8; font-size:13px;">R$</span><input type="number" class="sale-item-price" placeholder="0.00" step="0.01" style="padding:12px 8px 12px 34px; border:1px solid var(--border); border-radius:8px; font-size:14px; width:100%; box-sizing:border-box; outline:none;"></div>
            <div style="flex: 0 0 70px;" title="Quantidade"><input type="number" class="sale-item-qty" placeholder="Qtd" min="1" value="1" style="padding:12px 4px; border:1px solid var(--border); border-radius:8px; font-size:14px; text-align:center; width:100%; box-sizing:border-box; outline:none;"></div>
            <div style="flex: 0 0 110px; position:relative;" title="Subtotal do Item"><span style="position:absolute; left:12px; top:13px; color:#94A3B8; font-size:13px;">R$</span><input type="text" class="sale-item-total" readonly placeholder="0.00" style="padding:12px 4px 12px 34px; border:1px solid var(--border); border-radius:8px; font-size:14px; font-weight:bold; color:var(--text-main); background:#F8FAFC; width:100%; box-sizing:border-box; outline:none;"></div>
            <button type="button" title="Excluir Linha" onclick="app.removeSaleItem(this)" style="border:none; background:#FEE2E2; color:#EF4444; border-radius:8px; cursor:pointer; width:44px; height:44px; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="fas fa-times"></i></button>
        `;

        const prodInput = row.querySelector('.sale-item-product');
        const priceInput = row.querySelector('.sale-item-price');
        const qtyInput = row.querySelector('.sale-item-qty');
        const suggDiv = row.querySelector('.product-suggestions');

        prodInput.addEventListener('change', () => {
            if (this.products) {
                const prodName = prodInput.value.trim().toLowerCase();
                const prod = this.products.find(p =>
                    ((p.name && p.name.trim().toLowerCase() === prodName) ||
                        (p.barcode && p.barcode.trim() === prodInput.value.trim())) && p.active !== false
                );
                if (prod && prod.price !== undefined) {
                    priceInput.value = parseFloat(prod.price).toFixed(2);
                }
            }
            this.calculateSaleTotal();
        });

        prodInput.addEventListener('input', () => {
            const val = prodInput.value.toLowerCase().trim();
            suggDiv.innerHTML = '';

            if (val.length < 2) {
                suggDiv.style.display = 'none';
                this.calculateSaleTotal();
                return;
            }

            let matches = [];
            if (this.products) {
                const searchTerms = val.split(' ').filter(t => t.trim() !== '');
                matches = this.products.filter(p => {
                    if (p.active === false) return false;
                    const nameStr = (p.name || '').toLowerCase();
                    const barcodeStr = p.barcode || '';
                    const matchesName = searchTerms.every(term => nameStr.includes(term));
                    const matchesBarcode = barcodeStr.includes(val);
                    return matchesName || matchesBarcode;
                }).slice(0, 15);
            }

            if (matches.length > 0) {
                matches.forEach(m => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'suggestion-item';
                    itemDiv.innerHTML = `
                        <div class="suggestion-name" style="white-space: normal;">${m.name}</div>
                        <div class="suggestion-phone" style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span>Cód: ${m.barcode || '-'}</span>
                            <span style="color:var(--primary); font-weight:bold;">R$ ${parseFloat(m.price || 0).toFixed(2)}</span>
                        </div>
                    `;
                    itemDiv.addEventListener('click', () => {
                        prodInput.value = m.name;
                        suggDiv.style.display = 'none';
                        priceInput.value = parseFloat(m.price || 0).toFixed(2);
                        this.calculateSaleTotal();
                    });
                    suggDiv.appendChild(itemDiv);
                });
                suggDiv.style.display = 'block';
            } else {
                suggDiv.style.display = 'none';
            }
            this.calculateSaleTotal();
        });

        document.addEventListener('click', (e) => {
            if (!row.contains(e.target)) {
                if (suggDiv) suggDiv.style.display = 'none';
            }
        });

        priceInput.addEventListener('input', () => this.calculateSaleTotal());
        qtyInput.addEventListener('input', () => this.calculateSaleTotal());

        container.appendChild(row);
        this.updateRemoveButtons();
    },

    removeSaleItem(btn) {
        const container = document.getElementById('sale-items-container');
        if (!container || container.children.length <= 1) return;
        btn.closest('.sale-item-row').remove();
        this.updateRemoveButtons();
        this.calculateSaleTotal();
    },

    updateRemoveButtons() {
        const container = document.getElementById('sale-items-container');
        if (!container) return;
        const btns = container.querySelectorAll('button');
        btns.forEach(b => { b.style.opacity = container.children.length <= 1 ? '0.3' : '1'; b.disabled = container.children.length <= 1; });
    },

    calculateSaleTotal() {
        if (!this.products) return;
        const rows = document.querySelectorAll('.sale-item-row');
        let total = 0;
        let foundAny = false;

        let criticalWarningHtml = '';
        const warningContainer = document.getElementById('sale-critical-warning');

        rows.forEach(row => {
            const prodInput = row.querySelector('.sale-item-product');
            const qtyInput = row.querySelector('.sale-item-qty');
            const priceInput = row.querySelector('.sale-item-price');
            const totalInput = row.querySelector('.sale-item-total');

            if (prodInput && qtyInput && priceInput) {
                const prodName = prodInput.value.trim();
                const qty = parseInt(qtyInput.value) || 1;
                const price = parseFloat(priceInput.value) || 0;

                const lineTotal = price * qty;
                if (totalInput) totalInput.value = lineTotal.toFixed(2);

                // Try case-insensitive exact match
                const prod = this.products ? this.products.find(p =>
                    ((p.name && p.name.trim().toLowerCase() === prodName.toLowerCase()) ||
                        (p.barcode && p.barcode.trim() === prodName.trim())) && p.active !== false
                ) : null;

                let warningDiv = row.querySelector('.unrecognized-warning');

                if (prodName.length > 0 && !prod) {
                    prodInput.style.borderColor = '#EF4444';

                    if (!warningDiv) {
                        warningDiv = document.createElement('div');
                        warningDiv.className = 'unrecognized-warning';
                        warningDiv.style.cssText = 'flex-basis: 100%; font-size: 13px; color: #EF4444; padding-left: 4px;';
                        row.appendChild(warningDiv);
                    }
                    warningDiv.innerHTML = `⚠️ Produto não localizado no seu catálogo (cadastro invisível). <a href="#" onclick="app.registerUnknownBarcode('${prodName}'); return false;" style="color:var(--primary); font-weight:bold; margin-left:8px;">Cadastrar</a>`;
                } else {
                    prodInput.style.borderColor = 'var(--border)';
                    if (warningDiv) {
                        warningDiv.remove();
                    }

                    if (prod && prod.criticalQty > 0) {
                        let dateStr = prod.criticalDate ? prod.criticalDate.split('-').reverse().join('/') : 'em breve';
                        criticalWarningHtml += `<div style="margin-top: 4px;"><strong>${prod.name}</strong>: Lote vence dia ${dateStr} - Faltam vender ${prod.criticalQty} unidade(s).</div>`;
                    }
                }

                if (prodName.length > 0 || lineTotal > 0) {
                    total += lineTotal;
                    foundAny = true;
                }
            }
        });

        if (warningContainer) {
            if (criticalWarningHtml) {
                warningContainer.innerHTML = `<strong style="font-size: 15px;">⚠️ Atenção - Lote Crítico!</strong> Priorize a venda do(s) seguinte(s) lote(s):<br>` + criticalWarningHtml;
                warningContainer.style.display = 'block';
            } else {
                warningContainer.style.display = 'none';
                warningContainer.innerHTML = '';
            }
        }

        const valueInput = document.getElementById('r-value');
        const discountInput = document.getElementById('r-discount');
        let discount = 0;
        if (discountInput) discount = parseFloat(discountInput.value) || 0;

        const subtotalDisplay = document.getElementById('r-subtotal-display');
        if (subtotalDisplay) subtotalDisplay.innerText = `R$ ${total.toFixed(2)}`;

        if (valueInput) {
            if (foundAny || document.querySelectorAll('.sale-item-row').length > 0 || total > 0) {
                let finalTotal = total - discount;
                if (finalTotal < 0) finalTotal = 0; // Previne valores negativos
                valueInput.value = finalTotal.toFixed(2);
                
                // Auto-preencher o valor se houver apenas uma linha de pagamento
                const paymentRows = document.querySelectorAll('.sale-payment-row');
                if (paymentRows.length === 1) {
                    const singlePaymentInput = paymentRows[0].querySelector('.sale-payment-value');
                    if (singlePaymentInput) {
                        singlePaymentInput.value = finalTotal.toFixed(2);
                    }
                }
            }
        }
        
        if (typeof this.calculateSalePaymentsTotal === 'function') {
            this.calculateSalePaymentsTotal();
        }
    },

    addSalePayment(paymentData = null) {
        const container = document.getElementById('sale-payments-container');
        if (!container) return;

        // Calcular valor restante sugerido
        let suggestedValue = 0;
        const totalFaturadoStr = document.getElementById('r-value') ? document.getElementById('r-value').value : '0';
        const totalFaturado = parseFloat(totalFaturadoStr) || 0;
        
        let sumCurrentPayments = 0;
        const existingInputs = container.querySelectorAll('.sale-payment-value');
        existingInputs.forEach(inp => {
            sumCurrentPayments += parseFloat(inp.value) || 0;
        });

        if (totalFaturado > sumCurrentPayments) {
            suggestedValue = totalFaturado - sumCurrentPayments;
        }

        const row = document.createElement('div');
        row.className = 'sale-payment-row';
        row.style.cssText = 'display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:12px; align-items:end; padding: 12px; background: white; border: 1px solid #E2E8F0; border-radius: 8px; position:relative;';
        
        row.innerHTML = `
            <div>
                <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">Método</label>
                <select class="sale-payment-method" style="padding:10px; border:1px solid var(--border); border-radius:6px; width:100%; outline:none; font-size:13px; cursor:pointer; background: #F8FAFC;">
                    <option value="pix">PIX</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="debit_card">Cartão de Débito</option>
                    <option value="cash">Dinheiro</option>
                    <option value="other">Outro</option>
                </select>
            </div>
            <div>
                <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">Valor (R$)</label>
                <input type="number" class="sale-payment-value" placeholder="0.00" step="0.01" style="padding:10px; border:1px solid var(--border); border-radius:6px; width:100%; outline:none; font-size:13px; font-weight:bold; color:var(--primary);">
            </div>
            <div class="payment-installments-col" style="visibility:hidden;">
                <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">Parcelas</label>
                <input type="number" class="sale-payment-installments" placeholder="1" min="1" max="24" value="1" style="padding:10px; border:1px solid var(--border); border-radius:6px; width:100%; outline:none; font-size:13px;">
            </div>
            <div class="payment-cardbrand-col" style="visibility:hidden;">
                <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">Bandeira <small>(Opcional)</small></label>
                <select class="sale-payment-brand" style="padding:10px; border:1px solid var(--border); border-radius:6px; width:100%; outline:none; font-size:13px; background: #F8FAFC;">
                    <option value="">Selecione...</option>
                    <option value="Visa">Visa</option>
                    <option value="MasterCard">MasterCard</option>
                    <option value="Elo">Elo</option>
                    <option value="Hipercard">Hipercard</option>
                    <option value="Amex">American Express</option>
                    <option value="Outra">Outra</option>
                </select>
            </div>
            <div>
                <label style="font-size:12px; color:var(--text-muted); margin-bottom:4px; display:block;">NSU / ID transação <small>(Opcional)</small></label>
                <input type="text" class="sale-payment-nsu" placeholder="Ex: 175161" style="padding:10px; border:1px solid var(--border); border-radius:6px; width:100%; outline:none; font-size:13px;">
            </div>
            <div style="flex: 0 0 auto; display:flex; align-items:flex-end;">
                <button type="button" onclick="app.removeSalePayment(this)" title="Remover Pagamento" style="height:39px; width:39px; border:none; background:#FEE2E2; color:#EF4444; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        const methodSelect = row.querySelector('.sale-payment-method');
        const installmentsCol = row.querySelector('.payment-installments-col');
        const brandCol = row.querySelector('.payment-cardbrand-col');
        const valueInput = row.querySelector('.sale-payment-value');
        const instInput = row.querySelector('.sale-payment-installments');
        const brandInput = row.querySelector('.sale-payment-brand');
        const nsuInput = row.querySelector('.sale-payment-nsu');

        methodSelect.addEventListener('change', () => {
            const isCard = methodSelect.value === 'credit_card' || methodSelect.value === 'debit_card';
            installmentsCol.style.visibility = methodSelect.value === 'credit_card' ? 'visible' : 'hidden';
            brandCol.style.visibility = isCard ? 'visible' : 'hidden';
        });

        valueInput.addEventListener('input', () => this.calculateSalePaymentsTotal());

        if (paymentData) {
            methodSelect.value = paymentData.method || 'pix';
            valueInput.value = paymentData.value || 0;
            if (paymentData.installments) instInput.value = paymentData.installments;
            if (paymentData.cardBrand) brandInput.value = paymentData.cardBrand;
            if (paymentData.nsu) nsuInput.value = paymentData.nsu;
            methodSelect.dispatchEvent(new Event('change'));
        } else {
            valueInput.value = suggestedValue > 0 ? suggestedValue.toFixed(2) : '';
        }

        container.appendChild(row);
        this.calculateSalePaymentsTotal();
    },

    removeSalePayment(btn) {
        const row = btn.closest('.sale-payment-row');
        if (row) row.remove();
        this.calculateSalePaymentsTotal();
    },

    calculateSalePaymentsTotal() {
        const container = document.getElementById('sale-payments-container');
        if (!container) return;

        let totalPaid = 0;
        const valueInputs = container.querySelectorAll('.sale-payment-value');
        valueInputs.forEach(inp => {
            totalPaid += parseFloat(inp.value) || 0;
        });

        const display = document.getElementById('r-total-paid-display');
        if (display) display.innerText = `R$ ${totalPaid.toFixed(2)}`;

        const totalFaturadoStr = document.getElementById('r-value') ? document.getElementById('r-value').value : '0';
        const totalFaturado = parseFloat(totalFaturadoStr) || 0;

        const warning = document.getElementById('payment-critical-warning');
        const submitBtn = document.getElementById('sale-submit-btn');

        // Allow 2 cents rounding diff
        if (totalFaturado > 0 && Math.abs(totalPaid - totalFaturado) > 0.02) {
            if (warning) warning.style.display = 'block';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.style.opacity = '0.5';
            }
        } else {
            if (warning) warning.style.display = 'none';
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
            }
        }
    },

    deleteSale(id) {
        if (this.currentUserProfile && this.currentUserProfile.role !== 'admin') {
            if (typeof this.showToast === 'function') this.showToast('Sem permissão para excluir vendas do histórico. Contate um Administrador.', 'error');
            const s = this.sales.find(x => x.id === id);
            if (typeof this.saveAuditLog === 'function') this.saveAuditLog('sale', 'attempt_delete', id, `Tentativa de exclusão no Histórico bloqueada.<br><strong>Cliente:</strong> ${s ? s.name + ' (' + s.phone + ')' : id}<br><strong>Item:</strong> ${s ? s.product : 'Desconhecido'}`);
            return;
        }

        this.confirmAction(
            "Excluir Venda",
            "Tem certeza que deseja excluir esta venda do histórico? Esta ação não pode ser desfeita.",
            async () => {
                try {
                    await db.collection("sales").doc(id).delete();
                    this.showToast('Venda excluída do histórico com sucesso!');
                } catch (e) {
                    console.error(e);
                    this.showToast('Erro ao excluir venda.', 'error');
                }
            }
        );
    },

    toggleSaleSelection(id, isChecked) {
        this.selectedSaleIds = this.selectedSaleIds || new Set();
        if (isChecked) {
            this.selectedSaleIds.add(id);
        } else {
            this.selectedSaleIds.delete(id);
        }
    },

    toggleSelectAllSales(checkbox) {
        this.selectedSaleIds = this.selectedSaleIds || new Set();
        const checkboxes = document.querySelectorAll('.sale-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checkbox.checked;
            if (checkbox.checked) {
                this.selectedSaleIds.add(cb.value);
            } else {
                this.selectedSaleIds.delete(cb.value);
            }
        });
    },

    deleteSelectedSales() {
        if (this.currentUserProfile && this.currentUserProfile.role !== 'admin') {
            if (typeof this.showToast === 'function') this.showToast('Sem permissão para exclusões em massa de Vendas.', 'error');
            const checkboxes = document.querySelectorAll('.sale-checkbox:checked');
            if (typeof this.saveAuditLog === 'function') this.saveAuditLog('sale', 'attempt_delete', 'Lote', `Tentativa de exclusão em massa bloqueada.<br><strong>Quantidade Selecionada:</strong> ${checkboxes.length} linha(s) de histórico.`);
            return;
        }

        const checkboxes = document.querySelectorAll('.sale-checkbox:checked');
        const idsToDelete = Array.from(checkboxes).map(cb => cb.value);
        if (idsToDelete.length === 0) {
            this.showToast('Nenhuma venda selecionada para exclusão.');
            return;
        }

        this.confirmAction(
            "Excluir Histórico Opcional",
            `Tem certeza que deseja excluir as ${idsToDelete.length} venda(s) selecionada(s)? Esta ação não pode ser desfeita.`,
            async () => {
                try {
                    const batch = db.batch();
                    idsToDelete.forEach(id => {
                        const ref = db.collection("sales").doc(id);
                        batch.delete(ref);
                    });
                    await batch.commit();
                    this.showToast(`${idsToDelete.length} venda(s) excluída(s) com sucesso!`);
                    const selectAll = document.getElementById('selectAllSales');
                    if (selectAll) selectAll.checked = false;
                    if (this.selectedSaleIds) this.selectedSaleIds.clear();
                } catch (e) {
                    console.error(e);
                    this.showToast('Erro na exclusão em massa.', 'error');
                }
            }
        );
    }
};
