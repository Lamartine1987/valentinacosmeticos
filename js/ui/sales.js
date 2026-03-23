export const salesModule = {
    addSaleItem() {
        const container = document.getElementById('sale-items-container');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'sale-item-row';
        row.style.cssText = 'display:grid; grid-template-columns:1fr 90px 36px; gap:8px; align-items:center;';
        row.innerHTML = `
            <input type="text" class="sale-item-product" placeholder="Ex: Hidratação de Cabelo" list="products-datalist" style="padding:12px 16px; border:1px solid var(--border); border-radius:8px; font-size:14px; outline:none; font-family:inherit; width:100%; box-sizing:border-box;">
            <input type="number" class="sale-item-qty" placeholder="Qtd" min="1" value="1" style="padding:12px 10px; border:1px solid var(--border); border-radius:8px; font-size:14px; outline:none; text-align:center; width:100%; box-sizing:border-box;">
            <button type="button" onclick="app.removeSaleItem(this)" style="border:none; background:#FEE2E2; color:#EF4444; border-radius:8px; cursor:pointer; width:36px; height:44px; display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0;"><i class="fas fa-times"></i></button>
        `;
        row.querySelector('.sale-item-product').addEventListener('input', () => this.calculateSaleTotal());
        row.querySelector('.sale-item-product').addEventListener('change', () => this.calculateSaleTotal());
        row.querySelector('.sale-item-qty').addEventListener('input', () => this.calculateSaleTotal());
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
        
        rows.forEach(row => {
            const prodInput = row.querySelector('.sale-item-product');
            const qtyInput = row.querySelector('.sale-item-qty');
            if (prodInput && qtyInput) {
                const prodName = prodInput.value.trim();
                const qty = parseInt(qtyInput.value) || 1;
                
                // Try case-insensitive exact match
                const prod = this.products.find(p => p.name && p.name.trim().toLowerCase() === prodName.toLowerCase());
                
                if (prod && prod.price) {
                    total += parseFloat(prod.price) * qty;
                    foundAny = true;
                }
            }
        });
        
        const valueInput = document.getElementById('r-value');
        if (valueInput) {
            // Se encontrar algum produto, atualiza o campo automaticamente
            // Se total for 0 (apagou os itens), e o campo de valor não estiver vazio, zera.
            if (foundAny || document.querySelectorAll('.sale-item-row').length > 0) {
                valueInput.value = total.toFixed(2);
            }
        }
    }
};
