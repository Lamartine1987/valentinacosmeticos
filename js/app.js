import { firebase, db } from './config/firebase.js';
import { apiModule } from './services/api.js';
import { dashboardModule } from './ui/dashboard.js';
import { clientsModule } from './ui/clients.js';
import { salesModule } from './ui/sales.js';
import { productsModule } from './ui/products.js';
import { authModule } from './ui/auth.js';
import { settingsModule } from './ui/settings.js';
import { reportsModule } from './ui/reports.js';
import { utilsModule } from './ui/utils.js';

// App State
const app = {
    sales: [],
    promos: [],
    clients: [],
    products: [],
    user: null,
    charts: { revenue: null, products: null },

    editingClientId: null,
    editingProductId: null,
    apiSettings: null,
    msgTemplates: {
        thanks: "Olá {nome}, aqui é da Valentina Cosméticos! Muito obrigada pela sua compra recente do {produto}. Qualquer dúvida de como usar o produto, estamos à disposição! 🥰",
        restock: "Oi {nome}, tudo bem? Faz cerca de 30 dias que você comprou o {produto}. Como está sendo a experiência? Já está acabando? Preparamos uma condição especial se quiser repor hoje! ✨",
        dormant: "Oi {nome}, que saudade de você! Faz um tempinho que não nos falamos. Chegaram novidades incríveis na Valentina Cosméticos, quer dar uma olhadinha no catálogo? 💖",
        lost: "Oi {nome}, lembrou de mim? Fizemos uma limpeza aqui e percebi que faz muito tempo desde a sua última compra. Preparamos um presente muito especial caso queira voltar a ser nossa cliente VIP! ✨",
        promo: [
            { id: Date.now(), title: 'Campanha Padrão', text: "Oi {nome}! Temos uma novidade incrível para você: o {produto} está com uma condição super especial hoje. Garanta o seu através do link: {link} 💖" }
        ]
    },

    unsubSales: null,
    unsubPromos: null,
    unsubClients: null,
    unsubProducts: null,
    
    init() {
        this.setupNavigation();
        this.setupForm();
        this.setupFilters();
        this.setupAuth();
        this.setupGlobalSearch();
        
        // Setup date defaulting to today
        document.getElementById('r-date').valueAsDate = new Date();
    },

    setupGlobalSearch() {
        const input = document.getElementById('global-search');
        const resultsBox = document.getElementById('global-search-results');
        if (!input || !resultsBox) return;

        input.addEventListener('input', () => {
            const val = input.value.toLowerCase().trim();
            resultsBox.innerHTML = '';
            
            if (!val) {
                resultsBox.classList.remove('show');
                return;
            }

            const matchedClients = this.clients.filter(c => c.name.toLowerCase().includes(val) || (c.phone && c.phone.includes(val))).slice(0, 3);
            const matchedProducts = this.products.filter(p => p.name.toLowerCase().includes(val)).slice(0, 3);

            let html = '';
            if (matchedClients.length > 0) {
                html += `<div style="padding: 8px 12px; background: #F8FAFC; font-size: 11px; font-weight: bold; color: var(--text-muted); text-transform: uppercase;">Clientes</div>`;
                matchedClients.forEach(c => {
                    html += `<div class="suggestion-item" onclick="app.viewClientHistory('${c.id}'); document.getElementById('global-search-results').classList.remove('show'); document.getElementById('global-search').value = '';" style="cursor:pointer;">
                        <i class="fas fa-user" style="color:var(--primary); margin-right:8px;"></i> ${c.name}
                    </div>`;
                });
            }
            if (matchedProducts.length > 0) {
                html += `<div style="padding: 8px 12px; background: #F8FAFC; font-size: 11px; font-weight: bold; color: var(--text-muted); text-transform: uppercase;">Produtos</div>`;
                matchedProducts.forEach(p => {
                    html += `<div class="suggestion-item" onclick="app.editProduct('${p.id}'); document.getElementById('global-search-results').classList.remove('show'); document.getElementById('global-search').value = '';" style="cursor:pointer;">
                        <i class="fas fa-box" style="color:#10B981; margin-right:8px;"></i> ${p.name}
                    </div>`;
                });
            }

            if (html === '') {
                html = `<div style="padding: 12px; font-size: 13px; color: var(--text-muted); text-align: center;">Nenhum resultado encontrado.</div>`;
            }

            resultsBox.innerHTML = html;
            resultsBox.classList.add('show');
        });

        document.addEventListener('click', (e) => {
            if (e.target !== input && e.target !== resultsBox && !resultsBox.contains(e.target)) {
                resultsBox.classList.remove('show');
            }
        });
    },



    listenData() {
        if(!db || !this.user) return;
        
        this.unsubSales = db.collection("sales").orderBy("createdAt", "asc").onSnapshot((snapshot) => {
            this.sales = [];
            snapshot.forEach((doc) => {
                this.sales.push({ id: doc.id, ...doc.data() });
            });
            this.updateActiveViews();
        }, (error) => {
            alert(`Atenção: O Firebase bloqueou a conexão de leitura!\n\nLembre-se de ir na Aba "Regras" do Firestore Database e alterar de "false" para "true".\n\nErro: ${error.message}`);
        });

        this.unsubClients = db.collection("clients").orderBy("createdAt", "asc").onSnapshot((snapshot) => {
            this.clients = [];
            snapshot.forEach((doc) => {
                this.clients.push({ id: doc.id, ...doc.data() });
            });
            this.updateActiveViews();
        }, (error) => console.log(error));

        this.unsubProducts = db.collection("products").orderBy("name", "asc").onSnapshot((snapshot) => {
            this.products = [];
            snapshot.forEach((doc) => {
                this.products.push({ id: doc.id, ...doc.data() });
            });
            this.updateActiveViews();
            this.populateProductsDatalist();
        }, (error) => console.log(error));

        this.unsubPromos = db.collection("promos").orderBy("createdAt", "desc").limit(50).onSnapshot((snapshot) => {
            this.promos = [];
            snapshot.forEach((doc) => {
                this.promos.push({ id: doc.id, ...doc.data() });
            });
            this.updateActiveViews();
        }, (error) => console.log(error));
    },

    updateActiveViews() {
        this.renderDashboard();
        this.populateReportFilters();
        if (document.getElementById('page-reports') && document.getElementById('page-reports').classList.contains('active')) this.renderReports();
        if (document.getElementById('page-sales').classList.contains('active')) this.renderClientsTable();
        if (document.getElementById('page-clients').classList.contains('active')) this.renderClientsList();
        if (document.getElementById('page-products') && document.getElementById('page-products').classList.contains('active')) this.renderProductsList();
        const historyModal = document.getElementById('history-overlay');
        if (historyModal && historyModal.classList.contains('active')) this.renderClientHistory();
    },

    setupFilters() {
        document.getElementById('filter-name').addEventListener('input', () => this.renderClientsTable());
        document.getElementById('filter-sale-product').addEventListener('input', () => this.renderClientsTable());
        document.getElementById('filter-status').addEventListener('change', () => this.renderClientsTable());
        document.getElementById('filter-date-start').addEventListener('change', () => this.renderClientsTable());
        document.getElementById('filter-date-end').addEventListener('change', () => this.renderClientsTable());
        
        const clientFilter = document.getElementById('filter-client-name');
        if(clientFilter) clientFilter.addEventListener('input', () => this.renderClientsList());

        const ds = document.getElementById('dash-filter-start');
        const de = document.getElementById('dash-filter-end');
        const dt = document.getElementById('dash-filter-type');
        if(ds) ds.addEventListener('change', () => this.renderDashboard());
        if(de) de.addEventListener('change', () => this.renderDashboard());
        if(dt) dt.addEventListener('change', () => this.renderDashboard());
    },

    editClient(id) {
        const client = this.clients.find(c => c.id === id);
        if(!client) return;
        this.editingClientId = id;
        document.getElementById('c-name').value = client.name || '';
        document.getElementById('c-phone').value = client.phone || '';
        document.getElementById('c-email').value = client.email || '';
        document.getElementById('client-form-title').innerText = "Editar Cliente";
        document.getElementById('client-form-desc').innerText = "Atualize os dados deste cliente na sua base.";
        document.getElementById('client-submit-text').innerText = "Atualizar Cliente";
        this.navigateTo('client-register');
    },

    cancelClientEdit() {
        this.editingClientId = null;
        const form = document.getElementById('form-client');
        if(form) form.reset();
        document.getElementById('client-form-title').innerText = "Cadastrar Cliente";
        document.getElementById('client-form-desc').innerText = "Adicione um novo contato à sua base manualmente.";
        document.getElementById('client-submit-text').innerText = "Salvar Cliente";
        this.navigateTo('clients');
    },

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

    navigateTo(pageId) {
        document.querySelectorAll('.nav-item').forEach(link => {
            link.classList.remove('active');
            if(link.getAttribute('data-page') === pageId) link.classList.add('active');
        });

        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(`page-${pageId}`).classList.add('active');
        
        this.updateActiveViews();
    },

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = link.getAttribute('data-page');
                this.navigateTo(pageId);
            });
        });
    },

    setupForm() {
        // Autocomplete da cliente
        const inputName = document.getElementById('r-name');
        const inputPhone = document.getElementById('r-phone');
        const suggestionsBox = document.getElementById('client-suggestions');

        if (inputName && suggestionsBox) {
            inputName.addEventListener('input', () => {
                const val = inputName.value.toLowerCase();
                suggestionsBox.innerHTML = '';
                
                if (!val) {
                    suggestionsBox.classList.remove('show');
                    return;
                }

                const matches = this.clients.filter(c => {
                    const nameMatch = c.name && c.name.toLowerCase().includes(val);
                    const cleanValPhone = val.replace(/\D/g, '');
                    const phoneMatch = cleanValPhone.length > 0 && c.phone && c.phone.replace(/\D/g, '').includes(cleanValPhone);
                    return nameMatch || phoneMatch;
                });
                
                if (matches.length > 0) {
                    matches.forEach(client => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.innerHTML = `<span class="suggestion-name">${client.name}</span><span class="suggestion-phone">${client.phone}</span>`;
                        div.addEventListener('click', () => {
                            inputName.value = client.name;
                            if (inputPhone && client.phone) inputPhone.value = client.phone;
                            suggestionsBox.classList.remove('show');
                        });
                        suggestionsBox.appendChild(div);
                    });
                    suggestionsBox.classList.add('show');
                } else {
                    suggestionsBox.classList.remove('show');
                }
            });

            // Fechar ao clicar fora
            document.addEventListener('click', (e) => {
                if (e.target !== inputName && e.target !== suggestionsBox && !suggestionsBox.contains(e.target)) {
                    suggestionsBox.classList.remove('show');
                }
            });
        }

        // Inicializar o formulário de venda com uma linha de produto
        this.addSaleItem();

        document.getElementById('form-sale').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // UX: Disable button while saving
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            btn.disabled = true;

            // Coletar todos os itens do formulário dinâmico
            const itemRows = document.querySelectorAll('.sale-item-row');
            const items = [];
            let totalQty = 0;
            itemRows.forEach(row => {
                const prod = row.querySelector('.sale-item-product').value.trim();
                const qty = parseInt(row.querySelector('.sale-item-qty').value) || 1;
                if (prod) { 
                    const catalogProd = this.products.find(p => p.name === prod);
                    const unitPrice = catalogProd && catalogProd.price ? catalogProd.price : 0;
                    items.push({ product: prod, quantity: qty, price: unitPrice }); 
                    totalQty += qty; 
                }
            });

            if (items.length === 0) {
                this.showToast('Adicione pelo menos um produto antes de salvar.');
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }

            const productNames = items.map(i => i.product).join(', ');
            const newSale = {
                name: document.getElementById('r-name').value,
                phone: document.getElementById('r-phone').value,
                product: productNames,
                quantity: totalQty,
                items: items,
                value: parseFloat(document.getElementById('r-value').value),
                date: document.getElementById('r-date').value,
            };

            // Auto-register client if not exists
            const phoneStr = newSale.phone.replace(/\D/g, '');
            if(!this.clients.find(c => c.phone.replace(/\D/g, '') === phoneStr)) {
                await this.saveClient({name: newSale.name, phone: newSale.phone, email: ''});
            }

            const saleId = await this.saveSale(newSale);
            
            // Auto send WhatsApp Message if API is active
            if (this.apiSettings && this.apiSettings.active && saleId) {
                const actionMsg = this.parseTemplate('thanks', newSale.name, newSale.product);
                this.sendWhatsAppMessage(newSale.phone, actionMsg, this.msgTemplates.thanksImg).then(async (success) => {
                    const status = success ? 'sent' : 'failed';
                    await db.collection('sales').doc(saleId).update({ msg_thanks_status: status });
                    if(success) this.showToast('Mensagem enviada via API WhatsApp!');
                });
            }
            
            btn.innerHTML = originalText;
            btn.disabled = false;
            e.target.reset();
            document.getElementById('r-date').valueAsDate = new Date();
            // Reinicializar lista de itens com uma linha vazia
            const cont = document.getElementById('sale-items-container');
            if (cont) { cont.innerHTML = ''; this.addSaleItem(); }
            this.navigateTo('dashboard');
        });

        const clientForm = document.getElementById('form-client');
        if(clientForm) {
            clientForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
                btn.disabled = true;

                const newClient = {
                    name: document.getElementById('c-name').value,
                    phone: document.getElementById('c-phone').value,
                    email: document.getElementById('c-email').value || ''
                };
                if (this.editingClientId) {
                    await this.updateClient(this.editingClientId, newClient);
                } else {
                    await this.saveClient(newClient);
                }
                
                btn.innerHTML = originalText;
                btn.disabled = false;
                e.target.reset();
                this.cancelClientEdit();
            });
        }

        const productForm = document.getElementById('form-product');
        if(productForm) {
            productForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
                btn.disabled = true;

                const newProduct = {
                    name: document.getElementById('p-name').value,
                    category: document.getElementById('p-category').value || 'Geral',
                    price: document.getElementById('p-price').value ? parseFloat(document.getElementById('p-price').value) : 0
                };
                if (this.editingProductId) {
                    await this.updateProduct(this.editingProductId, newProduct);
                } else {
                    await this.saveProduct(newProduct);
                }
                
                btn.innerHTML = originalText;
                btn.disabled = false;
                e.target.reset();
                this.cancelProductEdit();
            });
        }

        const apiForm = document.getElementById('form-api-settings');
        if (apiForm) {
            apiForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
                btn.disabled = true;

                this.apiSettings = {
                    provider: document.getElementById('api-provider').value,
                    url: document.getElementById('api-url').value,
                    token: document.getElementById('api-token').value,
                    active: document.getElementById('api-active').checked
                };

                try {
                    await db.collection("settings").doc("whatsapp_api").set(this.apiSettings);
                    this.showToast('Integração WhatsApp salva e atualizada!');
                } catch(err) {
                    console.error(err);
                    this.showToast('Erro ao salvar configuração.');
                }
                
                btn.innerHTML = originalText;
                btn.disabled = false;
            });
        }

        const tplForm = document.getElementById('form-templates');
        if (tplForm) {
            tplForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
                btn.disabled = true;

                const promoTitles = document.querySelectorAll('.promo-tpl-title');
                const promoTexts = document.querySelectorAll('.promo-tpl-text');
                const promoImgs = document.querySelectorAll('.promo-tpl-img');
                const promos = [];
                for(let i = 0; i < promoTitles.length; i++) {
                    promos.push({ 
                        id: Date.now() + i, 
                        title: promoTitles[i].value, 
                        text: promoTexts[i].value,
                        imageUrl: promoImgs[i] ? promoImgs[i].value : ''
                    });
                }

                this.msgTemplates = {
                    thanks: document.getElementById('tpl-thanks').value,
                    thanksImg: document.getElementById('tpl-thanks-img') ? document.getElementById('tpl-thanks-img').value : '',
                    restock: document.getElementById('tpl-restock').value,
                    restockImg: document.getElementById('tpl-restock-img') ? document.getElementById('tpl-restock-img').value : '',
                    dormant: document.getElementById('tpl-dormant').value,
                    dormantImg: document.getElementById('tpl-dormant-img') ? document.getElementById('tpl-dormant-img').value : '',
                    lost: document.getElementById('tpl-lost').value,
                    lostImg: document.getElementById('tpl-lost-img') ? document.getElementById('tpl-lost-img').value : '',
                    promo: promos
                };

                try {
                    await db.collection("settings").doc("msg_templates").set(this.msgTemplates);
                    this.showToast('Modelos de mensagens salvos!');
                    this.renderDashboard(); 
                } catch(err) {
                    console.error(err);
                    this.showToast('Erro ao salvar modelos.');
                }
                
                btn.innerHTML = originalText;
                btn.disabled = false;
            });
        }

        const promoProductInput = document.getElementById('promo-product');
        const promoLinkInput = document.getElementById('promo-link');
        if (promoProductInput) promoProductInput.addEventListener('input', () => this.updatePromoPreview());
        if (promoLinkInput) promoLinkInput.addEventListener('input', () => this.updatePromoPreview());

        const formPromo = document.getElementById('form-promo');
        if (formPromo) {
            formPromo.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const targetList = (this.selectedClientsForPromo && this.selectedClientsForPromo.length > 0) ? this.selectedClientsForPromo : this.currentFilteredClients;
                if (!targetList || targetList.length === 0) return;
                // Usa a API se a URL estiver configurada, independente do flag 'active'
                const hasApi = this.apiSettings && this.apiSettings.url;
                let delayInterval = hasApi ? 2500 : 600;
                
                const btn = document.getElementById('btn-send-promo');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Disparando...';
                btn.disabled = true;

                const product = document.getElementById('promo-product').value;
                const link = document.getElementById('promo-link').value;
                
                let successCount = 0;
                
                const selectEl = document.getElementById('promo-template-select');
                const promoList = Array.isArray(this.msgTemplates.promo) ? this.msgTemplates.promo : [];
                const activeTpl = (selectEl && promoList[selectEl.value]) ? promoList[selectEl.value] : null;
                const activeTplText = activeTpl ? activeTpl.text : "";
                const activeTplImg  = activeTpl ? activeTpl.imageUrl : "";


                for (let i = 0; i < targetList.length; i++) {
                    const client = targetList[i];
                    if (client.phone && activeTplText) {
                        const msg = activeTplText.replace(/{nome}/g, client.name.split(' ')[0]).replace(/{produto}/g, product || 'produto').replace(/{link}/g, link);
                        if (hasApi) {
                            // Envia via API (Z-API / Evolution)
                            const success = await this.sendWhatsAppMessage(client.phone, msg, activeTplImg);
                            if (success) {
                                successCount++;
                                db.collection("promos").add({
                                    clientId: client.id,
                                    name: client.name,
                                    phone: client.phone,
                                    product: product,
                                    msg: msg,
                                    status: 'sent',
                                    createdAt: new Date().toISOString()
                                });
                            }
                        } else {
                            // Fallback: abre WhatsApp Web (só se não houver API configurada)
                            const cleanPhone = client.phone.replace(/\D/g, '');
                            let finalMsgFallback = msg;
                            if (activeTplImg && activeTplImg.trim() !== '') finalMsgFallback += `\n\n${activeTplImg.trim()}`;
                            window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(finalMsgFallback)}`, '_blank');
                            successCount++;
                            db.collection("promos").add({
                                clientId: client.id,
                                name: client.name,
                                phone: client.phone,
                                product: product,
                                msg: msg,
                                status: 'sent',
                                createdAt: new Date().toISOString()
                            });
                        }
                        await new Promise(resolve => setTimeout(resolve, delayInterval));
                    }
                }
                
                btn.innerHTML = originalText;
                btn.disabled = false;
                this.closePromoModal();
                this.showToast(`Campanha finalizada! ${successCount} envios processados.`);
            });
        }
    },





    ...apiModule,
    ...dashboardModule,
    ...clientsModule,
    ...salesModule,
    ...productsModule,
    ...authModule,
    ...settingsModule,
    ...reportsModule,
    ...utilsModule
};

window.app = app; // Manda pro window pro HTML (onclick) conseguir achar

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
