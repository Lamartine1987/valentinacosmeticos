import { firebase, db } from '../config/firebase.js';

export const funnelModule = {
    leadsList: [],
    unsubLeads: null,
    unsubChat: null,
    activeLeadId: null,
    activeLeadPhone: null,
    sortables: [],
    pendingChatFile: null,

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

        // Setup Emoji Picker Event Listeners
        setTimeout(() => {
            const picker = document.querySelector('emoji-picker');
            if (picker) {
                picker.addEventListener('emoji-click', event => {
                    const input = document.getElementById('lead-sb-input');
                    input.value += event.detail.unicode;
                    input.focus();
                });
            }
            document.addEventListener('click', e => {
                const pickerEl = document.getElementById('emoji-picker-container');
                const btn = document.querySelector('[title="Adicionar Emoji"]');
                if (pickerEl && !pickerEl.contains(e.target) && e.target !== btn && (!btn || !btn.contains(e.target))) {
                    pickerEl.style.display = 'none';
                }
            });
        }, 1000);
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
                    this.confirmAction(
                        "Negócio Ganho! 🎉", 
                        `Oba! Negócio com ${lead.name} ganho!\nDeseja registrar a venda agora?`, 
                        () => {
                            return new Promise(resolve => {
                                this.navigateTo('register');
                                setTimeout(() => {
                                    if(document.getElementById('r-name')) {
                                        document.getElementById('r-name').value = lead.name || '';
                                    }
                                    if(document.getElementById('r-phone')) {
                                        document.getElementById('r-phone').value = lead.phone || '';
                                    }
                                    resolve();
                                }, 100);
                            });
                        },
                        {
                            confirmText: "Sim, Registrar",
                            confirmColor: "#10B981",
                            iconClass: "fas fa-check-circle",
                            iconBg: "#D1FAE5",
                            iconColor: "#10B981"
                        }
                    );
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
                <div class="k-card-title" style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <span>
                        ${lead.name || 'Desconhecido'}
                        ${lead.unread ? '<i class="fas fa-circle" style="color:#EF4444; font-size:10px; margin-left:6px; animation: pulse 1s infinite alternate;" title="Nova mensagem não lida"></i>' : ''}
                    </span>
                    <button class="btn-icon" style="color: #EF4444; padding: 2px;" onclick="event.stopPropagation(); app.deleteLeadCard('${lead.id}')" title="Excluir Conversa">
                        <i class="fas fa-trash" style="font-size: 13px;"></i>
                    </button>
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
        
        this.cancelReply();
        if(typeof this.cancelUpload === 'function') this.cancelUpload();

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
                const senderName = msg.sender === 'agent' ? 'Você' : (lead.name || 'Cliente');
                const safeText = (msg.text || '').replace(/"/g, '&quot;');
                let displayHtml = (msg.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                if (msg.imageUrl) {
                    displayHtml = `<a href="${msg.imageUrl}" target="_blank"><img src="${msg.imageUrl}" style="max-width:100%; border-radius:6px; margin-bottom:6px; max-height: 200px; object-fit: cover; display:block;"></a>` + displayHtml;
                }
                
                if (msg.audioUrl) {
                    const avatarSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName)}&background=random&color=fff`;
                    const micColor = msg.sender === 'agent' ? '#53BDEB' : '#8BA1AD';
                    displayHtml = `
                        <div class="wa-audio-player" style="display: flex; align-items: center; gap: 12px; min-width: 240px; margin-bottom: 4px;">
                            <div style="position: relative; width: 44px; height: 44px; flex-shrink: 0;">
                                <img src="${avatarSrc}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                                <i class="fas fa-microphone" style="position: absolute; bottom: 0; right: -4px; color: ${micColor}; font-size: 14px; text-shadow: 0 1px 1px rgba(255,255,255,0.8);"></i>
                            </div>
                            <button class="btn-icon" onclick="event.stopPropagation(); app.toggleWaAudio(this)" style="color: #667781; font-size: 20px; padding:0; width: 30px; height: 30px; display:flex; justify-content:center; align-items:center; flex-shrink: 0;">
                                <i class="fas fa-play"></i>
                            </button>
                            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                                <input type="range" class="wa-audio-slider" value="0" max="100" style="width: 100%; height: 4px; accent-color: #25D366; cursor: pointer; margin-bottom: 6px;" onchange="event.stopPropagation(); app.seekWaAudio(this)">
                                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #667781;">
                                    <span class="wa-audio-time">0:00</span>
                                </div>
                            </div>
                            <audio src="${msg.audioUrl}" ontimeupdate="app.updateWaAudioTime(this)" onloadedmetadata="app.loadedWaAudio(this)" onended="app.endedWaAudio(this)" style="display: none;"></audio>
                        </div>
                    ` + displayHtml;
                }
                
                if (msg.sender === 'agent') {
                    chatArea.innerHTML += `
                        <div class="wa-bubble wa-bubble-agent" onclick="app.quoteMessage(this.getAttribute('data-text'), this.getAttribute('data-sender'))" data-text="${safeText}" data-sender="${senderName}" style="cursor: pointer; animation: fadeIn 0.3s ease;">
                            ${displayHtml}
                            <div class="wa-bubble-time">${timeStr} <i class="fas fa-check" style="color:#8BA1AD;"></i></div>
                        </div>
                    `;
                } else {
                    chatArea.innerHTML += `
                        <div class="wa-bubble wa-bubble-client" onclick="app.quoteMessage(this.getAttribute('data-text'), this.getAttribute('data-sender'))" data-text="${safeText}" data-sender="${senderName}" style="cursor: pointer; animation: fadeIn 0.3s ease;">
                            ${displayHtml}
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
        this.cancelReply();
        this.activeLeadId = null;
        this.activeLeadPhone = null;
        document.getElementById('lead-sidebar-overlay').classList.remove('active');
    },

    async deleteLeadCard(id) {
        if (!id) return;
        this.confirmAction(
            "Excluir Conversa",
            "Tem certeza que deseja excluir esta conversa do funil?\n\nEsta ação não poderá ser desfeita.",
            async () => {
                try {
                    await db.collection('leads').doc(id).delete();
                    if (typeof this.showToast === 'function') this.showToast('Conversa excluída com sucesso!', 'info');
                    if (this.activeLeadId === id) this.closeLeadSidebar();
                } catch (e) {
                    console.error("Erro ao excluir lead:", e);
                    if (typeof this.showToast === 'function') this.showToast('Erro ao excluir a conversa.', 'error');
                }
            }
        );
    },

    quoteMessage(text, sender) {
        this.replyingToText = text;
        this.replyingToSender = sender;
        const preview = document.getElementById('lead-sb-reply-preview');
        const textEl = document.getElementById('lead-sb-reply-text');
        if (preview && textEl) {
            textEl.innerHTML = `<strong>Repondendo a ${sender}:</strong><br/>${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`;
            preview.style.display = 'flex';
        }
        document.getElementById('lead-sb-input').focus();
    },

    cancelReply() {
        this.replyingToText = null;
        this.replyingToSender = null;
        const preview = document.getElementById('lead-sb-reply-preview');
        if (preview) preview.style.display = 'none';
    },

    toggleEmojiPicker() {
        const picker = document.getElementById('emoji-picker-container');
        if (picker) {
            picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
        }
    },

    handleChatFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        this.pendingChatFile = file;
        const preview = document.getElementById('lead-sb-upload-preview');
        const nameEl = document.getElementById('lead-sb-upload-name');
        if (nameEl && preview) {
            nameEl.textContent = file.name;
            preview.style.display = 'flex';
        }
    },

    cancelUpload() {
        this.pendingChatFile = null;
        const uploadInput = document.getElementById('chat-file-upload');
        if (uploadInput) uploadInput.value = '';
        const preview = document.getElementById('lead-sb-upload-preview');
        if (preview) preview.style.display = 'none';
    },

    async sendLeadMessage() {
        const input = document.getElementById('lead-sb-input');
        const rawText = input.value.trim();
        if(!rawText && !this.pendingChatFile) return;
        if(!this.activeLeadId || !this.activeLeadPhone) return;
        
        let sentText = rawText;
        if (this.replyingToText) {
            sentText = `💬 *${this.replyingToSender}*:\n_${this.replyingToText}_\n\n${rawText}`;
        }
        
        // Limpar visualmente rápido
        input.value = '';
        this.cancelReply();

        let imageUrl = '';
        if (this.pendingChatFile) {
            if(this.showToast) this.showToast('Enviando anexo...', 'info');
            try {
                const fileRef = firebase.storage().ref(`chat_attachments/${this.activeLeadId}/${Date.now()}_${this.pendingChatFile.name}`);
                const snapshot = await fileRef.put(this.pendingChatFile);
                imageUrl = await snapshot.ref.getDownloadURL();
            } catch (e) {
                console.error("Erro no upload do anexo:", e);
                if(this.showToast) this.showToast('Erro ao fazer upload do arquivo.', 'error');
                return;
            }
            this.cancelUpload();
        }

        // Despacha a mensagem usando a API conectada
        if (typeof this.sendWhatsAppMessage === 'function') {
            const success = await this.sendWhatsAppMessage(this.activeLeadPhone, sentText, imageUrl);
            if (!success) {
                if(this.showToast) this.showToast('Erro ao enviar mensagem pelo WhatsApp.', 'error');
                return;
            }
        }
        
        try {
            const msgObj = {
                text: sentText,
                sender: 'agent',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (imageUrl) msgObj.imageUrl = imageUrl;
            
            await db.collection('leads').doc(this.activeLeadId).collection('messages').add(msgObj);
            input.value = '';
        } catch(e) {
            console.error("Erro ao salvar mensagem:", e);
        }
    },
    
    toggleWaAudio(btn) {
        const container = btn.parentElement;
        const audio = container.querySelector('audio');
        if (!audio) return;
        const icon = btn.querySelector('i');
        
        document.querySelectorAll('.wa-audio-player audio').forEach(a => {
            if (a !== audio && !a.paused) {
                a.pause();
                const b = a.parentElement.querySelector('.btn-icon i');
                if (b) {
                    b.classList.remove('fa-pause');
                    b.classList.add('fa-play');
                }
            }
        });

        if (audio.paused) {
            audio.play();
            icon.classList.remove('fa-play');
            icon.classList.add('fa-pause');
        } else {
            audio.pause();
            icon.classList.remove('fa-pause');
            icon.classList.add('fa-play');
        }
    },
    
    updateWaAudioTime(audio) {
        const container = audio.parentElement;
        const slider = container.querySelector('.wa-audio-slider');
        const timeLabel = container.querySelector('.wa-audio-time');
        
        if (audio.duration) {
            const percent = (audio.currentTime / audio.duration) * 100;
            if (slider && document.activeElement !== slider) slider.value = percent;
        }
        
        const currentMins = Math.floor(audio.currentTime / 60);
        const currentSecs = Math.floor(audio.currentTime % 60);
        if (timeLabel) timeLabel.textContent = `${currentMins}:${currentSecs.toString().padStart(2, '0')}`;
    },
    
    seekWaAudio(slider) {
        const container = slider.parentElement.parentElement;
        const audio = container.querySelector('audio');
        if (audio && audio.duration) {
            const time = (slider.value / 100) * audio.duration;
            audio.currentTime = time;
        }
    },
    
    loadedWaAudio(audio) {
        const container = audio.parentElement;
        const timeLabel = container.querySelector('.wa-audio-time');
        if (!audio.duration || !isFinite(audio.duration)) return;
        const MathMins = Math.floor(audio.duration / 60);
        const MathSecs = Math.floor(audio.duration % 60);
        if (timeLabel) {
            timeLabel.textContent = `${MathMins}:${MathSecs.toString().padStart(2, '0')}`;
        }
    },
    
    endedWaAudio(audio) {
        const container = audio.parentElement;
        const icon = container.querySelector('.btn-icon i');
        if (icon) {
            icon.classList.remove('fa-pause');
            icon.classList.add('fa-play');
        }
        const slider = container.querySelector('.wa-audio-slider');
        if (slider) slider.value = 0;
        app.loadedWaAudio(audio);
    }
};
