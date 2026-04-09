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
import { funnelModule } from './ui/funnel.js';
import { financeModule } from './ui/finance.js';

// App State
const app = {
    sales: [],
    promos: [],
    clients: [],
    products: [],
    expenses: [],
    financeCategories: [],
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
    unsubExpenses: null,
    
    init() {
        this.setupNavigation();
        this.setupForm();
        this.setupFilters();
        this.setupAuth();
        this.setupGlobalSearch();
        this.setupFunnel();
        this.setupTeamListeners();
        this.setupTemplateFormatters();
        if (this.setupFinance) this.setupFinance();
        
        // Setup date defaulting to today
        document.getElementById('r-date').valueAsDate = new Date();

        // Apply Sidebar Desktop preference
        if (window.innerWidth > 900) {
            if (localStorage.getItem('sidebarPref') === 'collapsed') {
                document.body.classList.add('sidebar-collapsed');
            }
        }
    },

    setupTemplateFormatters() {
        const textareas = ['tpl-thanks', 'tpl-15d', 'tpl-restock', 'tpl-dormant', 'tpl-lost', 'tpl-birthday', 'tpl-promo-text'];
        textareas.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.previousElementSibling && el.previousElementSibling.classList.contains('wa-format-toolbar')) return;

            const toolbar = document.createElement('div');
            toolbar.className = 'wa-format-toolbar';
            toolbar.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; background: #F8FAFC; padding: 6px; border-radius: 6px; border: 1px solid var(--border);';
            
            const createBtn = (icon, title, clickHandler) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-icon';
                btn.style.cssText = 'font-size: 14px; padding: 4px 8px; background: white; border: 1px solid var(--border); border-radius: 4px; display: flex; align-items: center; justify-content: center;';
                btn.innerHTML = `<i class="${icon}"></i>`;
                btn.title = title;
                btn.onclick = clickHandler;
                return btn;
            };

            const btnBold = createBtn('fas fa-bold', 'Negrito', () => this.waFormat(id, '*', '*'));
            const btnItalic = createBtn('fas fa-italic', 'Itálico', () => this.waFormat(id, '_', '_'));
            const btnStrike = createBtn('fas fa-strikethrough', 'Tachado', () => this.waFormat(id, '~', '~'));
            
            const emojiWrapper = document.createElement('div');
            emojiWrapper.style.position = 'relative';
            const btnEmoji = createBtn('far fa-smile', 'Emoji', (e) => { e.stopPropagation(); this.toggleTemplateEmojiPicker(id, btnEmoji); });
            emojiWrapper.appendChild(btnEmoji);
            
            toolbar.appendChild(btnBold);
            toolbar.appendChild(btnItalic);
            toolbar.appendChild(btnStrike);
            toolbar.appendChild(emojiWrapper);
            
            el.parentElement.insertBefore(toolbar, el);
        });
    },

    waFormat(id, startTag, endTag) {
        const el = document.getElementById(id);
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const text = el.value;
        const before = text.substring(0, start);
        const selected = text.substring(start, end);
        const after = text.substring(end, text.length);
        
        el.value = before + startTag + selected + endTag + after;
        el.selectionStart = start + startTag.length;
        el.selectionEnd = start + startTag.length + selected.length;
        el.focus();
    },

    toggleTemplateEmojiPicker(id, btnRef) {
        let container = document.getElementById('emoji-picker-container-template');
        if (container) {
            if (container.dataset.target === id && container.style.display !== 'none') {
                 container.style.display = 'none';
                 return;
            }
        } else {
             container = document.createElement('div');
             container.id = 'emoji-picker-container-template';
             container.style.cssText = 'position: absolute; z-index: 1000; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; display: none;';
             container.innerHTML = '<emoji-picker></emoji-picker>';
             document.body.appendChild(container);
             
             container.querySelector('emoji-picker').addEventListener('emoji-click', event => {
                 const targetId = container.dataset.target;
                 if (targetId) {
                     const el = document.getElementById(targetId);
                     if (el) {
                         const start = el.selectionStart;
                         const end = el.selectionEnd;
                         const text = el.value;
                         el.value = text.substring(0, start) + event.detail.unicode + text.substring(end, text.length);
                         el.selectionStart = el.selectionEnd = start + event.detail.unicode.length;
                         el.focus();
                     }
                 }
                 container.style.display = 'none';
             });
             
             document.addEventListener('click', e => {
                 if (container.style.display !== 'none' && !container.contains(e.target) && !e.target.closest('.wa-format-toolbar')) {
                     container.style.display = 'none';
                 }
             });
        }
        
        container.dataset.target = id;
        container.style.display = 'block';
        
        const rect = btnRef.getBoundingClientRect();
        container.style.top = (rect.bottom + window.scrollY + 5) + 'px';
        container.style.left = (rect.left + window.scrollX) + 'px';
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

    autoFillShortName(val) {
        const inputShort = document.getElementById('r-shortName');
        if(!inputShort) return;
        const currentVal = inputShort.value;
        const words = val.trim().split(' ');
        if(words.length > 0 && words[0].length > 0) {
           let word = words[0];
           if (word === word.toLowerCase() && word.length > 2) {
               word = word.charAt(0).toUpperCase() + word.slice(1);
           }
           if (currentVal === '' || val.indexOf(currentVal) !== -1 || currentVal.toLowerCase() === word.toLowerCase().substring(0, currentVal.length)) {
               inputShort.value = word;
           }
        } else {
           inputShort.value = '';
        }
    },

    toggleSidebar() {
        if (window.innerWidth <= 900) {
            document.body.classList.toggle('sidebar-open');
        } else {
            const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
            localStorage.setItem('sidebarPref', isCollapsed ? 'collapsed' : 'open');
        }
    },

    registerUnknownBarcode(barcode) {
        this.cancelProductEdit();
        setTimeout(() => {
            const inputName = document.getElementById('p-name');
            const inputBarcode = document.getElementById('p-barcode');
            if(inputBarcode) inputBarcode.value = barcode;
            if(inputName) inputName.focus();
        }, 100);
    },

    applyPermissions() {
        if (!this.currentUserProfile) return;
        
        const role = this.currentUserProfile.role;
        const storeId = this.currentUserProfile.storeId;
        
        // 1. Ocultar Configurações Pesadas para Vendedores
        const settingsMenuBtn = document.querySelector('a[data-page="settings"]');
        if (role === 'seller') {
            if (settingsMenuBtn) settingsMenuBtn.style.display = 'none';
        } else {
            if (settingsMenuBtn) settingsMenuBtn.style.display = 'flex';
        }
        
        // 2. Atualizar Avatar e Identidade no Rodapé do Menu Lateral
        const userInfoContainer = document.querySelector('.user-info');
        if (userInfoContainer) {
            const spans = userInfoContainer.querySelectorAll('span');
            const avatarBox = userInfoContainer.querySelector('.avatar');
            
            if (spans.length >= 2) {
                spans[0].textContent = this.currentUserProfile.name || 'Usuário';
                
                let storeLabel = 'Acesso Global';
                if (storeId === 'loja_1') storeLabel = 'Loja 1';
                else if (storeId === 'loja_2') storeLabel = 'Loja 2';
                
                spans[1].textContent = role === 'admin' ? `Mestre (${storeLabel})` : storeLabel;
            }
            
            if (avatarBox && this.currentUserProfile.name) {
                const parts = this.currentUserProfile.name.split(' ');
                if (parts.length > 1) {
                    avatarBox.textContent = (parts[0][0] + parts[1][0]).toUpperCase();
                } else {
                    avatarBox.textContent = parts[0].substring(0, 2).toUpperCase();
                }
            }
        }
        // Auto-selecionar no form de venda
        const storeAssigned = document.getElementById('r-store-assigned');
        if (storeAssigned && role !== 'admin') {
            let sId = storeId;
            if (sId === 'matriz') sId = 'loja_1';
            if (sId === 'filial_1') sId = 'loja_2';
            if (sId === 'loja_1' || sId === 'loja_2') {
                storeAssigned.value = sId;
            }
        }

        if (role === 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
            this.loadAdminFilters();
        } else {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            this.loadSellerStoreFilters();
        }
    },

    loadSellerStoreFilters() {
        const selects = ['filter-client-store', 'filter-sale-store', 'dash-filter-store', 'report-filter-store'];
        selects.forEach(selectId => {
            const selectEl = document.getElementById(selectId);
            if (selectEl) {
                // Remove the admin-only lock
                if (selectEl.parentElement) {
                    selectEl.parentElement.style.display = 'flex';
                    selectEl.parentElement.classList.remove('admin-only'); // Prevent it from being hidden in subsequent calls
                }
                
                const label = selectEl.parentElement.querySelector('span');
                if (label) label.innerHTML = '<i class="fas fa-filter" style="margin-right:4px;"></i> Minhas Vendas / Loja';
                
                let html = '<option value="all">Faturamento Total (Todas as Lojas)</option>';
                html += '<option value="loja_1">🏢 Apenas Loja 1</option>';
                html += '<option value="loja_2">🏢 Apenas Loja 2</option>';
                
                selectEl.innerHTML = html;
            }
        });
        
        // Also fix the assigned seller in the sales and clients form so they can assign to themselves, but for any store.
        const assignSelect = document.getElementById('r-seller-assigned');
        const clientAssignSelect = document.getElementById('c-seller-assigned');
        const sellerOption = `<option value="${this.currentUserProfile.id || this.user.uid}" data-name="${this.currentUserProfile.name}" data-store="${this.currentUserProfile.storeId}">Minha Venda (${this.currentUserProfile.name})</option>`;
        const clientSellerOption = `<option value="${this.currentUserProfile.id || this.user.uid}" data-name="${this.currentUserProfile.name}" data-store="${this.currentUserProfile.storeId}">Minha Carteira (${this.currentUserProfile.name})</option>`;
        
        if (assignSelect) assignSelect.innerHTML = sellerOption;
        if (clientAssignSelect) clientAssignSelect.innerHTML = clientSellerOption;
    },

    loadAdminFilters() {
        if (!db) return;
        db.collection('users').get().then(snapshot => {
            const sellers = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.role === 'seller') {
                    sellers.push({ id: doc.id, ...data });
                }
            });
            
            const selects = ['filter-client-store', 'filter-sale-store', 'dash-filter-store', 'report-filter-store'];
            selects.forEach(selectId => {
                const selectEl = document.getElementById(selectId);
                if (selectEl) {
                    let html = '<option value="all">Rede Completa</option>';
                    html += '<option value="loja_1">🏢 Somente Loja 1 (Consolidado)</option>';
                    html += '<option value="loja_2">🏢 Somente Loja 2 (Consolidado)</option>';
                    
                    if (sellers.length > 0) {
                        html += '<optgroup label="Desempenho por Vendedor">';
                        sellers.forEach(s => {
                            html += `<option value="${s.id}">${s.name}</option>`;
                        });
                        html += '</optgroup>';
                    }
                    
                    selectEl.innerHTML = html;
                }
            });

            const assignSelect = document.getElementById('r-seller-assigned');
            const clientAssignSelect = document.getElementById('c-seller-assigned');
            if (assignSelect || clientAssignSelect) {
                let assignHtml = '<option value="me">Deixar Comigo (Minha Autoria)</option>';
                sellers.forEach(s => {
                    let sId = s.storeId;
                    if (sId === 'matriz') sId = 'loja_1';
                    if (sId === 'filial_1') sId = 'loja_2';
                    const storeName = sId === 'loja_1' ? 'Loja 1' : (sId === 'loja_2' ? 'Loja 2' : 'Global');
                    assignHtml += `<option value="${s.id}" data-name="${s.name}" data-store="${s.storeId}">${storeName} - ${s.name}</option>`;
                });
                if (assignSelect) assignSelect.innerHTML = assignHtml;
                if (clientAssignSelect) clientAssignSelect.innerHTML = assignHtml;
            }

            this.updateActiveViews();
        }).catch(err => console.error("Erro ao carregar filtros admin:", err));
    },



    listenData() {
        if(!db || !this.user || !this.currentUserProfile) return;
        
        let salesQuery = db.collection("sales");
        
        // Multi-Tenant: Vendedores veem APENAS suas próprias vendas (em toda a rede/todas as lojas)
        if (this.currentUserProfile.role !== 'admin') {
            salesQuery = salesQuery.where('sellerId', '==', this.user.uid);
        }

        this.unsubSales = salesQuery.onSnapshot((snapshot) => {
            this.sales = [];
            snapshot.forEach((doc) => {
                this.sales.push({ id: doc.id, ...doc.data() });
            });
            
            // Ordenação local em memória para evitar erro "The query requires an index" no Firebase
            this.sales.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            
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
        
        if (this.currentUserProfile.role === 'admin') {
            this.unsubExpenses = db.collection("expenses").orderBy("createdAt", "asc").onSnapshot((snapshot) => {
                this.expenses = [];
                snapshot.forEach((doc) => {
                    this.expenses.push({ id: doc.id, ...doc.data() });
                });
                this.updateActiveViews();
            }, (error) => console.log(error));
        }

        this.listenToLeads();
    },

    updateActiveViews() {
        this.renderDashboard();
        this.populateReportFilters();
        if (document.getElementById('page-reports') && document.getElementById('page-reports').classList.contains('active')) this.renderReports();
        if (document.getElementById('page-sales').classList.contains('active')) this.renderClientsTable();
        if (document.getElementById('page-clients').classList.contains('active')) this.renderClientsList();
        if (document.getElementById('page-products') && document.getElementById('page-products').classList.contains('active')) this.renderProductsList();
        if (document.getElementById('page-finance') && document.getElementById('page-finance').classList.contains('active') && this.renderFinanceDashboard) this.renderFinanceDashboard();
        if (document.getElementById('page-funnel') && document.getElementById('page-funnel').classList.contains('active')) this.renderFunnelBoard();
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

        const productFilter = document.getElementById('filter-product-catalog');
        if(productFilter) productFilter.addEventListener('input', () => this.renderProductsList());

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
        document.getElementById('c-shortName').value = client.shortName || '';
        document.getElementById('c-phone').value = client.phone || '';
        document.getElementById('c-email').value = client.email || '';
        document.getElementById('c-birthdate').value = client.birthdate || '';
        document.getElementById('c-city').value = client.city || '';
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
        
        document.body.classList.remove('sidebar-open');
        this.updateActiveViews();

        // Ocultar botão "Cancelar Ganho" se sair da tela de Registro para evitar confusões de estado
        if (pageId !== 'register') {
            const btnCancel = document.getElementById('btn-cancel-sale');
            if (btnCancel) btnCancel.style.display = 'none';
        }

        if (pageId === 'audit') {
            this.loadAuditLogs();
        }
    },

    clearSaleForm() {
        const form = document.getElementById('form-sale');
        if (form) form.reset();
        
        const dateInput = document.getElementById('r-date');
        if (dateInput) dateInput.valueAsDate = new Date();
        
        const cont = document.getElementById('sale-items-container');
        if (cont) { 
            cont.innerHTML = ''; 
            if(typeof this.addSaleItem === 'function') this.addSaleItem(); 
        }

        const storeAssigned = document.getElementById('r-store-assigned');
        if (storeAssigned && this.currentUserProfile) {
            let sId = this.currentUserProfile.storeId;
            if (sId === 'matriz') sId = 'loja_1';
            if (sId === 'filial_1') sId = 'loja_2';
            if (sId === 'loja_1' || sId === 'loja_2') {
                storeAssigned.value = sId;
            } else {
                storeAssigned.value = 'loja_1';
            }
        }
        
        // Se limpou manualmente, desvincula do funil anterior pra não bugar próximos saves
        const btnCancel = document.getElementById('btn-cancel-sale');
        if (btnCancel && btnCancel.style.display !== 'none') {
            btnCancel.style.display = 'none';
            if(this.originLeadWonId) {
                this.originLeadWonId = null; 
            }
        }
    },

    async cancelSaleProcess() {
        if (!this.originLeadWonId) {
            this.clearSaleForm();
            return;
        }

        this.confirmAction(
            "Cancelar Venda no Funil?",
            "Atenção: Ao prosseguir, o registro de venda será descartado e o Card deste cliente retornará automaticamente para a coluna 'Em Negociação' no seu Funil de Vendas para que você possa continuar o atendimento.\n\nConfirma essa ação?",
            async () => {
                try {
                    // Reverter Lead do status 'won' para 'negotiation'
                    await db.collection('leads').doc(this.originLeadWonId).update({
                        status: 'negotiation',
                        updatedAt: new Date().toISOString()
                    });

                    this.originLeadWonId = null;
                    this.clearSaleForm();
                    this.navigateTo('funnel');
                    this.showToast('Ganho desfeito e cliente retornado para Em Negociação!', 'info');
                    
                } catch (error) {
                    console.error("Erro ao cancelar venda do funil:", error);
                    this.showToast('Erro técnico ao desfazer o ganho no funil.', 'error');
                }
            },
            {
                confirmText: "Sim, Cancelar Venda",
                confirmColor: "#E11D48",
                iconClass: "fas fa-undo",
                iconBg: "#FFE4E6",
                iconColor: "#E11D48"
            }
        );
    },

    async saveAuditLog(resource, action, resourceId, details) {
        if (!db) return;
        try {
            const userProfile = this.currentUserProfile || { name: 'Sistema', role: 'system' };
            await db.collection('audit_logs').add({
                resource,
                action,
                resourceId,
                details,
                userName: userProfile.name || 'Desconhecido',
                userEmail: this.user ? this.user.email : 'Unknown',
                userRole: userProfile.role || 'seller',
                timestamp: new Date().toISOString()
            });
        } catch (e) {
            console.error("Falha ao registar log de auditoria", e);
        }
    },

    async loadAuditLogs() {
        if (!db || !this.currentUserProfile || this.currentUserProfile.role !== 'admin') {
            const tbody = document.getElementById('audit-logs-body');
            if(tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 32px;">Sem permissão para visualizar auditorias.</td></tr>`;
            return;
        }

        try {
            const filterStart = (document.getElementById('audit-filter-start') || {value:''}).value;
            const filterEnd = (document.getElementById('audit-filter-end') || {value:''}).value;
            const filterResource = (document.getElementById('audit-filter-resource') || {value:'all'}).value;
            let filterUser = (document.getElementById('audit-filter-user') || {value:''}).value;
            if (filterUser) filterUser = filterUser.toLowerCase().trim();

            // Usando limit 300 para garantir busca sem estourar quotas do firebase
            const snapshot = await db.collection('audit_logs').orderBy('timestamp', 'desc').limit(300).get();
            const tbody = document.getElementById('audit-logs-body');
            if(!tbody) return;
            
            let html = '';
            let count = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                const d = new Date(data.timestamp);
                
                // Application of Filters
                if (filterStart) {
                    const [y, m, dNum] = filterStart.split('-');
                    const startFull = new Date(y, m-1, dNum);
                    startFull.setHours(0,0,0,0);
                    if (d < startFull) return;
                }
                if (filterEnd) {
                    const [y, m, dNum] = filterEnd.split('-');
                    const endFull = new Date(y, m-1, dNum);
                    endFull.setHours(23,59,59,999);
                    if (d > endFull) return;
                }
                if (filterResource !== 'all' && data.resource !== filterResource) return;
                if (filterUser && data.userName && !data.userName.toLowerCase().includes(filterUser)) return;

                count++;
                
                let actionBadge = `<span style="background:#E2E8F0; color:#475569; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;"><i class="fas fa-pen"></i> Edição</span>`;
                if(data.action === 'delete') {
                    actionBadge = `<span style="background:#FEE2E2; color:#EF4444; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;"><i class="fas fa-trash"></i> Exclusão</span>`;
                } else if (data.action === 'attempt_delete') {
                    actionBadge = `<span style="background:#FEF3C7; color:#D97706; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600;"><i class="fas fa-shield-alt"></i> Exclusão Interceptada</span>`;
                }

                let roleText = data.userRole;
                if(roleText === 'seller') roleText = 'Vendedor';
                if(roleText === 'admin') roleText = 'Administrador';

                let resourceText = data.resource;
                if(resourceText === 'client') resourceText = 'Cliente';
                if(resourceText === 'sale') resourceText = 'Venda';
                if(resourceText === 'funnel') resourceText = 'Funil';

                html += `
                    <tr>
                        <td style="white-space:nowrap; font-size:13px; color:var(--text-muted)">
                            ${d.toLocaleDateString('pt-BR')} <br/><small>${d.toLocaleTimeString('pt-BR')}</small>
                        </td>
                        <td style="text-transform: capitalize;"><strong>${resourceText}</strong><br/>${actionBadge}</td>
                        <td>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div class="avatar" style="width:28px; height:28px; font-size:11px;">${(data.userName || 'U').substring(0,2).toUpperCase()}</div>
                                <div style="display:flex; flex-direction:column;">
                                    <strong>${data.userName}</strong>
                                    <span style="font-size:11px; color:var(--text-muted)">Perfil: ${roleText}</span>
                                </div>
                            </div>
                        </td>
                        <td style="font-size: 13px; color: var(--text-main); max-width: 300px; white-space: normal; line-height: 1.4;">
                            ${data.details}
                        </td>
                    </tr>
                `;
            });
            
            if (count === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 32px;">Nenhuma alteração encontrada para os filtros aplicados.</td></tr>`;
            } else {
                tbody.innerHTML = html;
            }
        } catch(e) {
            console.error("Erro ao carregar logs", e);
        }
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
        const rSellerAssigned = document.getElementById('r-seller-assigned');
        const rStoreAssigned = document.getElementById('r-store-assigned');
        if (rSellerAssigned && rStoreAssigned) {
            rSellerAssigned.addEventListener('change', (e) => {
                if (e.target.value !== 'me') {
                    const opt = e.target.options[e.target.selectedIndex];
                    const sellerStore = opt.getAttribute('data-store');
                    if (sellerStore) {
                        let sId = sellerStore;
                        if (sId === 'matriz') sId = 'loja_1';
                        if (sId === 'filial_1') sId = 'loja_2';
                        rStoreAssigned.value = sId;
                    }
                }
            });
        }

        // Autocomplete da cliente
        const inputName = document.getElementById('r-name');
        const inputPhone = document.getElementById('r-phone');
        const suggestionsBox = document.getElementById('client-suggestions');

        if (inputName && suggestionsBox) {
            inputName.addEventListener('input', () => {
                this.autoFillShortName(inputName.value);
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
                            
                            const inputShort = document.getElementById('r-shortName');
                            if (inputShort) {
                                inputShort.value = client.shortName || client.name.split(' ')[0];
                            }
                            
                            const rSeller = document.getElementById('r-seller-assigned');
                            if (rSeller && client.sellerId) {
                                rSeller.value = client.sellerId;
                            }
                            
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
                const prodInput = row.querySelector('.sale-item-product').value.trim();
                const qty = parseInt(row.querySelector('.sale-item-qty').value) || 1;
                if (prodInput) { 
                    const catalogProd = this.products.find(p => 
                        (p.name && p.name.trim().toLowerCase() === prodInput.toLowerCase()) || 
                        (p.barcode && p.barcode.trim() === prodInput)
                    );
                    const finalName = catalogProd ? catalogProd.name : prodInput;
                    const unitPrice = catalogProd && catalogProd.price ? catalogProd.price : 0;
                    items.push({ product: finalName, quantity: qty, price: unitPrice }); 
                    totalQty += qty; 
                }
            });

            if (items.length === 0) {
                this.showToast('Adicione pelo menos um produto antes de salvar.');
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }

            // Unrecognized product lock
            const hasUnknown = Array.from(itemRows).some(row => {
                const prodInput = row.querySelector('.sale-item-product').value.trim();
                return prodInput && !this.products.find(p => 
                    (p.name && p.name.trim().toLowerCase() === prodInput.toLowerCase()) || 
                    (p.barcode && p.barcode.trim() === prodInput)
                );
            });

            if (hasUnknown) {
                this.showToast('Você tem produtos órfãos (não cadastrados) nesta venda. Remova-os ou cadastre primeiro.', 'error');
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }

            const productNames = items.map(i => i.product).join(', ');
            const newSale = {
                name: document.getElementById('r-name').value,
                overrideShortName: document.getElementById('r-shortName') ? document.getElementById('r-shortName').value.trim() : '',
                phone: document.getElementById('r-phone').value,
                product: productNames,
                quantity: totalQty,
                items: items,
                value: parseFloat(document.getElementById('r-value').value) || 0,
                discount: parseFloat(document.getElementById('r-discount') ? document.getElementById('r-discount').value : 0) || 0,
                date: document.getElementById('r-date').value,
            };

            const storeSelect = document.getElementById('r-store-assigned');
            if (storeSelect && storeSelect.value) {
                newSale.overrideStoreId = storeSelect.value;
            }

            const assignSelect = document.getElementById('r-seller-assigned');
            if (assignSelect && assignSelect.value && assignSelect.value !== 'me') {
                newSale.overrideSellerId = assignSelect.value;
                const opt = assignSelect.options[assignSelect.selectedIndex];
                if (opt) {
                    newSale.overrideSellerName = opt.getAttribute('data-name');
                    // Store é definida unicamente pelo select "Loja do Atendimento"
                }
            }

            // --- COMMISSION CALCULATION ---
            let commPerc = window.app && window.app.commissionConfig ? parseFloat(window.app.commissionConfig.globalRate) || 0 : 0;
            let targetSellerId = newSale.overrideSellerId || (window.app && window.app.user ? window.app.user.uid : null);
            
            if (window.app && window.app.teamUsersList && targetSellerId) {
                const targetUser = window.app.teamUsersList.find(u => u.id === targetSellerId);
                if (targetUser && targetUser.commissionRate !== undefined && targetUser.commissionRate !== null && targetUser.commissionRate !== '') {
                    commPerc = parseFloat(targetUser.commissionRate) || 0;
                }
            }
            newSale.commissionPerc = commPerc;
            newSale.commissionValue = newSale.value * (commPerc / 100);
            // ------------------------------

            // Auto-register client if not exists
            const phoneStr = newSale.phone.replace(/\D/g, '');
            let associatedClientShortName = newSale.overrideShortName;
            if(!this.clients.find(c => c.phone.replace(/\D/g, '') === phoneStr)) {
                await this.saveClient({name: newSale.name, shortName: newSale.overrideShortName, phone: newSale.phone, email: ''});
            } else {
                const existingClient = this.clients.find(c => c.phone.replace(/\D/g, '') === phoneStr);
                if (existingClient && !associatedClientShortName) associatedClientShortName = existingClient.shortName;
            }

            const saleId = await this.saveSale(newSale);
            
            // Auto send WhatsApp Message if API is active
            let isApiActive = false;
            if (this.apiSettings) {
                if (this.apiSettings.active) isApiActive = true;
                if (this.apiSettings.instances && this.apiSettings.instances.some(i => i.active)) isApiActive = true;
            }

            if (isApiActive && saleId) {
                const actionMsg = this.parseTemplate('thanks', newSale.name, associatedClientShortName, newSale.product);
                const targetStore = newSale.overrideStoreId || (this.currentUserProfile ? this.currentUserProfile.storeId : 'loja_1');
                this.sendWhatsAppMessage(newSale.phone, actionMsg, this.msgTemplates.thanksImg, 'image', targetStore).then(async (success) => {
                    const status = success ? 'sent' : 'failed';
                    await db.collection('sales').doc(saleId).update({ msg_thanks_status: status });
                    if(success) this.showToast('Mensagem enviada via API WhatsApp!');
                });
            }
            
            btn.innerHTML = originalText;
            btn.disabled = false;
            
            // Depois do registro finalizar com sucesso, limpamos a tela e o histórico de Funil.
            this.originLeadWonId = null;
            this.clearSaleForm();
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
                    shortName: document.getElementById('c-shortName') ? document.getElementById('c-shortName').value.trim() : '',
                    phone: document.getElementById('c-phone').value,
                    email: document.getElementById('c-email').value || '',
                    birthdate: document.getElementById('c-birthdate').value || '',
                    city: document.getElementById('c-city').value || ''
                };
                
                const assignedSellerSel = document.getElementById('c-seller-assigned');
                if (assignedSellerSel && !assignedSellerSel.disabled) {
                    let sellerId = assignedSellerSel.value;
                    if (sellerId === 'me') sellerId = this.user.uid;
                    
                    newClient.sellerId = sellerId;
                    
                    const opt = assignedSellerSel.options[assignedSellerSel.selectedIndex];
                    if (opt && opt.dataset.name) newClient.sellerName = opt.dataset.name;
                    else if (sellerId === this.user.uid) newClient.sellerName = this.currentUserProfile.name;
                }

                let storeId = 'loja_1';
                const storeSelector = document.getElementById('c-store-assigned');
                if (storeSelector && this.currentUserProfile && this.currentUserProfile.role === 'admin') {
                    storeId = storeSelector.value;
                } else if (this.currentUserProfile) {
                    const assignedSellerSel = document.getElementById('c-seller-assigned');
                    if (assignedSellerSel && !assignedSellerSel.disabled) {
                        const opt = assignedSellerSel.options[assignedSellerSel.selectedIndex];
                        if (opt && opt.dataset.store) storeId = opt.dataset.store;
                        else storeId = this.currentUserProfile.storeId || 'loja_1';
                    } else {
                        storeId = this.currentUserProfile.storeId || 'loja_1';
                    }
                }
                newClient.storeId = storeId;

                if (this.editingClientId) {
                    const oldClient = this.clients.find(c => c.id === this.editingClientId) || {};
                    await this.updateClient(this.editingClientId, newClient);
                    
                    let changes = [];
                    if ((oldClient.name || '') !== (newClient.name || '')) changes.push(`<strong>Nome:</strong> ${oldClient.name || "Vazio"} ➔ ${newClient.name || "Vazio"}`);
                    if ((oldClient.phone || '') !== (newClient.phone || '')) changes.push(`<strong>Tel:</strong> ${oldClient.phone || "Vazio"} ➔ ${newClient.phone || "Vazio"}`);
                    if ((oldClient.email || '') !== (newClient.email || '')) changes.push(`<strong>E-mail:</strong> ${oldClient.email || "Vazio"} ➔ ${newClient.email || "Vazio"}`);
                    if ((oldClient.birthdate || '') !== (newClient.birthdate || '')) changes.push(`<strong>Anivesário:</strong> ${oldClient.birthdate || "Vazio"} ➔ ${newClient.birthdate || "Vazio"}`);
                    if ((oldClient.city || '') !== (newClient.city || '')) changes.push(`<strong>Cidade:</strong> ${oldClient.city || "Vazio"} ➔ ${newClient.city || "Vazio"}`);
                    
                    let detailsStr = changes.length > 0 ? changes.join('<br>') : 'Atualizado sem perdas visíveis.';
                    await this.saveAuditLog('client', 'edit', this.editingClientId, detailsStr);
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
                    barcode: document.getElementById('p-barcode').value.trim(),
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
                if (!this.apiSettings) this.apiSettings = {};
                this.apiSettings.instances = [];
                
                const container = document.getElementById('api-instances-container');
                if (container) {
                    const rows = container.children;
                    for (let i = 0; i < rows.length; i++) {
                        const row = rows[i];
                        const storeId = row.querySelector('.api-v-store').value;
                        const provider = row.querySelector('.api-v-provider').value;
                        const url = row.querySelector('.api-v-url').value;
                        const token = row.querySelector('.api-v-token').value;
                        const active = row.querySelector('.api-v-active').checked;
                        this.apiSettings.instances.push({ id: Date.now() + i, storeId, provider, url, token, active });
                    }
                }
                
                // Compatibilidade com possíveis scripts legados guardando a primeira conexão na root
                if (this.apiSettings.instances.length > 0) {
                    const first = this.apiSettings.instances[0];
                    this.apiSettings.url = first.url;
                    this.apiSettings.token = first.token;
                    this.apiSettings.provider = first.provider;
                    this.apiSettings.active = first.active;
                }
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
                    d15: document.getElementById('tpl-15d') ? document.getElementById('tpl-15d').value : '',
                    d15Img: document.getElementById('tpl-15d-img') ? document.getElementById('tpl-15d-img').value : '',
                    restock: document.getElementById('tpl-restock').value,
                    restockImg: document.getElementById('tpl-restock-img') ? document.getElementById('tpl-restock-img').value : '',
                    dormant: document.getElementById('tpl-dormant').value,
                    dormantImg: document.getElementById('tpl-dormant-img') ? document.getElementById('tpl-dormant-img').value : '',
                    lost: document.getElementById('tpl-lost').value,
                    lostImg: document.getElementById('tpl-lost-img') ? document.getElementById('tpl-lost-img').value : '',
                    birthday: document.getElementById('tpl-birthday') ? document.getElementById('tpl-birthday').value : '',
                    birthdayImg: document.getElementById('tpl-birthday-img') ? document.getElementById('tpl-birthday-img').value : '',
                    promo: promos
                };

                try {
                    await db.collection("settings").doc("msg_templates").set(this.msgTemplates);
                    
                    const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

                    const pixConfig = {
                        loja_1: {
                            pixKey: val('pix-key-loja_1'),
                            merchant: val('pix-merchant-loja_1'),
                            city: val('pix-city-loja_1')
                        },
                        loja_2: {
                            pixKey: val('pix-key-loja_2'),
                            merchant: val('pix-merchant-loja_2'),
                            city: val('pix-city-loja_2')
                        }
                    };
                    await db.collection("settings").doc("pix_config").set(pixConfig);
                    this.pixConfig = pixConfig;

                    this.showToast('Configurações salvas atualizadas com sucesso!');
                    this.renderDashboard(); 
                } catch(err) {
                    console.error(err);
                    this.showToast('Erro ao salvar as configurações.');
                }
                
                btn.innerHTML = originalText;
                btn.disabled = false;
            });
        }

        const promoProductInput = document.getElementById('promo-product');
        const promoLinkInput = document.getElementById('promo-link');
        if (promoProductInput) promoProductInput.addEventListener('input', () => this.updatePromoPreview());
        if (promoLinkInput) {
            promoLinkInput.addEventListener('input', (e) => {
                try {
                    const linkVal = e.target.value;
                    const url = new URL(linkVal);
                    if (url.searchParams.has('cart')) {
                        const cartB64 = url.searchParams.get('cart');
                        const binaryStr = atob(cartB64);
                        const bytes = new Uint8Array(binaryStr.length);
                        for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); }
                        const jsonStr = new TextDecoder().decode(bytes);
                        const products = JSON.parse(jsonStr);
                        
                        if (products && products.length > 0) {
                            let combinedNames = products.map(p => p.n).join(', ');
                            const lastComma = combinedNames.lastIndexOf(', ');
                            if (lastComma !== -1) {
                                combinedNames = combinedNames.substring(0, lastComma) + ' e ' + combinedNames.substring(lastComma + 2);
                            }
                            const prodInput = document.getElementById('promo-product');
                            if (prodInput) {
                                prodInput.value = combinedNames;
                            }
                        }
                    } else if (url.searchParams.has('product')) {
                        const prodName = url.searchParams.get('product');
                        const prodInput = document.getElementById('promo-product');
                        if (prodInput && prodName) {
                            prodInput.value = prodName;
                        }
                    }
                } catch(err) {
                    // Ignore invalid url parse
                }
                this.updatePromoPreview();
            });
        }

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
                        
                        let finalLink = link;
                        try {
                            if (finalLink && finalLink.includes('checkout.html')) {
                                const url = new URL(finalLink);
                                const targetStore = client.storeId || 'loja_1';
                                let pKey = '', pMerchant = '', pCity = '';
                                
                                if (targetStore === 'loja_2' && this.pixConfig?.loja_2?.pixKey) {
                                    pKey = this.pixConfig.loja_2.pixKey;
                                    pMerchant = this.pixConfig.loja_2.merchant;
                                    pCity = this.pixConfig.loja_2.city;
                                } else if (this.pixConfig?.loja_1?.pixKey) {
                                    pKey = this.pixConfig.loja_1.pixKey;
                                    pMerchant = this.pixConfig.loja_1.merchant;
                                    pCity = this.pixConfig.loja_1.city;
                                } else {
                                    pKey = this.pixConfig?.pixKey || '';
                                    pMerchant = this.pixConfig?.merchant || '';
                                    pCity = this.pixConfig?.city || '';
                                }

                                if (pKey) {
                                    url.searchParams.set('key', pKey);
                                    url.searchParams.set('merchant', pMerchant);
                                    url.searchParams.set('city', pCity);
                                    finalLink = url.toString();
                                }
                            }
                        } catch(err) {
                            // ignore invalid url replacement
                        }

                        const msg = activeTplText.replace(/{nome}/g, client.name.split(' ')[0]).replace(/{produto}/g, product || 'produto').replace(/{link}/g, finalLink);
                        if (hasApi) {
                            // Envia via API (Z-API / Evolution) roteando automaticamente para a loja do cliente
                            const targetStore = client.storeId || 'loja_1';
                            const success = await this.sendWhatsAppMessage(client.phone, msg, activeTplImg, 'image', targetStore);
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

    agendaOrigin: null,
    agendaData: [],

    openAgendaModal(origin) {
        this.agendaOrigin = origin;
        const modal = document.getElementById('agenda-modal-overlay');
        const listBody = document.getElementById('agenda-list-body');
        const container = document.getElementById('agenda-list-container');
        const loader = document.getElementById('agenda-loading');
        const actions = document.getElementById('agenda-batch-actions');
        const selectStore = document.getElementById('agenda-instance-select');
        
        if (selectStore) {
             const adminOptions = ['matriz', 'admin', ''];
             const sid = this.currentUserProfile?.storeId;
             if (!sid || adminOptions.includes(sid.toLowerCase())) {
                 selectStore.value = 'loja_1';
             } else if (selectStore.querySelector(`option[value="${sid}"]`)) {
                 selectStore.value = sid;
             } else {
                 selectStore.value = 'loja_1';
             }
        }

        if (modal) modal.classList.add('active');
        if (listBody) listBody.innerHTML = '';
        if (container) container.style.display = 'none';
        if (actions) {
             actions.style.display = origin === 'clients' ? 'flex' : 'none';
        }
        if (loader) loader.style.display = 'block';

        this.loadDeviceContacts();
    },

    closeAgendaModal() {
        const modal = document.getElementById('agenda-modal-overlay');
        if (modal) modal.classList.remove('active');
    },

    async loadDeviceContacts() {
        const selectStore = document.getElementById('agenda-instance-select');
        const targetStoreId = selectStore ? selectStore.value : (this.currentUserProfile?.storeId || 'loja_1');
        
        const loader = document.getElementById('agenda-loading');
        const container = document.getElementById('agenda-list-container');
        if (loader) loader.style.display = 'block';
        if (container) container.style.display = 'none';

        const contacts = await this.fetchDeviceContacts(targetStoreId);
        this.agendaData = contacts;
        
        this.renderAgendaList(this.agendaData);

        if (loader) loader.style.display = 'none';
        if (container) container.style.display = 'block';
    },

    renderAgendaList(data) {
        const listBody = document.getElementById('agenda-list-body');
        if (!listBody) return;
        
        listBody.innerHTML = '';
        
        if (!data || data.length === 0) {
            listBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px;">Nenhum contato encontrado no aparelho da Loja.</td></tr>';
            return;
        }

        data.forEach(c => {
            const tr = document.createElement('tr');
            // Try to resolve the best name
            let rawName = c.name || c.pushName || c.shortName || '';
            let rawTel = String(c.id || c.phone || c.number || '').replace(/\D/g, '');
            if (!rawTel) return;
            if (!rawName) rawName = rawTel;
            
            const existingClient = this.clients.find(dbClient => dbClient.phone && String(dbClient.phone).replace(/\D/g, '') === rawTel);

            if (this.agendaOrigin === 'clients') {
                if (existingClient) {
                    tr.style.opacity = '0.6';
                    tr.style.background = '#F8FAFC';
                    tr.innerHTML = `
                        <td style="text-align: center;"><i class="fas fa-check" style="color: #64748B;"></i></td>
                        <td style="font-size: 14px;">${rawName} <span style="background: #E2E8F0; color: #475569; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: 500;">Já no CRM</span></td>
                        <td style="font-size: 14px; font-variant-numeric: tabular-nums;">${rawTel}</td>
                    `;
                } else {
                    tr.innerHTML = `
                        <td style="text-align: center;"><input type="checkbox" class="agenda-checkbox" data-name="${rawName}" data-phone="${rawTel}"></td>
                        <td style="font-size: 14px;">${rawName}</td>
                        <td style="font-size: 14px; font-variant-numeric: tabular-nums;">${rawTel}</td>
                    `;
                }
            } else {
                tr.innerHTML = `
                    <td style="text-align: center;">
                        <button class="btn-icon" style="color: #25D366; background: #DCFCE7; border-radius: 50%; padding: 6px; width: 32px; height: 32px;" onclick="app.startFunnelChatFromAgenda('${rawName}', '${rawTel}', event)" title="Iniciar Conversa">
                            <i class="fas fa-comment"></i>
                        </button>
                    </td>
                    <td style="font-size: 14px;">${rawName}</td>
                    <td style="font-size: 14px; font-variant-numeric: tabular-nums;">${rawTel}</td>
                `;
            }
            listBody.appendChild(tr);
        });
    },

    filterAgendaList() {
        const val = (document.getElementById('agenda-search-input')?.value || '').toLowerCase().trim();
        if (!val) {
             this.renderAgendaList(this.agendaData);
             return;
        }
        
        const filtered = this.agendaData.filter(c => {
             const nome = (c.name || c.id || c.pushName || '').toLowerCase();
             const tel = String(c.id || c.phone || '').toLowerCase();
             return nome.includes(val) || tel.includes(val);
        });
        
        this.renderAgendaList(filtered);
    },

    toggleSelectAllAgenda(checkbox) {
        document.querySelectorAll('.agenda-checkbox').forEach(cb => cb.checked = checkbox.checked);
    },

    async importSelectedAgendaToClients() {
        if (!db) return;
        const checkboxes = document.querySelectorAll('.agenda-checkbox:checked');
        if (checkboxes.length === 0) {
            this.showToast("Nenhum contato selecionado!");
            return;
        }

        const btn = document.querySelector('#agenda-batch-actions .btn-primary');
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando em Lote...';
        btn.disabled = true;

        try {
            let batch = db.batch();
            let count = 0;
            const selectStore = document.getElementById('agenda-instance-select');
            const explicitStoreId = selectStore ? selectStore.value : 'loja_1';

            checkboxes.forEach(cb => {
                const docRef = db.collection('clients').doc();
                const clientData = {
                    name: cb.getAttribute('data-name'),
                    phone: cb.getAttribute('data-phone'),
                    email: '',
                    storeId: explicitStoreId,
                    createdAt: new Date().toISOString()
                };
                
                if (this.user && this.currentUserProfile) {
                    clientData.sellerId = this.user.uid;
                    clientData.sellerName = this.currentUserProfile.name || 'Sistema';
                }
                
                batch.set(docRef, clientData);
                count++;
            });

            await batch.commit();
            
            this.showToast(`${count} contatos salvos no CRM com sucesso!`);
            this.closeAgendaModal();
            this.navigateTo('clients'); 
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao importar contatos.');
        }

        btn.innerHTML = origHtml;
        btn.disabled = false;
    },

    async startFunnelChatFromAgenda(name, phone, event) {
        if (!db) return;
        
        if(event && event.currentTarget) {
            event.currentTarget.disabled = true;
            event.currentTarget.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            const cleanPhone = String(phone).replace(/\D/g, '');
            const leadData = {
                name: name,
                phone: cleanPhone,
                status: 'inbox',
                value: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            if (this.user && this.currentUserProfile) {
                leadData.sellerId = this.user.uid;
                leadData.sellerName = this.currentUserProfile.name || 'Sistema';
                leadData.storeId = this.currentUserProfile.storeId || 'loja_1';
            }

            const snap = await db.collection("leads").where("phone", "==", cleanPhone).get();
            let leadId = null;
            if (!snap.empty) {
                leadId = snap.docs[0].id;
                await db.collection("leads").doc(leadId).update({ status: 'inbox', updatedAt: new Date().toISOString() });
            } else {
                const docRef = await db.collection('leads').add(leadData);
                leadId = docRef.id;
            }

            this.closeAgendaModal();
            this.navigateTo('funnel');
            
            setTimeout(() => {
                const searchBox = document.getElementById('filter-funnel-search');
                if (searchBox) { searchBox.value = cleanPhone; this.renderFunnelBoard(); }
            }, 600);
            
            this.showToast('Conversa iniciada centralizada no Funil!');
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao iniciar chat.');
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
    ...utilsModule,
    ...funnelModule,
    ...financeModule
};

window.app = app; // Manda pro window pro HTML (onclick) conseguir achar

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
