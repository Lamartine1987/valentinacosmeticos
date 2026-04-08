document.addEventListener('DOMContentLoaded', () => {
    // 1. Extract URL Parameters
    const params = new URLSearchParams(window.location.search);
    const pixKey = params.get('key') || '';
    const merchant = decodeURIComponent(params.get('merchant') || '');
    const city = decodeURIComponent(params.get('city') || '');
    
    let products = [];
    let price = 0;
    
    const cartB64 = params.get('cart');
    if (cartB64) {
        try {
            const binaryStr = atob(cartB64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); }
            const jsonStr = new TextDecoder().decode(bytes);
            products = JSON.parse(jsonStr);
            price = products.reduce((acc, p) => acc + (p.p || 0), 0);
        } catch(e) {
            console.error("Invalid cart format", e);
        }
    } else {
        const product = decodeURIComponent(params.get('product') || 'Pagamento PIX');
        let priceStr = params.get('price') || '0';
        price = parseFloat(priceStr);
        if(!isNaN(price)) products = [{ n: product, p: price }];
    }

    if (!pixKey || isNaN(price) || products.length === 0) {
        alert("Link de pagamento inválido ou incompleto.");
        return;
    }

    // 2. Format UI
    const priceFormatted = price.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    document.getElementById('ui-merchant-name').innerText = merchant || 'Vendedor Padrão';
    document.getElementById('ui-merchant-initials').innerText = merchant ? merchant.substring(0, 2).toUpperCase() : 'PIX';
    
    const uiSubtitle = document.getElementById('ui-subtitle');
    if (uiSubtitle) {
        if (products.length > 1) {
            uiSubtitle.innerText = `Combo Promocional (${products.length} itens)`;
        } else {
            uiSubtitle.innerText = `Comprar ${products[0].n}`;
        }
    }
    
    document.getElementById('ui-price').innerText = priceFormatted;
    document.getElementById('ui-total-price').innerText = `R$ ${priceFormatted}`;

    const summaryItems = document.getElementById('ui-summary-items');
    if (summaryItems) {
        summaryItems.innerHTML = '';
        products.forEach(prod => {
            const row = document.createElement('div');
            row.className = 'summary-row';
            row.style.marginBottom = '12px';
            const pf = (prod.p).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            row.innerHTML = `
                <div class="summary-product-name">
                    <div class="placeholder-img"><i class="fas ${products.length > 1 ? 'fa-gift' : 'fa-box'}"></i></div>
                    <span style="font-size: 13px;">${prod.n}</span>
                </div>
                <div style="font-size: 13px;">R$ ${pf}</div>
            `;
            summaryItems.appendChild(row);
        });
    }

    // 3. Generate PIX String
    const pixPayload = generatePixPayload(pixKey, price, merchant, city);
    document.getElementById('pix-hash').value = pixPayload;

    // 4. Generate QR Code
    new QRCode(document.getElementById("qrcode"), {
        text: pixPayload,
        width: 200,
        height: 200,
        colorDark : "#0F172A",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.M
    });
});

// --- PIX EMV ALGORITHM ---

function generatePixPayload(pixKey, amount, merchantName, merchantCity, transactionId = '***') {
    const formatValue = (id, value) => {
        const length = value.length.toString().padStart(2, '0');
        return `${id}${length}${value}`;
    };

    const pixGui = formatValue('00', 'br.gov.bcb.pix');
    const pixKeyField = formatValue('01', pixKey);
    const merchantAccountInfo = formatValue('26', pixGui + pixKeyField);

    const mcc = formatValue('52', '0000');
    const currency = formatValue('53', '986');
    const amountField = amount > 0 ? formatValue('54', amount.toFixed(2)) : '';
    const country = formatValue('58', 'BR');

    // Remove accents and ensure max length
    const mName = (merchantName || 'Vendedor Padrao').normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 25).toUpperCase();
    const mCity = (merchantCity || 'SAO PAULO').normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 15).toUpperCase();

    const nameField = formatValue('59', mName);
    const cityField = formatValue('60', mCity);

    const txId = formatValue('05', transactionId);
    const additionalData = formatValue('62', txId);

    const payload = [
        formatValue('00', '01'), // Payload Format Indicator
        merchantAccountInfo,
        mcc,
        currency,
        amountField,
        country,
        nameField,
        cityField,
        additionalData,
        '6304' // CRC16 ID + Length
    ].join('');

    return payload + calculateCrc16(payload);
}

function calculateCrc16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// Global copy function
window.copyPixCode = function() {
    const copyText = document.getElementById("pix-hash");
    copyText.select();
    copyText.setSelectionRange(0, 99999); 
    
    const applySuccessVisuals = () => {
        const btn = document.getElementById('btn-copy');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.style.background = '#059669';
        setTimeout(() => {
            btn.innerHTML = oldHtml;
            btn.style.background = 'var(--success)';
        }, 2000);
    };

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(copyText.value).then(() => {
            applySuccessVisuals();
        }).catch(err => {
            try { document.execCommand("copy"); applySuccessVisuals(); } catch(e) {}
        });
    } else {
        try { document.execCommand("copy"); applySuccessVisuals(); } catch(e) {
            prompt('Copie o código manualmente:', copyText.value);
        }
    }
};
