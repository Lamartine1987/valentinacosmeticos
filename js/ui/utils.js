export const utilsModule = {
    confirmAction(title, message, callback, options = {}) {
        const {
            confirmText = "Sim, Excluir",
            confirmColor = "#EF4444",
            iconClass = "fas fa-exclamation-triangle",
            iconBg = "#FEE2E2",
            iconColor = "#EF4444"
        } = options;

        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        if (titleEl) titleEl.innerText = title;
        if (msgEl) msgEl.innerText = message;
        
        const iconBgEl = document.getElementById('confirm-icon-bg');
        const iconEl = document.getElementById('confirm-icon');
        if(iconBgEl) {
            iconBgEl.style.background = iconBg;
            iconBgEl.style.color = iconColor;
        }
        if(iconEl) iconEl.className = iconClass;
        
        const btnYes = document.getElementById('confirm-btn-yes');
        if (!btnYes) return;
        
        btnYes.style.background = confirmColor;
        btnYes.innerText = confirmText;
        
        const newBtnYes = btnYes.cloneNode(true);
        btnYes.parentNode.replaceChild(newBtnYes, btnYes);
        
        newBtnYes.addEventListener('click', async () => {
            const btnOriginalText = newBtnYes.innerHTML;
            newBtnYes.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
            try {
                await callback();
            } finally {
                newBtnYes.innerHTML = btnOriginalText;
                this.closeConfirm();
            }
        });

        const overlay = document.getElementById('confirm-overlay');
        if (overlay) overlay.classList.add('active');
    },

    closeConfirm() {
        const overlay = document.getElementById('confirm-overlay');
        if (overlay) overlay.classList.remove('active');
    },

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3500);
    },

    parseTemplate(type, name, product, link = "") {
        let text = this.msgTemplates[type] || "";
        text = text.replace(/{nome}/g, name).replace(/{produto}/g, product || 'produto').replace(/{link}/g, link);
        return text;
    }
};
