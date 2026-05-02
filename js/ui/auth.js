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
                if (window.app && typeof window.app.fetchAnnouncement === 'function') {
                    window.app.fetchAnnouncement();
                }
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
        // Desconecta os radares do banco ANTES de jogar a chave fora (evita erro vermelho fantasma)
        if (this.unsubSales) this.unsubSales();
        if (this.unsubPromos) this.unsubPromos();
        if (this.unsubClients) this.unsubClients();
        if (this.unsubProducts) this.unsubProducts();
        if (this.unsubExpenses) this.unsubExpenses();
        if (this.unsubLeads) this.unsubLeads();
        if (this.unsubChat) this.unsubChat();
        
        firebase.auth().signOut().then(() => {
            this.showToast('Você saiu do sistema.');
            this.sales = []; this.clients = []; this.products = []; this.leadsList = [];
            this.updateActiveViews();
        });
    },

    requestPasswordChange() {
        if (!this.user || !this.user.email) return;
        const modal = document.getElementById('password-modal-overlay');
        if (modal) {
            document.getElementById('form-change-password').reset();
            document.getElementById('cp-error').style.display = 'none';
            modal.classList.add('active');
        }
    },

    closePasswordModal() {
        const modal = document.getElementById('password-modal-overlay');
        if (modal) modal.classList.remove('active');
    },

    async submitPasswordChange(e) {
        e.preventDefault();
        const currentPass = document.getElementById('cp-current').value;
        const newPass = document.getElementById('cp-new').value;
        const confirmPass = document.getElementById('cp-confirm').value;
        const errorDiv = document.getElementById('cp-error');
        const btn = e.target.querySelector('button[type="submit"]');

        errorDiv.style.display = 'none';

        if (newPass !== confirmPass) {
            errorDiv.innerText = 'A nova senha e a confirmação não conferem.';
            errorDiv.style.display = 'block';
            return;
        }

        if (newPass.length < 6) {
            errorDiv.innerText = 'A nova senha deve ter pelo menos 6 caracteres.';
            errorDiv.style.display = 'block';
            return;
        }

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
        btn.disabled = true;

        try {
            // 1. Re-authenticamos o usuário para obter token fresco
            const credential = firebase.auth.EmailAuthProvider.credential(this.user.email, currentPass);
            await this.user.reauthenticateWithCredential(credential);
            
            // 2. Atualizamos a senha
            await this.user.updatePassword(newPass);
            
            if (typeof this.showToast === 'function') this.showToast('Senha atualizada com sucesso!', 'info');
            this.closePasswordModal();
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/wrong-password') {
                errorDiv.innerText = 'A senha atual está incorreta.';
            } else if (err.code === 'auth/too-many-requests') {
                errorDiv.innerText = 'Muitas tentativas. Tente novamente mais tarde.';
            } else {
                errorDiv.innerText = 'Erro ao atualizar a senha. Verifique os dados.';
            }
            errorDiv.style.display = 'block';
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};
