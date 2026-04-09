import { db } from '../config/firebase.js';

export const productsModule = {
    currentProductPage: 1,
    productsPerPage: 50,
    _lastProductFilter: '',
    selectedProductIds: new Set(),

    editProduct(id) {
        const prod = this.products.find(p => p.id === id);
        if(!prod) return;
        this.editingProductId = id;
        document.getElementById('p-name').value = prod.name || '';
        document.getElementById('p-barcode').value = prod.barcode || '';
        document.getElementById('p-category').value = prod.category || '';
        document.getElementById('p-price').value = prod.price || '';
        document.getElementById('product-form-title').innerText = "Editar Produto";
        document.getElementById('product-form-desc').innerText = "Atualize as informações deste item no catálogo.";
        document.getElementById('product-submit-text').innerText = "Atualizar Produto";
        this.navigateTo('product-register');
    },

    cancelProductEdit() {
        this.editingProductId = null;
        const form = document.getElementById('form-product');
        if(form) form.reset();
        document.getElementById('product-form-title').innerText = "Registrar Produto";
        document.getElementById('product-form-desc').innerText = "Cadastre um novo item no seu catálogo.";
        document.getElementById('product-submit-text').innerText = "Salvar Produto";
        this.navigateTo('products');
        this.navigateTo('products');
    },

    async deleteProduct(id) {
        this.confirmAction(
            "Excluir Produto",
            "Tem certeza que deseja excluir este produto do catálogo? Esta ação não pode ser desfeita.",
            async () => {
                try {
                    await db.collection('products').doc(id).delete();
                    if (typeof this.showToast === 'function') this.showToast('Produto excluído com sucesso!', 'info');
                } catch(e) {
                    console.error("Erro ao excluir produto:", e);
                    if (typeof this.showToast === 'function') this.showToast('Erro ao excluir produto.', 'error');
                }
            }
        );
    },

    async deleteSelectedProducts() {
        if (this.selectedProductIds.size === 0) {
            if (typeof this.showToast === 'function') this.showToast('Selecione pelo menos um produto para excluir.', 'warning');
            return;
        }

        this.confirmAction(
            "Excluir Produtos em Massa",
            `Tem certeza que deseja excluir ${this.selectedProductIds.size} produto(s)? Esta ação não pode ser desfeita.`,
            async () => {
                try {
                    const batch = db.batch();
                    this.selectedProductIds.forEach(id => {
                        const docRef = db.collection('products').doc(id);
                        batch.delete(docRef);
                    });
                    await batch.commit();
                    if (typeof this.showToast === 'function') this.showToast(`${this.selectedProductIds.size} produto(s) excluído(s)!`, 'info');
                    
                    this.selectedProductIds.clear();
                    const selectAllCb = document.querySelector('.page.active th input[type="checkbox"]');
                    if (selectAllCb) selectAllCb.checked = false;
                    this.renderProductsList();
                } catch(e) {
                    console.error("Erro exclusão de produtos em massa:", e);
                    if (typeof this.showToast === 'function') this.showToast('Erro ao excluir produtos.', 'error');
                }
            }
        );
    },

    async toggleSelectedProductsStatus(makeActive) {
        if (this.selectedProductIds.size === 0) {
            if (typeof this.showToast === 'function') this.showToast('Selecione pelo menos um produto.', 'warning');
            return;
        }

        const actionText = makeActive ? 'Ativar' : 'Inativar';
        this.confirmAction(
            `${actionText} Produtos Selecionados`,
            `Deseja realmente ${actionText.toLowerCase()} ${this.selectedProductIds.size} produto(s)?`,
            async () => {
                try {
                    const batch = db.batch();
                    this.selectedProductIds.forEach(id => {
                        const docRef = db.collection('products').doc(id);
                        batch.update(docRef, { active: makeActive });
                    });
                    await batch.commit();
                    if (typeof this.showToast === 'function') this.showToast(`${this.selectedProductIds.size} produto(s) ${makeActive ? 'ativado(s)' : 'inativado(s)'}!`, 'info');
                    
                    this.selectedProductIds.clear();
                    const selectAllCb = document.querySelector('.page.active th input[type="checkbox"]');
                    if (selectAllCb) selectAllCb.checked = false;
                    this.renderProductsList();
                } catch(e) {
                    console.error(`Erro ao ${actionText.toLowerCase()} produtos em massa:`, e);
                    if (typeof this.showToast === 'function') this.showToast(`Erro ao ${actionText.toLowerCase()} produtos.`, 'error');
                }
            },
            {
                confirmText: makeActive ? 'Sim, Ativar' : 'Sim, Inativar',
                confirmColor: makeActive ? '#10B981' : '#F59E0B',
                iconClass: makeActive ? 'fas fa-play-circle' : 'fas fa-pause-circle',
                iconBg: makeActive ? '#D1FAE5' : '#FEF3C7',
                iconColor: makeActive ? '#10B981' : '#F59E0B'
            }
        );
    },

    toggleSelectAllProducts(source) {
        const checkboxes = document.querySelectorAll('.page.active .product-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = source.checked;
            if (source.checked) {
                this.selectedProductIds.add(cb.value);
            } else {
                this.selectedProductIds.delete(cb.value);
            }
        });
        this.updateProductsSelectedCount();
    },

    updateProductsSelectedCount() {
        const count = this.selectedProductIds.size;
        const countBadge = document.getElementById('products-selected-count');
        const btnDelete = document.getElementById('btn-bulk-delete');
        const btnInactivate = document.getElementById('btn-bulk-inactivate');
        const btnActivate = document.getElementById('btn-bulk-activate');
        const btnCombo = document.getElementById('btn-bulk-combo');
        
        const isAdmin = this.currentUserProfile && this.currentUserProfile.role === 'admin';

        if (countBadge) {
            countBadge.innerText = `${count} selecionado${count !== 1 ? 's' : ''}`;
            countBadge.style.display = count > 0 ? 'inline-flex' : 'none';
        }
        
        const btnPromo = document.getElementById('btn-bulk-promo');
        if (btnPromo) btnPromo.style.display = count > 0 ? 'flex' : 'none';
        
        if (btnCombo) btnCombo.style.display = count > 1 ? 'flex' : 'none';
        
        if (isAdmin) {
            if (btnDelete) btnDelete.style.display = count > 0 ? 'flex' : 'none';
            if (btnInactivate) btnInactivate.style.display = count > 0 ? 'flex' : 'none';
            if (btnActivate) btnActivate.style.display = count > 0 ? 'flex' : 'none';
        }
    },

    populateProductsDatalist() {
        const datalist = document.getElementById('products-datalist');
        if (!datalist) return;
        datalist.innerHTML = '';
        this.products.forEach(p => {
            const pt = document.createElement('option');
            pt.value = p.name;
            datalist.appendChild(pt);
        });
    },

    changeProductPage(dir) {
        this.currentProductPage += dir;
        this.renderProductsList();
    },

    goToProductPage(page) {
        if (page === 'last') {
            const filterInput = document.getElementById('filter-product-catalog');
            const filterVal = filterInput ? filterInput.value.toLowerCase().trim() : '';

            let displayProducts = this.products;
            if (filterVal) {
                const filterTerms = filterVal.split(' ').filter(t => t.trim() !== '');
                displayProducts = this.products.filter(p => {
                    const nameStr = (p.name || '').toLowerCase();
                    const barcodeStr = p.barcode || '';
                    const matchesBarcode = barcodeStr.includes(filterVal);
                    const matchesName = filterTerms.every(term => nameStr.includes(term));
                    return matchesName || matchesBarcode;
                });
            }
            this.currentProductPage = Math.ceil(displayProducts.length / this.productsPerPage) || 1;
        } else {
            this.currentProductPage = page;
        }
        this.renderProductsList();
    },

    renderProductsList() {
        const tbody = document.getElementById('products-list-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        const filterInput = document.getElementById('filter-product-catalog');
        const filterVal = filterInput ? filterInput.value.toLowerCase().trim() : '';

        let displayProducts = this.products;
        if (filterVal) {
            const filterTerms = filterVal.split(' ').filter(t => t.trim() !== '');
            displayProducts = this.products.filter(p => {
                const nameStr = (p.name || '').toLowerCase();
                const barcodeStr = p.barcode || '';
                const matchesBarcode = barcodeStr.includes(filterVal);
                const matchesName = filterTerms.every(term => nameStr.includes(term));
                return matchesName || matchesBarcode;
            });
            if (this._lastProductFilter !== filterVal) {
                this.currentProductPage = 1;
                this._lastProductFilter = filterVal;
            }
        } else {
            if (this._lastProductFilter !== '') {
                this.currentProductPage = 1;
                this._lastProductFilter = '';
            }
        }

        if (displayProducts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748B; padding: 32px;">Nenhum produto encontrado neste catálogo.</td></tr>`;
            const paginatorTop = document.getElementById('products-pagination-top');
            const paginatorBottom = document.getElementById('products-pagination');
            if (paginatorTop) paginatorTop.style.display = 'none';
            if (paginatorBottom) paginatorBottom.style.display = 'none';
            this.updateProductsSelectedCount();
            return;
        }

        const totalPages = Math.ceil(displayProducts.length / this.productsPerPage) || 1;
        if (this.currentProductPage > totalPages) this.currentProductPage = totalPages;
        if (this.currentProductPage < 1) this.currentProductPage = 1;

        const paginatorTop = document.getElementById('products-pagination-top');
        const paginatorBottom = document.getElementById('products-pagination');
        
        const updatePaginatorState = (paginator, infoId, prevId, nextId, firstId, lastId) => {
            if (!paginator) return;
            if (totalPages > 1) {
                paginator.style.display = 'flex';
                document.getElementById(infoId).innerText = `Página ${this.currentProductPage} de ${totalPages}`;
                const btnPrev = document.getElementById(prevId);
                const btnNext = document.getElementById(nextId);
                const btnFirst = document.getElementById(firstId);
                const btnLast = document.getElementById(lastId);
                
                const isFirst = this.currentProductPage === 1;
                const isLast = this.currentProductPage === totalPages;
                
                if (btnPrev) { btnPrev.disabled = isFirst; btnPrev.style.opacity = isFirst ? '0.5' : '1'; }
                if (btnFirst) { btnFirst.disabled = isFirst; btnFirst.style.opacity = isFirst ? '0.5' : '1'; }
                if (btnNext) { btnNext.disabled = isLast; btnNext.style.opacity = isLast ? '0.5' : '1'; }
                if (btnLast) { btnLast.disabled = isLast; btnLast.style.opacity = isLast ? '0.5' : '1'; }
            } else {
                paginator.style.display = 'none';
            }
        };

        updatePaginatorState(paginatorTop, 'prod-page-info-top', 'btn-prod-top-prev', 'btn-prod-top-next', 'btn-prod-top-first', 'btn-prod-top-last');
        updatePaginatorState(paginatorBottom, 'prod-page-info', 'btn-prod-prev', 'btn-prod-next', 'btn-prod-first', 'btn-prod-last');

        const startIndex = (this.currentProductPage - 1) * this.productsPerPage;
        const paginatedProducts = displayProducts.slice(startIndex, startIndex + this.productsPerPage);

        paginatedProducts.forEach(prod => {
            const row = document.createElement('tr');
            if (prod.active === false) {
                row.style.opacity = '0.6';
                row.style.background = '#F8FAFC';
            }
            
            const isChecked = this.selectedProductIds.has(prod.id);
            const price = prod.price ? `R$ ${parseFloat(prod.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}` : '-';
            const statusBadge = prod.active === false ? `<span class="pill" style="background:#E2E8F0; color:#475569; pointer-events:none; margin-left:8px;">Inativo</span>` : '';
            
            row.innerHTML = `
                <td style="text-align: center;"><input type="checkbox" class="product-checkbox" value="${prod.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;"></td>
                <td style="display:flex; align-items:center;"><strong>${prod.name}</strong>${statusBadge}<br><small style="color:var(--text-muted); padding-left:4px;">${prod.barcode || ''}</small></td>
                <td><span class="pill" style="pointer-events:none;">${prod.category || 'Geral'}</span></td>
                <td>${price}</td>
                <td style="color:var(--text-muted); font-size:12px; text-transform:capitalize;">${prod.sellerName || 'Sistema'}</td>
                <td style="text-align: center;">
                    <button class="btn-icon" style="color: #10B981; margin-right: 12px;" onclick="app.copyPixLink('${prod.id}')" title="Gerar Link de Checkout PIX">
                        <i class="fas fa-link"></i>
                    </button>
                    <button class="btn-icon" style="color: var(--primary); margin-right: 12px;" onclick="app.editProduct('${prod.id}')" title="Editar Produto">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${this.currentUserProfile && this.currentUserProfile.role === 'admin' ? `
                    <button class="btn-icon" style="color: #EF4444;" onclick="app.deleteProduct('${prod.id}')" title="Excluir Produto">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </td>
            `;
            const cb = row.querySelector('.product-checkbox');
            if (cb) {
                cb.addEventListener('change', (e) => {
                    if (e.target.checked) this.selectedProductIds.add(prod.id);
                    else this.selectedProductIds.delete(prod.id);
                    this.updateProductsSelectedCount();
                });
            }
            tbody.appendChild(row);
        });

        const selectAllCb = document.querySelector('.page.active th input[type="checkbox"]');
        if (selectAllCb) selectAllCb.checked = false;

        this.updateProductsSelectedCount();
    },

    async importProductXML(event) {
        const file = event.target.files[0];
        if (!file) return;

        const btnXml = document.getElementById('xml-upload');
        const uploadBtn = btnXml.previousElementSibling;
        const originalHtml = uploadBtn.innerHTML;
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';
        uploadBtn.disabled = true;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(text, "text/xml");

                const pages = xmlDoc.getElementsByTagName('page');
                const rowGroups = {};

                for (let pIdx = 0; pIdx < pages.length; pIdx++) {
                    const pageNodes = pages[pIdx].getElementsByTagName('text');
                    for (let i = 0; i < pageNodes.length; i++) {
                        const node = pageNodes[i];
                        const reportElement = node.getElementsByTagName('reportElement')[0];
                        if (!reportElement) continue;

                        const xStr = reportElement.getAttribute('x');
                        const yStr = reportElement.getAttribute('y');
                        
                        const textContentNode = node.getElementsByTagName('textContent')[0];
                        let content = '';
                        if (textContentNode) {
                            content = textContentNode.textContent.trim();
                        }
                        if (!content) continue;

                        const x = parseInt(xStr, 10);
                        const y = parseInt(yStr, 10);
                        const groupKey = `${pIdx}_${y}`;

                        if (!rowGroups[groupKey]) rowGroups[groupKey] = [];
                        rowGroups[groupKey].push({ x, content });
                    }
                }

                const parsedProducts = [];
                Object.values(rowGroups).forEach(row => {
                    let barcode = '';
                    let name = '';
                    let priceStr = '';

                    row.forEach(item => {
                        if (item.x >= 100 && item.x <= 112) barcode = item.content;
                        if (item.x >= 215 && item.x <= 225) name = item.content;
                        if (item.x >= 505 && item.x <= 515) priceStr = item.content;
                    });

                    if (name !== 'Descrição' && name) {
                        let price = 0;
                        if (priceStr) {
                            priceStr = priceStr.replace(/\./g, '').replace(',', '.');
                            price = parseFloat(priceStr) || 0;
                        }

                        parsedProducts.push({
                            barcode: barcode || '',
                            name: name,
                            price: price
                        });
                    }
                });

                if (parsedProducts.length === 0) {
                    if (typeof this.showToast === 'function') this.showToast('Nenhum produto encontrado neste arquivo XML.', 'warning');
                    uploadBtn.innerHTML = originalHtml;
                    uploadBtn.disabled = false;
                    btnXml.value = '';
                    return;
                }

                const importBatchId = Date.now().toString();
                let addedCount = 0;
                let skippedCount = 0;
                
                uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando no Firebase...';

                // Lote simulado apenas para não travar muito a UI em loops gigantes de Promise
                for (let p of parsedProducts) {
                    const exists = this.products.some(existing => {
                        const sameName = existing.name && existing.name.trim().toLowerCase() === p.name.trim().toLowerCase();
                        const sameBarcode = p.barcode && existing.barcode === p.barcode;
                        return sameName || sameBarcode;
                    });

                    if (exists) {
                        skippedCount++;
                        continue;
                    }

                    await db.collection('products').add({
                        name: p.name,
                        barcode: p.barcode,
                        price: p.price,
                        category: 'Catálogo Importado',
                        importBatchId: importBatchId,
                        sellerName: (this.currentUserProfile ? this.currentUserProfile.name : 'Importação XML'),
                        sellerId: (this.user ? this.user.uid : 'system'),
                        createdAt: new Date().toISOString()
                    });
                    addedCount++;
                }

                const undoBtn = document.getElementById('btn-undo-import');
                if (addedCount > 0 && undoBtn) {
                    undoBtn.style.display = 'inline-flex';
                    undoBtn.dataset.batchId = importBatchId;
                }

                if (typeof this.showToast === 'function') {
                    this.showToast(`Importação finalizada! ${addedCount} inseridos, ${skippedCount} ignorados (já existiam).`);
                }

            } catch(err) {
                console.error("Erro no parse do XML:", err);
                if (typeof this.showToast === 'function') this.showToast('Erro ao processar arquivo XML.', 'error');
            }

            uploadBtn.innerHTML = originalHtml;
            uploadBtn.disabled = false;
            btnXml.value = '';
            
            if (typeof this.updateActiveViews === 'function') this.updateActiveViews();
        };
        reader.readAsText(file);
    },

    async undoLastImport() {
        const undoBtn = document.getElementById('btn-undo-import');
        if (!undoBtn) return;
        const batchId = undoBtn.dataset.batchId;
        if (!batchId) return;

        if (typeof this.confirmAction === 'function') {
            this.confirmAction(
                "Desfazer Última Importação",
                "Isto removerá (apenas) os produtos inseridos na última importação XML. Esta ação não pode ser desfeita.",
                async () => {
                    try {
                        const snapshot = await db.collection('products').where('importBatchId', '==', batchId).get();
                        if (snapshot.empty) {
                            if (typeof this.showToast === 'function') this.showToast('Nenhum produto desta importação encontrado.', 'warning');
                            undoBtn.style.display = 'none';
                            return;
                        }

                        const batch = db.batch();
                        snapshot.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();

                        if (typeof this.showToast === 'function') this.showToast('Importação revertida com sucesso!', 'info');
                        undoBtn.style.display = 'none';
                        undoBtn.dataset.batchId = '';
                    } catch(e) {
                        console.error("Erro ao reverter importação:", e);
                        if (typeof this.showToast === 'function') this.showToast('Erro ao reverter operação.', 'error');
                    }
                }
            );
        }
    },

    copyPixLink(id) {
        if (!this.pixConfig) {
            if (typeof this.showToast === 'function') this.showToast('As configurações de PIX ainda não foram carregadas.', 'warning');
            return;
        }

        const storeSelector = document.getElementById('pix-store-selector');
        const store = storeSelector ? storeSelector.value : (this.currentUserProfile?.storeId || 'loja_1');
        let pKey = '', pMerchant = '', pCity = '';
        
        if (store === 'loja_2' && this.pixConfig.loja_2 && this.pixConfig.loja_2.pixKey) {
            pKey = this.pixConfig.loja_2.pixKey;
            pMerchant = this.pixConfig.loja_2.merchant;
            pCity = this.pixConfig.loja_2.city;
        } else if (this.pixConfig.loja_1 && this.pixConfig.loja_1.pixKey) {
            pKey = this.pixConfig.loja_1.pixKey;
            pMerchant = this.pixConfig.loja_1.merchant;
            pCity = this.pixConfig.loja_1.city;
        } else {
            pKey = this.pixConfig.pixKey || '';
            pMerchant = this.pixConfig.merchant || '';
            pCity = this.pixConfig.city || '';
        }

        if (!pKey) {
            if (typeof this.showToast === 'function') this.showToast('Configure sua Chave PIX primeiro na aba de Configurações!', 'warning');
            return;
        }
        
        const prod = this.products.find(p => p.id === id);
        if(!prod) return;

        const baseUrl = window.location.href.split('?')[0].replace('index.html', '').replace(/\/$/, '') + '/';
        
        const checkoutUrl = `${baseUrl}checkout.html?key=${encodeURIComponent(pKey || '')}&merchant=${encodeURIComponent(pMerchant || '')}&city=${encodeURIComponent(pCity || '')}&product=${encodeURIComponent(prod.name)}&price=${encodeURIComponent(prod.price || 0)}`;
        
        const fallbackCopy = () => {
            const tempInput = document.createElement("input");
            tempInput.value = checkoutUrl;
            document.body.appendChild(tempInput);
            tempInput.select();
            try {
                document.execCommand("copy");
                if (typeof this.showToast === 'function') this.showToast('Link copiado (Modo de Compatibilidade)!', 'info');
            } catch (err) {
                prompt('Copie o link gerado:', checkoutUrl);
            }
            document.body.removeChild(tempInput);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(checkoutUrl).then(() => {
                if (typeof this.showToast === 'function') this.showToast('Link de PIX gerado e copiado para a área de transferência!', 'info');
            }).catch(err => {
                fallbackCopy();
            });
        } else {
            fallbackCopy();
        }
    },

    preparePromoFromProducts() {
        if (this.selectedProductIds.size < 1) {
             if (typeof this.showToast === 'function') this.showToast('Selecione pelo menos 1 produto para a campanha.', 'warning');
             return;
        }

        const productNames = [];
        this.selectedProductIds.forEach(id => {
            const prod = this.products.find(p => p.id === id);
            if(prod && prod.name) {
                productNames.push(prod.name);
            }
        });

        if (productNames.length === 0) return;

        let combinedNames = productNames.join(', ');
        const lastComma = combinedNames.lastIndexOf(', ');
        if (lastComma !== -1) {
            combinedNames = combinedNames.substring(0, lastComma) + ' e ' + combinedNames.substring(lastComma + 2);
        }

        this.pendingPromoProducts = combinedNames;
        
        if (typeof this.showToast === 'function') {
            this.showToast('Produtos salvos na memória! Agora escolha os Clientes e inicie a Promoção.', 'info');
        }
        
        if (typeof this.navigateTo === 'function') {
            this.navigateTo('clients');
        }
    },

    generateComboLink() {
        // Needs AT LEAST pixConfig to exist. Default or Store doesn't matter yet here, checkout handles it
        if (!this.pixConfig) {
            if (typeof this.showToast === 'function') this.showToast('Configure suas Chaves PIX primeiro na aba de Configurações!', 'warning');
            return;
        }

        if (this.selectedProductIds.size < 2) {
             if (typeof this.showToast === 'function') this.showToast('Selecione pelo menos 2 produtos para gerar o combo.', 'warning');
             return;
        }

        const cart = [];
        this.selectedProductIds.forEach(id => {
            const prod = this.products.find(p => p.id === id);
            if(prod) {
                cart.push({ n: prod.name, p: parseFloat(prod.price) || 0 });
            }
        });

        // Encode to base64, preserving utf-8 safe chars
        const utf8Encoder = new TextEncoder();
        const utf8Bytes = utf8Encoder.encode(JSON.stringify(cart));
        const base64Bytes = btoa(String.fromCharCode.apply(null, Array.from(utf8Bytes)));

        const storeSelector = document.getElementById('pix-store-selector');
        const store = storeSelector ? storeSelector.value : (this.currentUserProfile?.storeId || 'loja_1');
        let pKey = '', pMerchant = '', pCity = '';
        
        if (store === 'loja_2' && this.pixConfig.loja_2 && this.pixConfig.loja_2.pixKey) {
            pKey = this.pixConfig.loja_2.pixKey;
            pMerchant = this.pixConfig.loja_2.merchant;
            pCity = this.pixConfig.loja_2.city;
        } else if (this.pixConfig.loja_1 && this.pixConfig.loja_1.pixKey) {
            pKey = this.pixConfig.loja_1.pixKey;
            pMerchant = this.pixConfig.loja_1.merchant;
            pCity = this.pixConfig.loja_1.city;
        } else {
            // Fallback for legacy configs before multi-store
            pKey = this.pixConfig.pixKey || '';
            pMerchant = this.pixConfig.merchant || '';
            pCity = this.pixConfig.city || '';
        }

        if (!pKey) {
            if (typeof this.showToast === 'function') this.showToast('Configure sua Chave PIX primeiro na aba de Configurações!', 'warning');
            return;
        }
        
        const baseUrl = window.location.href.split('?')[0].replace('index.html', '').replace(/\/$/, '') + '/';
        const checkoutUrl = `${baseUrl}checkout.html?key=${encodeURIComponent(pKey || '')}&merchant=${encodeURIComponent(pMerchant || '')}&city=${encodeURIComponent(pCity || '')}&cart=${encodeURIComponent(base64Bytes)}`;
        
        const fallbackCopy = () => {
            const tempInput = document.createElement("input");
            tempInput.value = checkoutUrl;
            document.body.appendChild(tempInput);
            tempInput.select();
            try {
                document.execCommand("copy");
                if (typeof this.showToast === 'function') this.showToast('Link do Combo PIX copiado (Modo de Compatibilidade)!', 'info');
            } catch (err) {
                prompt('Copie o link gerado:', checkoutUrl);
            }
            document.body.removeChild(tempInput);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(checkoutUrl).then(() => {
                if (typeof this.showToast === 'function') this.showToast('Link do Combo PIX gerado e copiado para a área de transferência!', 'info');
            }).catch(err => {
                fallbackCopy();
            });
        } else {
            fallbackCopy();
        }
        
        this.selectedProductIds.clear();
        const selectAllCb = document.querySelector('.page.active th input[type="checkbox"]');
        if (selectAllCb) selectAllCb.checked = false;
        this.renderProductsList();
    }
};
