import { db } from '../config/firebase.js';

export const productsModule = {
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
        const checkboxes = document.querySelectorAll('.page.active .product-checkbox:checked');
        if (checkboxes.length === 0) {
            if (typeof this.showToast === 'function') this.showToast('Selecione pelo menos um produto para excluir.', 'warning');
            return;
        }

        this.confirmAction(
            "Excluir Produtos em Massa",
            `Tem certeza que deseja excluir ${checkboxes.length} produto(s)? Esta ação não pode ser desfeita.`,
            async () => {
                try {
                    const batch = db.batch();
                    checkboxes.forEach(cb => {
                        const docRef = db.collection('products').doc(cb.value);
                        batch.delete(docRef);
                    });
                    await batch.commit();
                    if (typeof this.showToast === 'function') this.showToast(`${checkboxes.length} produto(s) excluído(s)!`, 'info');
                    
                    const selectAllCb = document.querySelector('.page.active th input[type="checkbox"]');
                    if (selectAllCb) selectAllCb.checked = false;
                } catch(e) {
                    console.error("Erro exclusão de produtos em massa:", e);
                    if (typeof this.showToast === 'function') this.showToast('Erro ao excluir produtos.', 'error');
                }
            }
        );
    },

    toggleSelectAllProducts(source) {
        const checkboxes = document.querySelectorAll('.page.active .product-checkbox');
        checkboxes.forEach(cb => cb.checked = source.checked);
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

    renderProductsList() {
        const tbody = document.getElementById('products-list-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        const filterInput = document.getElementById('filter-product-catalog');
        const filterVal = filterInput ? filterInput.value.toLowerCase().trim() : '';

        let displayProducts = this.products;
        if (filterVal) {
            displayProducts = this.products.filter(p => 
                (p.name && p.name.toLowerCase().includes(filterVal)) || 
                (p.barcode && p.barcode.includes(filterVal))
            );
        }

        if (displayProducts.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748B; padding: 32px;">Nenhum produto cadastrado no catálogo.</td></tr>`;
            return;
        }

        displayProducts.forEach(prod => {
            const row = document.createElement('tr');
            const price = prod.price ? `R$ ${parseFloat(prod.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}` : '-';
            row.innerHTML = `
                <td style="text-align: center;"><input type="checkbox" class="product-checkbox" value="${prod.id}" style="cursor: pointer; width: 16px; height: 16px;"></td>
                <td><strong>${prod.name}</strong><br><small style="color:var(--text-muted);">${prod.barcode || ''}</small></td>
                <td><span class="pill" style="pointer-events:none;">${prod.category || 'Geral'}</span></td>
                <td>${price}</td>
                <td style="text-align: center;">
                    <button class="btn-icon" style="color: var(--primary); margin-right: 12px;" onclick="app.editProduct('${prod.id}')" title="Editar Produto">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" style="color: #EF4444;" onclick="app.deleteProduct('${prod.id}')" title="Excluir Produto">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
};
