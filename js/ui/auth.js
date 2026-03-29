import { firebase } from '../config/firebase.js';

export const authModule = {
    setupAuth() {
        firebase.auth().onAuthStateChanged(async user => {
            const loginScreen = document.getElementById('login-overlay');
            if (user) {
                this.user = user;
                
                // Fetch User Profile SaaS Multi-Tenant
                try {
                    const db = firebase.firestore();
                    const doc = await db.collection("users").doc(user.uid).get();
                    if (doc.exists) {
                        this.userProfile = doc.data();
                    } else {
                        // Fallback Master Admin creation
                        this.userProfile = {
                            role: 'admin',
                            storeId: 'all',
                            name: 'Administrador Principal',
                            email: user.email
                        };
                        await db.collection("users").doc(user.uid).set(this.userProfile);
                    }
                } catch(err) {
                    console.error("Erro ao carregar perfil:", err);
                    this.userProfile = { role: 'admin', storeId: 'all', name: 'Administrador (Root)' };
                }

                if (window.app) window.app.currentUserProfile = this.userProfile;
                else this.currentUserProfile = this.userProfile;

                if (window.app && typeof window.app.applyPermissions === 'function') {
                    window.app.applyPermissions();
                }

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

    logout() {
        firebase.auth().signOut().then(() => {
            this.showToast('Você saiu do sistema.');
            this.sales = []; this.clients = []; this.products = [];
            this.updateActiveViews();
        });
    }
};
