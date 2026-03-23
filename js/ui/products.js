export const productsModule = {
    editProduct(id) {
        const prod = this.products.find(p => p.id === id);
        if(!prod) return;
        this.editingProductId = id;
        document.getElementById('p-name').value = prod.name || '';
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
        
        if (this.products.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #64748B; padding: 32px;">Nenhum produto cadastrado no catálogo.</td></tr>`;
            return;
        }

        this.products.forEach(prod => {
            const row = document.createElement('tr');
            const price = prod.price ? `R$ ${parseFloat(prod.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}` : '-';
            row.innerHTML = `
                <td><strong>${prod.name}</strong></td>
                <td><span class="pill" style="pointer-events:none;">${prod.category || 'Geral'}</span></td>
                <td>${price}</td>
                <td style="text-align: center;">
                    <button class="btn-icon" style="color: var(--primary);" onclick="app.editProduct('${prod.id}')" title="Editar Produto">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }
};
