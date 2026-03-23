export const utilsModule = {
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
