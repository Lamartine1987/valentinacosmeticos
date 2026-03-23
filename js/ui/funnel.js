import { firebase, db } from '../config/firebase.js';

export const funnelModule = {
    leadsList: [],
    unsubLeads: null,
    unsubChat: null,
    activeLeadId: null,
    activeLeadPhone: null,
    sortables: [],

    setupFunnel() {
        if (!db) return;
        const columns = document.querySelectorAll('.kanban-cards');
        const that = this;
        
        columns.forEach(col => {
            const sortable = new Sortable(col, {
                group: 'kanban',
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: function (evt) {
                    const itemEl = evt.item;
                    const toList = evt.to;
                    const leadId = itemEl.getAttribute('data-id');
                    const newStatus = toList.parentElement.getAttribute('data-status');
                    
                    that.updateLeadStatus(leadId, newStatus);
                },
            });
            this.sortables.push(sortable);
        });
    },

    listenToLeads() {
        if(!db || !this.user) return;
        
        this.unsubLeads = db.collection('leads').onSnapshot((snapshot) => {
            this.leadsList = [];
            snapshot.forEach(doc => {
                this.leadsList.push({ id: doc.id, ...doc.data() });
            });
            this.updateActiveViews();
        }, (error) => {
            console.error("Erro ao ouvir leads: ", error);
        });
    },

    async updateLeadStatus(leadId, newStatus) {
        if(!leadId || !newStatus || !db) return;
        
        try {
            await db.collection('leads').doc(leadId).update({
                status: newStatus,
                updatedAt: new Date().toISOString()
            });
            
            if(newStatus === 'won') {
                const lead = this.leadsList.find(l => l.id === leadId);
                if(lead) {
                    if(confirm(`Oba! Negócio com ${lead.name} ganho!\nDeseja registrar a venda agora?`)) {
                        this.navigateTo('register');
                        setTimeout(() => {
                            if(document.getElementById('r-name')) {
                                document.getElementById('r-name').value = lead.name || '';
                            }
                            if(document.getElementById('r-phone')) {
                                document.getElementById('r-phone').value = lead.phone || '';
                            }
                        }, 100);
                    }
                }
            }
        } catch(e) {
            console.error("Erro ao atualizar status:", e);
            this.showToast('Erro ao mover card!');
        }
    },

    renderFunnelBoard() {
        const columns = ['inbox', 'negotiation', 'waiting', 'won', 'lost'];
        const listContainers = {};
        const counters = {};
        
        columns.forEach(col => {
            listContainers[col] = document.getElementById(`list-${col}`);
            counters[col] = document.getElementById(`count-${col}`);
            if(listContainers[col]) listContainers[col].innerHTML = '';
            if(counters[col]) counters[col].textContent = '0';
        });

        const counts = { inbox: 0, negotiation: 0, waiting: 0, won: 0, lost: 0 };

        this.leadsList.forEach(lead => {
            const status = lead.status || 'inbox';
            if(!listContainers[status]) return;

            counts[status]++;

            const card = document.createElement('div');
            card.className = 'k-card';
            card.setAttribute('data-id', lead.id);
            // Evitar que o clique durante o arraste acione o modal
            let isDragging = false;
            card.addEventListener('mousedown', () => isDragging = false);
            card.addEventListener('mousemove', () => isDragging = true);
            card.addEventListener('click', (e) => {
                if(!isDragging) {
                    this.openLeadSidebar(lead);
                }
            });

            const valStr = lead.value ? Number(lead.value).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : 'R$ 0,00';
            const phoneStr = lead.phone || 'Sem número';
            
            let tagHtml = '';
            if(status === 'inbox') tagHtml = '<span class="k-card-tag" style="background:#E0E7FF; color:#4F46E5;">Novo</span>';
            else if(status === 'waiting') tagHtml = '<span class="k-card-tag" style="background:#FEF3C7; color:#D97706;">Pendente</span>';

            card.innerHTML = `
                <div class="k-card-title">
                    ${lead.name || 'Desconhecido'}
                    ${lead.unread ? '<i class="fas fa-circle" style="color:#EF4444; font-size:10px; margin-left:6px; animation: pulse 1s infinite alternate;" title="Nova mensagem não lida"></i>' : ''}
                </div>
                <div class="k-card-meta" style="margin-bottom: 8px;">
                    <span><i class="fab fa-whatsapp" style="color:#25D366;"></i> ${phoneStr}</span>
                </div>
                <div class="k-card-meta">
                    <span class="k-card-value">${valStr}</span>
                    ${tagHtml}
                </div>
            `;
            listContainers[status].appendChild(card);
        });

        columns.forEach(col => {
            if(counters[col]) counters[col].textContent = counts[col];
        });
    },

    async addTestLead() {
        if(!db) return;
        try {
            await db.collection('leads').add({
                name: 'Cliente Teste ' + Math.floor(Math.random() * 1000),
                phone: '11999998888',
                value: 150,
                status: 'inbox',
                createdAt: new Date().toISOString()
            });
            this.showToast('Lead de teste adicionado!');
        } catch(e) {
            console.error(e);
        }
    },

    openLeadSidebar(lead) {
        this.activeLeadId = lead.id;
        this.activeLeadPhone = lead.phone;
        
        // Marcar como lido imediatamente no banco
        if (lead.unread) {
            db.collection('leads').doc(lead.id).update({
                unread: false
            }).catch(e => console.error("Erro ao marcar como lido", e));
        }
        
        document.getElementById('lead-sb-name').textContent = lead.name || 'Desconhecido';
        document.getElementById('lead-sb-phone').innerHTML = `<i class="fab fa-whatsapp" style="color:#25D366;"></i> ${lead.phone || 'Sem número'}`;
        document.getElementById('lead-sb-value').textContent = lead.value ? Number(lead.value).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : 'R$ 0,00';
        
        const statusMap = {
            'inbox': 'Caixa de Entrada',
            'negotiation': 'Em Atendimento',
            'waiting': 'Aguardando Pagamento',
            'won': 'Fechado Ganho',
            'lost': 'Perdido'
        };
        document.getElementById('lead-sb-status').textContent = statusMap[lead.status] || 'Caixa de Entrada';
        
        const chatArea = document.getElementById('lead-sb-chat');
        chatArea.innerHTML = `<div style="text-align: center; color: #667781; padding: 20px;">Carregando histórico...</div>`;
        
        if (this.unsubChat) {
            this.unsubChat();
            this.unsubChat = null;
        }
        
        this.unsubChat = db.collection('leads').doc(lead.id).collection('messages').orderBy('timestamp', 'asc').onSnapshot(snapshot => {
            chatArea.innerHTML = '';
            
            if (snapshot.empty) {
                chatArea.innerHTML = `<div style="text-align: center; font-size: 12px; color: #667781; background: rgba(255,255,255,0.8); margin: 0 auto; padding: 4px 10px; border-radius: 8px; margin-bottom: 8px;">Nenhuma mensagem ainda. Envie um "Oi"!</div>`;
                return;
            }
            
            snapshot.forEach(doc => {
                const msg = doc.data();
                const d = msg.timestamp ? msg.timestamp.toDate() : new Date();
                const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                
                if (msg.sender === 'agent') {
                    chatArea.innerHTML += `
                        <div class="wa-bubble wa-bubble-agent" style="animation: fadeIn 0.3s ease;">
                            ${msg.text}
                            <div class="wa-bubble-time">${timeStr} <i class="fas fa-check" style="color:#8BA1AD;"></i></div>
                        </div>
                    `;
                } else {
                    chatArea.innerHTML += `
                        <div class="wa-bubble wa-bubble-client" style="animation: fadeIn 0.3s ease;">
                            ${msg.text}
                            <div class="wa-bubble-time" style="justify-content: flex-start;">${timeStr}</div>
                        </div>
                    `;
                }
            });
            
            chatArea.scrollTop = chatArea.scrollHeight;
        });
        
        document.getElementById('lead-sidebar-overlay').classList.add('active');
    },

    closeLeadSidebar() {
        if (this.unsubChat) {
            this.unsubChat();
            this.unsubChat = null;
        }
        this.activeLeadId = null;
        this.activeLeadPhone = null;
        document.getElementById('lead-sidebar-overlay').classList.remove('active');
    },

    async sendLeadMessage() {
        const input = document.getElementById('lead-sb-input');
        const text = input.value.trim();
        if(!text || !this.activeLeadId || !this.activeLeadPhone) return;
        
        // Despacha a mensagem usando a API conectada
        if (typeof this.sendWhatsAppMessage === 'function') {
            const success = await this.sendWhatsAppMessage(this.activeLeadPhone, text);
            if (!success) {
                if(this.showToast) this.showToast('Erro ao enviar mensagem pelo WhatsApp.', 'error');
                return;
            }
        }
        
        try {
            await db.collection('leads').doc(this.activeLeadId).collection('messages').add({
                text: text,
                sender: 'agent',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            input.value = '';
        } catch(e) {
            console.error("Erro ao salvar mensagem:", e);
        }
    }
};
