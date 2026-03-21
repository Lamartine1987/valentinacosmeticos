const firebaseConfig = {
  apiKey: "AIzaSyDvfKBg6BGG08wPvKQZLizSgausTxOrxT4",
  authDomain: "valentinacosmeticos-5f239.firebaseapp.com",
  projectId: "valentinacosmeticos-5f239",
  storageBucket: "valentinacosmeticos-5f239.firebasestorage.app",
  messagingSenderId: "761484272424",
  appId: "1:761484272424:web:db22ac49a15fdcfeaf661d"
};

let db;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
} catch (e) {
    alert("Bloqueio de Carregamento na Nuvem! Verifique sua internet ou tente novamente. Código do erro: " + e.message);
}

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
        
        // Setup date defaulting to today
        document.getElementById('r-date').valueAsDate = new Date();
    },

    setupAuth() {
        firebase.auth().onAuthStateChanged(user => {
            const loginScreen = document.getElementById('login-overlay');
            if (user) {
                this.user = user;
                if(loginScreen) loginScreen.classList.remove('active');
                this.listenData();
                this.loadSettings();
            } else {
                this.user = null;
                if(loginScreen) loginScreen.classList.add('active');
                if (this.unsubSales) this.unsubSales();
                if (this.unsubPromos) this.unsubPromos();
                if (this.unsubClients) this.unsubClients();
                if (this.unsubProducts) this.unsubProducts();
            }
        });

        const loginForm = document.getElementById('form-login');
        if(loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const errDiv = document.getElementById('login-error');
                const originalText = btn.innerHTML;
                
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
                btn.disabled = true;
                errDiv.style.display = 'none';

                const email = document.getElementById('login-email').value;
                const pass = document.getElementById('login-password').value;

                try {
                    await firebase.auth().signInWithEmailAndPassword(email, pass);
                    e.target.reset();
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                } catch (err) {
                    console.error(err);
                    switch(err.code) {
                        case 'auth/user-not-found':
                        case 'auth/wrong-password':
                        case 'auth/invalid-credential':
                            errDiv.innerText = "E-mail ou senha incorretos."; break;
                        default:
                            errDiv.innerText = "Falha no login. Verifique seus dados."; break;
                    }
                    errDiv.style.display = 'block';
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        }
    },

    async loadSettings() {
        if(!db) return;
        try {
            const docApi = await db.collection("settings").doc("whatsapp_api").get();
            if (docApi.exists) {
                this.apiSettings = docApi.data();
                const p = document.getElementById('api-provider');
                const u = document.getElementById('api-url');
                const t = document.getElementById('api-token');
                const a = document.getElementById('api-active');
                if(p) p.value = this.apiSettings.provider || 'evolution';
                if(u) u.value = this.apiSettings.url || '';
                if(t) t.value = this.apiSettings.token || '';
                if(a) a.checked = !!this.apiSettings.active;
            }
            
            const docTpl = await db.collection("settings").doc("msg_templates").get();
            if (docTpl.exists) {
                this.msgTemplates = { ...this.msgTemplates, ...docTpl.data() };
                const tThanks = document.getElementById('tpl-thanks');
                const tRestock = document.getElementById('tpl-restock');
                const tDormant = document.getElementById('tpl-dormant');
                const tLost = document.getElementById('tpl-lost');
                if(tThanks) tThanks.value = this.msgTemplates.thanks;
                if(tRestock) tRestock.value = this.msgTemplates.restock;
                if(tDormant) tDormant.value = this.msgTemplates.dormant;
                if(tLost) tLost.value = this.msgTemplates.lost;
                
                if (typeof this.msgTemplates.promo === 'string') {
                    this.msgTemplates.promo = [ { id: Date.now(), title: 'Campanha Padrão', text: this.msgTemplates.promo } ];
                } else if (!Array.isArray(this.msgTemplates.promo)) {
                    this.msgTemplates.promo = [ { id: Date.now(), title: 'Campanha Padrão', text: "Oi {nome}! Temos uma novidade incrível para você: o {produto} está com uma condição super especial hoje. Garanta o seu através do link: {link} 💖" } ];
                }
                this.renderPromoTemplates();
            }
        } catch(e) { console.error(e); }
    },

    renderPromoTemplates() {
        const container = document.getElementById('promo-templates-container');
        if (!container) return;
        container.innerHTML = '';
        if (!Array.isArray(this.msgTemplates.promo)) this.msgTemplates.promo = [];
        this.msgTemplates.promo.forEach((tpl, index) => {
            const div = document.createElement('div');
            div.style.cssText = "border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: white; position: relative;";
            div.innerHTML = `
                <button type="button" class="btn-icon" style="position: absolute; top: 12px; right: 12px; font-size: 14px; color: #EF4444;" onclick="app.removePromoTemplate(${index})" title="Remover Modelo"><i class="fas fa-trash"></i></button>
                <div class="form-group" style="margin-bottom: 8px;">
                    <label style="font-size: 13px;">Nome da Campanha</label>
                    <input type="text" class="promo-tpl-title" value="${tpl.title}" required style="padding: 8px 12px; font-size: 14px; border: 1px solid var(--border); border-radius: 8px; outline: none; transition: 0.2s;">
                </div>
                <div class="form-group">
                    <label style="font-size: 13px;">Texto da Mensagem</label>
                    <textarea class="promo-tpl-text" rows="3" required style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; resize: vertical; outline: none;">${tpl.text}</textarea>
                </div>
            `;
            container.appendChild(div);
        });
    },

    addPromoTemplate() {
        if (!Array.isArray(this.msgTemplates.promo)) this.msgTemplates.promo = [];
        this.msgTemplates.promo.push({ id: Date.now(), title: 'Nova Campanha', text: 'Temos uma novidade para {nome}! Garanta o {produto} acessando {link} ✨' });
        this.renderPromoTemplates();
    },

    removePromoTemplate(index) {
        if (confirm('Tem certeza que deseja remover este modelo de campanha?')) {
            this.msgTemplates.promo.splice(index, 1);
            this.renderPromoTemplates();
        }
    },

    parseTemplate(type, name, product, link = "") {
        let text = this.msgTemplates[type] || "";
        text = text.replace(/{nome}/g, name).replace(/{produto}/g, product || 'produto').replace(/{link}/g, link);
        return text;
    },

    async sendWhatsAppMessage(phone, message) {
        if(!this.apiSettings || !this.apiSettings.url) return false;
        try {
            console.log("=== INICIANDO ENVIO DE WHATSAPP ===");
            console.log("Provedor configurado:", this.apiSettings.provider);
            
            const cleanPhone = phone.replace(/\D/g, '');
            let body = {};
            let finalUrl = this.apiSettings.url;
            
            if(this.apiSettings.provider === 'evolution') {
                body = { number: "55" + cleanPhone, textMessage: { text: message } };
            } else if (this.apiSettings.provider === 'zapi') {
                body = { phone: "55" + cleanPhone, message: message };
                // O Z-API exige /send-text no final da URL
                if (!finalUrl.endsWith('/send-text')) {
                    finalUrl = finalUrl.replace(/\/$/, '') + '/send-text';
                }
            } else {
                body = { phone: cleanPhone, message: message }; // webhook genérico
            }
            
            const headers = { 'Content-Type': 'application/json' };
            if (this.apiSettings.token) {
                const t = this.apiSettings.token;
                headers['Authorization'] = t.toLowerCase().startsWith('bearer') ? t : `Bearer ${t}`;
                headers['apikey'] = t; 
                if(this.apiSettings.provider === 'zapi') {
                    headers['Client-Token'] = t;
                }
            }
            
            console.log("URL Final disparada:", finalUrl);
            console.log("Headers formatados:", headers);
            console.log("Corpo da requisição (Body):", JSON.stringify(body));

            const response = await fetch(finalUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            
            if(!response.ok) {
                const errBody = await response.text();
                console.error("❌ ERRO NA API WA. Status:", response.status);
                console.error("❌ Resposta do servidor Z-API/Evolution:", errBody);
                return false;
            }
            
            const data = await response.json();
            console.log("✅ SUCESSO! A API retornou:", data);
            return true;
        } catch(e) {
            console.error("❌ Falha crítica ao conectar com a API:", e);
            return false;
        }
    },

    logout() {
        firebase.auth().signOut().then(() => {
            this.showToast('Você saiu do sistema.');
            this.sales = []; this.clients = []; this.products = [];
            this.updateActiveViews();
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

    async syncToBrevo(clientData) {
        if (!clientData.email || clientData.email.trim() === '') return;
        try {
            const response = await fetch('https://api.brevo.com/v3/contacts', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': '', // Insira a sua chave API do Brevo aqui ou via Firebase
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    email: clientData.email,
                    attributes: {
                        NOME: clientData.name
                        // Removemos o campo SMS porque o Brevo bloqueia se dois contatos tiverem o mesmo número de telefone (muito comum em testes e famílias)
                    },
                    updateEnabled: true 
                })
            });
            if (!response.ok) {
                console.warn('Aviso Sincronização Brevo:', await response.text());
            } else {
                console.log('✅ Cliente sincronizado com o Brevo (Marketing) com sucesso!');
            }
        } catch (error) {
            console.error('❌ Erro na API Brevo:', error);
        }
    },

    async saveClient(clientData) {
        try {
            await db.collection("clients").add({
                ...clientData,
                createdAt: new Date().toISOString()
            });
            this.syncToBrevo(clientData);
            this.showToast('Cliente salva na nuvem com sucesso!');
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao salvar cliente.');
        }
    },

    async saveProduct(productData) {
        try {
            await db.collection("products").add({
                ...productData,
                createdAt: new Date().toISOString()
            });
            this.showToast('Produto salvo no catálogo com sucesso!');
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao salvar produto.');
        }
    },

    async saveSale(saleData) {
        try {
            const docRef = await db.collection("sales").add({
                ...saleData,
                createdAt: new Date().toISOString()
            });
            this.showToast('Venda faturada e salva na nuvem!');
            return docRef.id;
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao salvar venda.');
            return null;
        }
    },

    async updateClient(id, clientData) {
        try {
            await db.collection("clients").doc(id).update(clientData);
            this.syncToBrevo(clientData);
            this.showToast('Cliente atualizado com sucesso!');
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao atualizar cliente.');
        }
    },

    async updateProduct(id, productData) {
        try {
            await db.collection("products").doc(id).update(productData);
            this.showToast('Produto atualizado com sucesso!');
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao atualizar produto.');
        }
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

        const rProduct = document.getElementById('r-product');
        const rQuantity = document.getElementById('r-quantity');
        const rValue = document.getElementById('r-value');

        const calculateTotal = () => {
            if (!rProduct || !rQuantity || !rValue) return;
            const prodName = rProduct.value;
            const qty = parseInt(rQuantity.value) || 1;
            const product = this.products.find(p => p.name === prodName);
            if (product && product.price) {
                rValue.value = (parseFloat(product.price) * qty).toFixed(2);
            }
        };

        if (rProduct) rProduct.addEventListener('input', calculateTotal);
        if (rQuantity) rQuantity.addEventListener('input', calculateTotal);
        if (rProduct) rProduct.addEventListener('change', calculateTotal);

        document.getElementById('form-sale').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // UX: Disable button while saving
            const btn = e.target.querySelector('button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            btn.disabled = true;

            const newSale = {
                name: document.getElementById('r-name').value,
                phone: document.getElementById('r-phone').value,
                product: document.getElementById('r-product').value,
                quantity: parseInt(document.getElementById('r-quantity').value) || 1,
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
                this.sendWhatsAppMessage(newSale.phone, actionMsg).then(async (success) => {
                    const status = success ? 'sent' : 'failed';
                    await db.collection('sales').doc(saleId).update({ msg_thanks_status: status });
                    if(success) this.showToast('Mensagem enviada via API WhatsApp!');
                });
            }
            
            btn.innerHTML = originalText;
            btn.disabled = false;
            e.target.reset();
            document.getElementById('r-date').valueAsDate = new Date();
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
                const promos = [];
                for(let i = 0; i < promoTitles.length; i++) {
                    promos.push({ id: Date.now() + i, title: promoTitles[i].value, text: promoTexts[i].value });
                }

                this.msgTemplates = {
                    thanks: document.getElementById('tpl-thanks').value,
                    restock: document.getElementById('tpl-restock').value,
                    dormant: document.getElementById('tpl-dormant').value,
                    lost: document.getElementById('tpl-lost').value,
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
                
                if (!this.currentFilteredClients || this.currentFilteredClients.length === 0) return;
                let delayInterval = (!this.apiSettings || !this.apiSettings.active) ? 600 : 2500;
                
                const btn = document.getElementById('btn-send-promo');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Disparando...';
                btn.disabled = true;

                const product = document.getElementById('promo-product').value;
                const link = document.getElementById('promo-link').value;
                
                let successCount = 0;
                
                const selectEl = document.getElementById('promo-template-select');
                const promoList = Array.isArray(this.msgTemplates.promo) ? this.msgTemplates.promo : [];
                const activeTplText = (selectEl && promoList[selectEl.value]) ? promoList[selectEl.value].text : "";

                const targetList = this.selectedClientsForPromo || this.currentFilteredClients;
                for (let i = 0; i < targetList.length; i++) {
                    const client = targetList[i];
                    if (client.phone && activeTplText) {
                        const msg = activeTplText.replace(/{nome}/g, client.name.split(' ')[0]).replace(/{produto}/g, product || 'produto').replace(/{link}/g, link);
                        if (!this.apiSettings || !this.apiSettings.active) {
                            const cleanPhone = client.phone.replace(/\D/g, '');
                            window.open(`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
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
                        } else {
                            const success = await this.sendWhatsAppMessage(client.phone, msg);
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

    getActions() {
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const actions = [];
        this.sales.forEach(sale => {
            if (!sale.date) return;
            const [y, m, d] = sale.date.split('-');
            const saleDate = new Date(y, m-1, d);
            
            const diffTime = today - saleDate;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays <= 2) {
                actions.push({ ...sale, type: 'thanks', days: diffDays, label: 'Agradecimento', colorClass: 'tag-thanks',
                    msg: this.parseTemplate('thanks', sale.name, sale.product),
                    status: sale.msg_thanks_status || 'pending'
                });
            } else if (diffDays >= 30 && diffDays <= 45) {
                actions.push({ ...sale, type: 'restock', days: diffDays, label: 'Reposição', colorClass: 'tag-restock',
                    msg: this.parseTemplate('restock', sale.name, sale.product),
                    status: sale.msg_restock_status || 'pending'
                });
            } else if (diffDays >= 46 && diffDays <= 120) {
                 actions.push({ ...sale, type: 'dormant', days: diffDays, label: 'Saudades', colorClass: 'tag-dormant',
                    msg: this.parseTemplate('dormant', sale.name, sale.product),
                    status: sale.msg_dormant_status || 'pending'
                });
            } else if (diffDays >= 121) {
                 actions.push({ ...sale, type: 'lost', days: diffDays, label: 'Ex-cliente', colorClass: 'tag-lost',
                    msg: this.parseTemplate('lost', sale.name, sale.product),
                    status: sale.msg_lost_status || 'pending'
                });
            }
        });
        
        if (this.promos) {
            this.promos.forEach(promo => {
                const promoDate = new Date(promo.createdAt);
                const diffTime = today - new Date(promoDate.getFullYear(), promoDate.getMonth(), promoDate.getDate());
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays <= 7 && diffDays >= 0) { // Mostrar histórico recente no dashboard
                    actions.push({
                        id: promo.id,
                        name: promo.name,
                        phone: promo.phone,
                        product: promo.product,
                        type: 'promo',
                        days: diffDays,
                        label: 'Promoção',
                        colorClass: 'tag-promo',
                        msg: promo.msg,
                        status: promo.status || 'sent',
                        date: promo.createdAt ? promo.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]
                    });
                }
            });
        }
        
        return actions.sort((a, b) => {
            const getTs = (obj) => {
                if (obj.createdAt) return new Date(obj.createdAt).getTime();
                if (obj.date) {
                    const [y, m, d] = obj.date.split('-');
                    return new Date(y, m-1, d).getTime();
                }
                return 0;
            };
            return getTs(b) - getTs(a);
        });
    },

    renderDashboard() {
        const fStart = (document.getElementById('dash-filter-start') || {value:''}).value;
        const fEnd = (document.getElementById('dash-filter-end') || {value:''}).value;
        const fType = (document.getElementById('dash-filter-type') || {value:'all'}).value;

        let filteredSales = [...this.sales];
        let actions = this.getActions();

        if (fStart || fEnd) {
            const filterDates = (item) => {
                if(!item.date) return false;
                const [y, m, d] = item.date.split('-');
                const itemDate = new Date(y, m-1, d);
                itemDate.setHours(0,0,0,0);
                
                if (fStart) {
                    const [sy, sm, sd] = fStart.split('-');
                    if (itemDate < new Date(sy, sm-1, sd)) return false;
                }
                if (fEnd) {
                    const [ey, em, ed] = fEnd.split('-');
                    if (itemDate > new Date(ey, em-1, ed)) return false;
                }
                return true;
            };

            filteredSales = filteredSales.filter(filterDates);
            actions = actions.filter(filterDates);
            
            const uniquePhones = new Set(filteredSales.map(s => s.phone.replace(/\D/g, '')));
            document.getElementById('stat-total-clients').innerText = uniquePhones.size;
        } else {
            document.getElementById('stat-total-clients').innerText = this.clients.length;
        }

        if (fType !== 'all') {
            actions = actions.filter(a => a.type === fType);
        }

        const totalSales = filteredSales.reduce((acc, curr) => acc + curr.value, 0);
        document.getElementById('stat-total-sales').innerText = `R$ ${totalSales.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        this.currentDashboardActions = actions;
        const pendingCount = actions.filter(a => a.status === 'pending' || a.status === 'failed').length;

        const badge = document.getElementById('noti-badge');
        badge.innerText = pendingCount;
        if(pendingCount > 0) { badge.style.display = 'block'; } else { badge.style.display = 'none'; }
        document.getElementById('stat-pending-contact').innerText = pendingCount;

        const btnDispararTodos = document.getElementById('btn-disparar-todos');
        if (btnDispararTodos) {
            if (pendingCount > 0) {
                btnDispararTodos.style.display = 'flex';
                btnDispararTodos.innerHTML = `<i class="fas fa-paper-plane" style="margin-right: 6px;"></i> Disparar Pendentes (${pendingCount})`;
            } else {
                btnDispararTodos.style.display = 'none';
            }
        }

        const listContainer = document.getElementById('action-list-container');
        listContainer.innerHTML = '';
        if(actions.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle" style="color: #10B981;"></i>
                    <h3 style="color: var(--text-main); margin-bottom: 8px;">Tudo em dia!</h3>
                    <p>Você não tem nenhuma ação de pós-venda pendente no momento.</p>
                </div>`;
            return;
        }

        actions.forEach(action => {
            const encodedMsg = encodeURIComponent(action.msg);
            const cleanPhone = action.phone.replace(/\D/g, '');
            const waLink = `https://wa.me/55${cleanPhone}?text=${encodedMsg}`;
            const item = document.createElement('div');
            item.className = 'action-item';
            
            let daysText = action.days === 0 ? 'Hoje' : (action.days === 1 ? 'Ontem' : `Há ${action.days} dias`);
            
            let actionHtml = `
                <div class="client-info">
                    <div style="display: flex; align-items: center;">
                        <span class="c-name">${action.name}</span>
                        <span class="c-tag ${action.colorClass}">${action.label}</span>
                    </div>
                    <span class="c-meta"><strong>${action.product}</strong> • ${action.type === 'promo' ? 'Enviado ' + daysText : 'Comprou ' + daysText}</span>
                </div>
            `;
            
            if (action.status === 'sent') {
                actionHtml += `
                    <div style="display: flex; align-items: center; gap: 8px; color: #10B981; font-weight: 500;">
                        <i class="fas fa-check-double"></i><span>Enviado pela API</span>
                    </div>
                `;
            } else {
                let isFailed = action.status === 'failed';
                let btnText = isFailed ? 'Tentar de Novo' : 'Disparar na API';
                let btnIcon = isFailed ? 'fa-redo' : 'fa-paper-plane';
                let btnColor = isFailed ? 'background: #EF4444; color: white;' : 'background: var(--primary); color: white;';
                
                actionHtml += `
                    <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                        ${isFailed ? '<span style="font-size:11px; color:#EF4444; font-weight:600;"><i class="fas fa-exclamation-circle"></i> Falha no Disparo Anterior</span>' : ''}
                        <div style="display:flex; gap:8px;">
                            <a href="${waLink}" target="_blank" class="btn-icon" style="border:1px solid var(--border); padding:6px 12px; border-radius:8px; color:var(--text-main); font-size:13px; text-decoration:none;" title="Abrir WhatsApp Web Manualmente (Fallback)">
                                <i class="fab fa-whatsapp" style="color:#25D366; font-size:14px;"></i> Web
                            </a>
                            <button id="btn-resend-${action.id}-${action.type}" style="padding:6px 16px; font-size:13px; border-radius:8px; border:none; cursor:pointer; font-weight:500; display:flex; gap:6px; align-items:center; transition:0.2s; ${btnColor}" onclick="app.resendActionMsg('${action.id}', '${action.type}', '${action.phone}')">
                                <i class="fas ${btnIcon}"></i> ${btnText}
                            </button>
                        </div>
                    </div>
                `;
            }

            item.innerHTML = actionHtml;
            listContainer.appendChild(item);
        });
    },

    async dispararTodos() {
        if (!this.currentDashboardActions) return;
        
        const pendingActions = this.currentDashboardActions.filter(a => a.status === 'pending' || a.status === 'failed');
        if (pendingActions.length === 0) return;
        
        if (!this.apiSettings || !this.apiSettings.active) {
            alert('Atenção: O disparo em massa funciona melhor com a API Z-API conectada. No modo gratuito (Web), o sistema tentará abrir várias abas do WhatsApp simultaneamente, o que muitas vezes é bloqueado pelo seu navegador (libere os pop-ups).');
        }

        const btn = document.getElementById('btn-disparar-todos');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 6px;"></i> Disparando...';
        btn.disabled = true;

        let delayInterval = (!this.apiSettings || !this.apiSettings.active) ? 600 : 2000;
        
        for (let i = 0; i < pendingActions.length; i++) {
            const action = pendingActions[i];
            app.resendActionMsg(action.id, action.type, action.phone, action.msg);
            await new Promise(resolve => setTimeout(resolve, delayInterval));
        }
        
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        this.showToast(pendingActions.length + ' disparos foram processados!');
    },

    renderClientsTable() {
        const tbody = document.getElementById('clients-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const filterName = (document.getElementById('filter-name') || {value:''}).value.toLowerCase();
        const filterStatus = (document.getElementById('filter-status') || {value:'all'}).value;
        const filterDateStart = (document.getElementById('filter-date-start') || {value:''}).value;
        const filterDateEnd = (document.getElementById('filter-date-end') || {value:''}).value;

        let filteredSales = [...this.sales].reverse();

        filteredSales = filteredSales.filter(sale => {
            if(!sale.date) return false;
            const [y, m, d] = sale.date.split('-');
            const saleDate = new Date(y, m-1, d);
            const diffDays = Math.floor((today - saleDate) / (1000 * 60 * 60 * 24));
            
            if (filterName && !sale.name.toLowerCase().includes(filterName)) return false;
            if (filterStatus === 'new' && diffDays >= 30) return false;
            if (filterStatus === 'restock' && (diffDays < 30 || diffDays >= 90)) return false;
            if (filterStatus === 'dormant' && diffDays < 90) return false;
            if (filterDateStart) {
                const [sy, sm, sd] = filterDateStart.split('-');
                if (saleDate < new Date(sy, sm-1, sd)) return false;
            }
            if (filterDateEnd) {
                const [ey, em, ed] = filterDateEnd.split('-');
                if (saleDate > new Date(ey, em-1, ed)) return false;
            }
            return true;
        });

        if (filteredSales.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748B; padding: 32px;">Nenhuma venda encontrada na nuvem.</td></tr>`;
            return;
        }

        filteredSales.forEach(sale => {
            const [y, m, d] = sale.date.split('-');
            const saleDate = new Date(y, m-1, d);
            const diffDays = Math.floor((today - saleDate) / (1000 * 60 * 60 * 24));
            
            let timeText = diffDays <= 0 ? "Hoje" : (diffDays === 1 ? "Ontem" : `Há ${diffDays} dias`);
            
            let timeStatus = `<span style="color:#10B981; font-weight: 500;">Novo <small style="color:var(--text-muted);font-weight:normal; font-size:12px;">(${timeText})</small></span>`;
            if (diffDays >= 30) timeStatus = `<span style="color:#F59E0B; font-weight: 500;">Repor <small style="color:var(--text-muted);font-weight:normal; font-size:12px;">(${timeText})</small></span>`;
            if (diffDays >= 90) timeStatus = `<span style="color:#EF4444; font-weight: 500;">Inativo <small style="color:var(--text-muted);font-weight:normal; font-size:12px;">(${timeText})</small></span>`;
            if (diffDays >= 180) timeStatus = `<span style="color:#64748B; font-weight: 500;">Ex-cliente <small style="color:var(--text-muted);font-weight:normal; font-size:12px;">(${timeText})</small></span>`;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${sale.name}</strong><br><small style="color:#64748B">${sale.phone}</small></td>
                <td>${sale.product}${sale.quantity > 1 ? ` <small style="color:var(--text-muted); font-weight:600;">(x${sale.quantity})</small>` : ''}</td>
                <td>${saleDate.toLocaleDateString('pt-BR')}</td>
                <td>R$ ${sale.value.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td>${timeStatus}</td>
            `;
            tbody.appendChild(row);
        });
    },

    renderClientsList() {
        const tbody = document.getElementById('clients-list-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        const selectAllCb = document.getElementById('selectAllClients');
        if (selectAllCb) selectAllCb.checked = false;
        
        const filterName = (document.getElementById('filter-client-name') || {value:''}).value.toLowerCase();
        
        let filtered = [...this.clients].reverse();
        if (filterName) {
            filtered = filtered.filter(c => {
                const nameMatch = c.name && c.name.toLowerCase().includes(filterName);
                const cleanFilter = filterName.replace(/\D/g, '');
                const phoneMatch = cleanFilter.length > 0 && c.phone && c.phone.replace(/\D/g, '').includes(cleanFilter);
                return nameMatch || phoneMatch;
            });
        }

        this.currentFilteredClients = filtered;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #64748B; padding: 32px;">Nenhuma cliente encontrada em sua base do Firebase.</td></tr>`;
            return;
        }

        filtered.forEach(client => {
            const compras = this.sales.filter(s => s.phone.replace(/\D/g, '') === client.phone.replace(/\D/g, ''));
            const totalGasto = compras.reduce((acc, curr) => acc + curr.value, 0);
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="text-align: center;"><input type="checkbox" class="client-checkbox" value="${client.id}" style="cursor: pointer; width: 16px; height: 16px;"></td>
                <td><strong>${client.name}</strong></td>
                <td>${client.phone}</td>
                <td>${compras.length} compra(s)</td>
                <td style="color:var(--primary); font-weight:600;">R$ ${totalGasto.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                <td style="text-align: center;">
                    <button class="btn-icon" style="color: var(--primary); margin-right: 12px;" onclick="app.viewClientHistory('${client.id}')" title="Ver Histórico de Compras">
                        <i class="fas fa-history"></i>
                    </button>
                    <button class="btn-icon" style="color: var(--primary);" onclick="app.editClient('${client.id}')" title="Editar Cliente">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
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

    async resendActionMsg(saleId, type, phone, fallbackMsg) {
        let msg = fallbackMsg;
        if (!msg) {
            const action = this.currentDashboardActions && this.currentDashboardActions.find(a => a.id === saleId && a.type === type);
            if (action && action.msg) {
                msg = action.msg;
            } else {
                this.showToast("Não foi possível carregar a mensagem original.");
                return;
            }
        }

        if (!this.apiSettings || !this.apiSettings.url) {
            this.showToast("Integração API do WhatsApp não está configurada corretamente!");
            return;
        }
        
        const btnId = `btn-resend-${saleId}-${type}`;
        const btn = document.getElementById(btnId);
        const originalHtml = btn ? btn.innerHTML : '';
        if(btn) { 
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; 
            btn.disabled = true; 
        }
        
        const success = await this.sendWhatsAppMessage(phone, msg);
        const statusField = `msg_${type}_status`;
        
        try {
            await db.collection("sales").doc(saleId).update({ [statusField]: success ? 'sent' : 'failed' });
        } catch(e) { console.error("Erro ao atualizar status na nuvem", e); }
        
        if (success) {
            this.showToast("Sucesso! Mensagem disparada pela API.");
        } else {
            this.showToast("Falha ao enviar via API. Verifique os logs no Console.");
            if(btn) {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        }
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
    },

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3500);
    },

    closeHistoryModal() {
        const modal = document.getElementById('history-overlay');
        if (modal) modal.classList.remove('active');
    },

    viewClientHistory(clientId) {
        this.currentHistoryClientId = clientId;
        const client = this.clients.find(c => c.id === clientId);
        if (!client) return;

        const infoContainer = document.getElementById('history-client-info');
        infoContainer.innerHTML = `
            <div style="font-weight: 600; font-size: 16px; color: var(--text-main);">${client.name}</div>
            <div style="color: var(--text-muted); font-size: 14px; margin-top: 4px; display: flex; gap: 12px; align-items: center;">
                <span><i class="fab fa-whatsapp"></i> ${client.phone}</span>
                ${client.email ? `<span><i class="fas fa-envelope"></i> ${client.email}</span>` : ''}
            </div>
        `;
        
        const filterStart = document.getElementById('history-filter-start');
        const filterEnd = document.getElementById('history-filter-end');
        if (filterStart) filterStart.value = '';
        if (filterEnd) filterEnd.value = '';

        this.renderClientHistory();

        const modal = document.getElementById('history-overlay');
        if (modal) modal.classList.add('active');
    },

    renderClientHistory() {
        if (!this.currentHistoryClientId) return;
        const client = this.clients.find(c => c.id === this.currentHistoryClientId);
        if (!client) return;
        
        const fStart = (document.getElementById('history-filter-start') || {value:''}).value;
        const fEnd = (document.getElementById('history-filter-end') || {value:''}).value;

        let compras = this.sales.filter(s => s.phone.replace(/\\D/g, '') === client.phone.replace(/\\D/g, ''));
        
        if (fStart || fEnd) {
            compras = compras.filter(item => {
                if(!item.date) return false;
                const [y, m, d] = item.date.split('-');
                const itemDate = new Date(y, m-1, d);
                itemDate.setHours(0,0,0,0);
                
                if (fStart) {
                    const [sy, sm, sd] = fStart.split('-');
                    if (itemDate < new Date(sy, sm-1, sd)) return false;
                }
                if (fEnd) {
                    const [ey, em, ed] = fEnd.split('-');
                    if (itemDate > new Date(ey, em-1, ed)) return false;
                }
                return true;
            });
        }
        
        compras.sort((a, b) => new Date(b.date) - new Date(a.date));

        const content = document.getElementById('history-modal-content');
        if (compras.length === 0) {
            content.innerHTML = '<div class="empty-state" style="padding: 32px;"><i class="fas fa-shopping-bag"></i><p>Nenhuma compra encontrada para os filtros selecionados.</p></div>';
        } else {
            let html = '<div style="display: flex; flex-direction: column; gap: 12px;">';
            compras.forEach(sale => {
                const [y, m, d] = sale.date.split('-');
                const saleDate = new Date(y, m-1, d);
                const pDate = saleDate.toLocaleDateString('pt-BR');
                
                const today = new Date();
                today.setHours(0,0,0,0);
                const diffDays = Math.floor((today - saleDate) / (1000 * 60 * 60 * 24));
                let timeText = diffDays <= 0 ? "Hoje" : (diffDays === 1 ? "Ontem" : `Há ${diffDays} dias`);
                
                let timeStatus = `<span style="color:#10B981; font-weight: 500; font-size:12px;"><i class="fas fa-circle" style="font-size:8px; margin-right:4px;"></i>Novo (${timeText})</span>`;
                if (diffDays >= 30) timeStatus = `<span style="color:#F59E0B; font-weight: 500; font-size:12px;"><i class="fas fa-circle" style="font-size:8px; margin-right:4px;"></i>Reposição (${timeText})</span>`;
                if (diffDays >= 90) timeStatus = `<span style="color:#EF4444; font-weight: 500; font-size:12px;"><i class="fas fa-circle" style="font-size:8px; margin-right:4px;"></i>Inativo (${timeText})</span>`;
                if (diffDays >= 180) timeStatus = `<span style="color:#64748B; font-weight: 500; font-size:12px;"><i class="fas fa-circle" style="font-size:8px; margin-right:4px;"></i>Ex-cliente (${timeText})</span>`;

                html += `
                    <div style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: white; display: flex; justify-content: space-between; align-items: center; box-shadow: var(--shadow-sm);">
                        <div>
                            <div style="font-weight: 600; color: var(--text-main); margin-bottom: 4px; font-size: 15px;">${sale.product} ${sale.quantity > 1 ? `<span style="color:var(--text-muted); font-weight:500;">x${sale.quantity}</span>` : ''}</div>
                            <div style="color: var(--text-muted); font-size: 13px; display: flex; align-items: center; gap: 8px;">${pDate} • ${timeStatus}</div>
                        </div>
                        <div style="font-weight: 700; color: var(--primary); font-size: 15px;">
                            R$ ${sale.value.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            content.innerHTML = html;
        }
    },

    toggleSelectAllClients(source) {
        const checkboxes = document.querySelectorAll('.client-checkbox');
        checkboxes.forEach(cb => cb.checked = source.checked);
    },

    openPromoModal() {
        const checkboxes = document.querySelectorAll('.client-checkbox:checked');
        this.selectedClientsForPromo = [];
        if (checkboxes.length > 0) {
            checkboxes.forEach(cb => {
                const client = this.clients.find(c => c.id === cb.value);
                if (client) this.selectedClientsForPromo.push(client);
            });
        } else {
            this.showToast('Por favor, selecione pelo menos uma cliente marcando a caixinha na tabela.');
            return;
        }

        if (this.selectedClientsForPromo.length === 0) return;
        
        if (!this.apiSettings || !this.apiSettings.active) {
            alert('Atenção: A Integração de API não está ativa. O envio manual tentará abrir diversas abas do WhatsApp. Permita os Pop-ups do seu navegador.');
        }

        const modal = document.getElementById('promo-overlay');
        document.getElementById('promo-target-count').innerText = this.selectedClientsForPromo.length;
        document.getElementById('promo-product').value = '';
        document.getElementById('promo-link').value = '';
        
        const selectEl = document.getElementById('promo-template-select');
        if (selectEl) {
            selectEl.innerHTML = '';
            const promoList = Array.isArray(this.msgTemplates.promo) ? this.msgTemplates.promo : [];
            promoList.forEach((tpl, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.innerText = tpl.title;
                selectEl.appendChild(opt);
            });
        }

        this.updatePromoPreview();
        
        if (modal) modal.classList.add('active');
    },

    closePromoModal() {
        const modal = document.getElementById('promo-overlay');
        if (modal) modal.classList.remove('active');
    },

    updatePromoPreview() {
        const prod = document.getElementById('promo-product').value || '[Produto]';
        const link = document.getElementById('promo-link').value || '[Link]';
        const exampleName = this.selectedClientsForPromo && this.selectedClientsForPromo.length > 0 ? this.selectedClientsForPromo[0].name.split(' ')[0] : 'Maria';
        const previewEl = document.getElementById('promo-preview');
        
        const selectEl = document.getElementById('promo-template-select');
        const promoList = Array.isArray(this.msgTemplates.promo) ? this.msgTemplates.promo : [];
        const activeTplText = (selectEl && promoList[selectEl.value]) ? promoList[selectEl.value].text : "Mensagem não configurada.";

        let text = activeTplText.replace(/{nome}/g, exampleName).replace(/{produto}/g, prod || 'produto').replace(/{link}/g, link);
        if (previewEl) previewEl.innerText = text;
    },

    populateReportFilters() {
        const clientDt = document.getElementById('dt-report-clients');
        const prodDt = document.getElementById('dt-report-products');
        if (!clientDt || !prodDt) return;

        clientDt.innerHTML = '';
        prodDt.innerHTML = '';

        const uniqueClients = [...new Set(this.sales.map(s => s.name))].filter(Boolean).sort();
        const uniqueProducts = [...new Set(this.sales.map(s => s.product))].filter(Boolean).sort();

        uniqueClients.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            clientDt.appendChild(opt);
        });
        
        uniqueProducts.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            prodDt.appendChild(opt);
        });
    },

    renderReports() {
        const fStart = (document.getElementById('report-filter-start') || {value:''}).value;
        const fEnd = (document.getElementById('report-filter-end') || {value:''}).value;
        const fClient = (document.getElementById('report-filter-client') || {value:''}).value.trim().toLowerCase();
        const fProd = (document.getElementById('report-filter-product') || {value:''}).value.trim().toLowerCase();

        let filteredSales = [...this.sales];

        if (fClient) filteredSales = filteredSales.filter(s => s.name && s.name.toLowerCase().includes(fClient));
        if (fProd) filteredSales = filteredSales.filter(s => s.product && s.product.toLowerCase().includes(fProd));

        if (fStart || fEnd) {
            const filterDates = (item) => {
                if(!item.date) return false;
                const [y, m, d] = item.date.split('-');
                const itemDate = new Date(y, m-1, d);
                itemDate.setHours(0,0,0,0);
                
                if (fStart) {
                    const [sy, sm, sd] = fStart.split('-');
                    if (itemDate < new Date(sy, sm-1, sd)) return false;
                }
                if (fEnd) {
                    const [ey, em, ed] = fEnd.split('-');
                    if (itemDate > new Date(ey, em-1, ed)) return false;
                }
                return true;
            };
            filteredSales = filteredSales.filter(filterDates);
        }

        let totalYear = 0;
        let totalMonth = 0;
        let allTimeTotal = 0;
        
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        
        const monthlyRevenue = Array(12).fill(0);
        const productCounts = {};

        filteredSales.forEach(sale => {
            const val = Number(sale.value) || 0;
            allTimeTotal += val;

            if (sale.date) {
                const [y, m] = sale.date.split('-');
                const year = parseInt(y);
                const month = parseInt(m);
                
                if (year === currentYear) {
                    totalYear += val;
                    monthlyRevenue[month - 1] += val;
                    if (month === currentMonth) {
                        totalMonth += val;
                    }
                }
            }
            
            if (sale.product) {
                const prodName = sale.product;
                if (!productCounts[prodName]) productCounts[prodName] = 0;
                productCounts[prodName] += (parseInt(sale.quantity) || 1);
            }
        });

        const sortedProducts = Object.keys(productCounts)
            .map(p => ({ name: p, count: productCounts[p] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
            
        const prodLabels = sortedProducts.map(p => p.name);
        const prodData = sortedProducts.map(p => p.count);

        if (document.getElementById('report-total-year')) {
            document.getElementById('report-total-year').innerText = allTimeTotal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
            document.getElementById('report-total-month').innerText = totalMonth.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
            const realTicketAvg = filteredSales.length > 0 ? (allTimeTotal / filteredSales.length) : 0;
            document.getElementById('report-ticket-avg').innerText = realTicketAvg.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        }

        const revCanvas = document.getElementById('chart-revenue');
        if (typeof Chart !== 'undefined' && revCanvas) {
            const ctxRev = revCanvas.getContext('2d');
            if (this.charts.revenue) this.charts.revenue.destroy();
            this.charts.revenue = new Chart(ctxRev, {
                type: 'bar',
                data: {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                    datasets: [{
                        label: 'Faturamento (' + currentYear + ')',
                        data: monthlyRevenue,
                        backgroundColor: 'rgba(109, 40, 217, 0.7)',
                        borderColor: 'rgba(109, 40, 217, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: { responsive: true, scales: { y: { beginAtZero: true } } }
            });
        }

        const prodCanvas = document.getElementById('chart-products');
        if (typeof Chart !== 'undefined' && prodCanvas) {
            const ctxProd = prodCanvas.getContext('2d');
            if (this.charts.products) this.charts.products.destroy();
            
            const hasData = prodData.length > 0;

            this.charts.products = new Chart(ctxProd, {
                type: 'doughnut',
                data: {
                    labels: hasData ? prodLabels : ['Nenhuma venda encontrada'],
                    datasets: [{
                        data: hasData ? prodData : [1],
                        backgroundColor: hasData ? ['#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#3B82F6'] : ['#E2E8F0'],
                        borderWidth: 0
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    plugins: { 
                         legend: { position: 'bottom' },
                         tooltip: {
                             callbacks: {
                                 label: function(context) {
                                     if (!hasData) return ' 0 unidades vendidas';
                                     return ' ' + context.formattedValue + ' unidades vendidas';
                                 }
                             }
                         }
                    } 
                }
            });
        }

        const filteredClientsContainer = document.getElementById('report-filtered-clients');
        const filteredClientsList = document.getElementById('report-clients-list');

        if ((fProd || fClient || fStart || fEnd) && filteredClientsContainer && filteredClientsList) {
            filteredClientsContainer.style.display = 'block';
            filteredClientsList.innerHTML = '';
            
            const clientAgg = {};
            filteredSales.forEach(s => {
                if (s.name && s.name.trim() !== '') {
                    if (!clientAgg[s.name]) {
                        clientAgg[s.name] = { totalQty: 0, totalValue: 0 };
                    }
                    clientAgg[s.name].totalQty += (parseInt(s.quantity) || 1);
                    const val = Number(s.value) || 0;
                    clientAgg[s.name].totalValue += val;
                }
            });
            
            const uniqueClientNames = Object.keys(clientAgg).sort((a, b) => {
                if (clientAgg[b].totalQty !== clientAgg[a].totalQty) return clientAgg[b].totalQty - clientAgg[a].totalQty;
                return clientAgg[b].totalValue - clientAgg[a].totalValue;
            });
            
            if (uniqueClientNames.length === 0) {
                 filteredClientsList.innerHTML = '<p style="color: var(--text-muted); font-size: 14px; padding: 12px; border: 1px dashed var(--border); text-align: center; border-radius: 8px;">Nenhum cliente atende aos filtros atuais.</p>';
            } else {
                 uniqueClientNames.forEach(cName => {
                     const clientObj = this.clients.find(c => c.name === cName);
                     const clientPhone = clientObj && clientObj.phone ? clientObj.phone : 'Não cadastrado';
                     const qtyInfo = clientAgg[cName];
                     
                     const div = document.createElement('div');
                     div.style.cssText = "display:flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; background: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: 0.2s;";
                     div.innerHTML = `
                        <div style="display:flex; align-items: center; gap: 12px;">
                            <div style="background: #E0E7FF; color: #4F46E5; width: 40px; height: 40px; border-radius: 50%; display:flex; align-items:center; justify-content:center; font-weight: bold; font-size: 16px;">
                                ${cName.charAt(0).toUpperCase()}
                            </div>
                            <div style="display:flex; flex-direction: column; gap: 4px;">
                                <h4 style="font-size: 14px; font-weight: 600; color: var(--text-main); margin: 0;">${cName}</h4>
                                <span style="font-size: 12px; color: var(--text-muted); margin: 0;"><i class="fab fa-whatsapp" style="color: #25D366; margin-right: 4px; font-size: 12px;"></i>${clientPhone}</span>
                            </div>
                        </div>
                        <div style="text-align: right; display: flex; flex-direction: column; justify-content: center; gap: 4px;">
                            <span style="display: inline-block; background: #FEF3C7; color: #D97706; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">${qtyInfo.totalQty} Unidade${qtyInfo.totalQty > 1 ? 's' : ''}</span>
                            <span style="font-size: 12px; color: var(--text-main); font-weight: 700;">R$ ${qtyInfo.totalValue.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        </div>
                     `;
                     filteredClientsList.appendChild(div);
                 });
            }
        } else if (filteredClientsContainer) {
            filteredClientsContainer.style.display = 'none';
        }
    }
};

window.app = app; // Manda pro window pro HTML (onclick) conseguir achar

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
