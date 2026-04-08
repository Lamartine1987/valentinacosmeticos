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
                handle: '.drag-handle',
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
        if(!db || !this.user || !this.currentUserProfile) return;
        
        let query = db.collection('leads');
        
        if (this.currentUserProfile.role !== 'admin') {
            const storeId = this.currentUserProfile.storeId || 'loja_1';
            query = query.where('storeId', '==', storeId);
        }

        this.unsubLeads = query.onSnapshot((snapshot) => {
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
                                this.originLeadWonId = leadId;
                                this.navigateTo('register');
                                setTimeout(() => {
                                    if(document.getElementById('r-name')) {
                                        document.getElementById('r-name').value = lead.name || '';
                                    }
                                    if(document.getElementById('r-phone')) {
                                        document.getElementById('r-phone').value = lead.phone || '';
                                    }
                                    const btnCancel = document.getElementById('btn-cancel-sale');
                                    if(btnCancel) {
                                        btnCancel.style.display = 'flex';
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
        const searchInput = document.getElementById('filter-funnel-search');
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

        // Organizar do mais recente (topo) pro mais antigo (base) lidando com Timestamps do Firebase e strings
        const getTime = (val) => {
            if (!val) return 0;
            if (typeof val.toDate === 'function') return val.toDate().getTime();
            if (val.seconds) return val.seconds * 1000;
            return new Date(val).getTime() || 0;
        };
        const sortedLeads = [...this.leadsList].sort((a, b) => {
            return getTime(b.updatedAt) - getTime(a.updatedAt);
        });

        sortedLeads.forEach(lead => {
            const status = lead.status || 'inbox';
            if(!listContainers[status]) return;

            if (searchTerm) {
                const nameStr = (lead.name || '').toLowerCase();
                const phoneStr = (lead.phone || '').replace(/\D/g, '');
                const searchPhone = searchTerm.replace(/\D/g, '');
                
                const nameMatch = nameStr.includes(searchTerm);
                const phoneMatch = searchPhone && phoneStr.includes(searchPhone);
                
                if (!nameMatch && !phoneMatch) return;
            }

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

            let storeBadgeId = lead.storeId || 'loja_1';
            // Fallback for unmigrated historic leads
            if (storeBadgeId === 'matriz') storeBadgeId = 'loja_1';
            if (storeBadgeId === 'filial_1') storeBadgeId = 'loja_2';
            let storeBadgeLabel = storeBadgeId === 'loja_1' ? 'Loja 1' : (storeBadgeId === 'loja_2' ? 'Loja 2' : 'Global');
            let storeTagHtml = `<span style="font-size: 9px; padding: 2px 5px; border-radius: 4px; background: #F3F4F6; border: 1px solid #E5E7EB; color: #4B5563; font-weight: bold; align-self: flex-start;"><i class="fas fa-store" style="font-size: 9px; margin-right: 3px;"></i>${storeBadgeLabel}</span>`;

            card.innerHTML = `
                <div class="k-card-title" style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <span style="display:flex; gap: 8px; align-items:flex-start; pointer-events:none;">
                        <i class="fas fa-grip-vertical drag-handle" style="color: #94a3b8; cursor: grab; padding: 8px 12px 8px 4px; font-size: 22px; pointer-events: auto; touch-action: none;" title="Arraste por aqui"></i>
                        <input type="checkbox" class="funnel-checkbox admin-only" value="${lead.id}" style="display:none; margin-top: 3px; pointer-events:auto;" onclick="event.stopPropagation(); app.toggleFunnelSelection(this)" onmousedown="event.stopPropagation()">
                        <span style="pointer-events:auto; display:flex; flex-direction:column;">
                            <span>
                                ${lead.name || 'Desconhecido'}
                                ${lead.unread ? '<i class="fas fa-circle" style="color:#EF4444; font-size:10px; margin-left:6px; animation: pulse 1s infinite alternate;" title="Nova mensagem não lida"></i>' : ''}
                            </span>
                        </span>
                    </span>
                    ${(app && app.currentUserProfile && app.currentUserProfile.role === 'admin') ? `
                    <button class="btn-icon" style="color: #EF4444; padding: 2px;" onclick="event.stopPropagation(); app.deleteLeadCard('${lead.id}')" title="Excluir Conversa">
                        <i class="fas fa-trash" style="font-size: 13px;"></i>
                    </button>
                    ` : ''}
                </div>
                <div class="k-card-meta" style="margin-bottom: 8px;">
                    <span style="display:flex; flex-direction:column; gap:4px;">
                        <span><i class="fab fa-whatsapp" style="color:#25D366;"></i> ${phoneStr}</span>
                        ${storeTagHtml}
                    </span>
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
        
        // Aplica exibição de administrador aos checkboxes do funil sem disparar loop de recarga
        if (app && app.currentUserProfile && app.currentUserProfile.role === 'admin') {
            document.querySelectorAll('#page-funnel .admin-only').forEach(el => el.style.display = '');
        }
        
        // Reset local selection UI state if cards were re-rendered
        if (this.updateFunnelBatchUI) this.updateFunnelBatchUI();
    },

    toggleFunnelSelection(checkbox) {
        const card = checkbox.closest('.k-card');
        if (checkbox.checked) {
            card.classList.add('k-card-selected');
        } else {
            card.classList.remove('k-card-selected');
        }
        this.updateFunnelBatchUI();
    },

    toggleSelectAllFunnel() {
        // Select all cards currently in the board that have checkboxes
        const checkboxes = document.querySelectorAll('.funnel-checkbox');
        if (checkboxes.length === 0) return;
        
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        const newState = !allChecked;
        
        checkboxes.forEach(cb => {
            cb.checked = newState;
            const card = cb.closest('.k-card');
            if(cb.checked) {
                card.classList.add('k-card-selected');
            } else {
                card.classList.remove('k-card-selected');
            }
        });
        this.updateFunnelBatchUI();
    },

    updateFunnelBatchUI() {
        const checkedCount = document.querySelectorAll('.funnel-checkbox:checked').length;
        const totalCount = document.querySelectorAll('.funnel-checkbox').length;
        const countSpan = document.getElementById('funnel-selected-count');
        const deleteBtn = document.getElementById('btn-funnel-delete');
        const selectAllBtn = document.getElementById('btn-funnel-select-all');
        const actionContainer = document.querySelector('.funnel-batch-actions');
        
        if (actionContainer) {
            actionContainer.style.display = 'flex'; 
        }

        if (selectAllBtn && totalCount > 0) {
            if (checkedCount === totalCount) {
                selectAllBtn.innerHTML = '<i class="far fa-square"></i> Desmarcar Tudo';
            } else {
                selectAllBtn.innerHTML = '<i class="fas fa-check-square"></i> Selecionar Tudo';
            }
        }

        if (countSpan && deleteBtn) {
            if (checkedCount > 0) {
                countSpan.textContent = `${checkedCount} selecionado${checkedCount > 1 ? 's' : ''}`;
                countSpan.style.display = 'inline-block';
                deleteBtn.style.display = 'inline-flex';
            } else {
                countSpan.style.display = 'none';
                deleteBtn.style.display = 'none';
            }
        }
    },

    deleteSelectedFunnelCards() {
        if (this.currentUserProfile && this.currentUserProfile.role !== 'admin') {
            if (typeof this.showToast === 'function') this.showToast('Sem permissão para excluir conversas. Aterrompa um Admin.', 'error');
            const checked = document.querySelectorAll('.funnel-checkbox:checked');
            if (typeof this.saveAuditLog === 'function') this.saveAuditLog('funnel', 'attempt_delete', 'Lote', `Tentativa de exclusão em massa bloqueada.<br><strong>Quantidade Selecionada:</strong> ${checked.length} conversa(s) de funil.`);
            return;
        }

        const checked = document.querySelectorAll('.funnel-checkbox:checked');
        if (checked.length === 0) return;
        
        this.confirmAction(
            "Excluir Múltiplas Conversas",
            `Tem certeza que deseja excluir permanentemente as ${checked.length} conversas selecionadas do seu funil e toda a troca de mensagens?\n\nEsta ação não poderá ser desfeita.`,
            async () => {
                if (typeof this.showToast === 'function') this.showToast('Excluindo conversas...', 'info');
                try {
                    const batch = db.batch();
                    let count = 0;
                    
                    checked.forEach(cb => {
                        const id = cb.value;
                        const ref = db.collection('leads').doc(id);
                        batch.delete(ref);
                        count++;
                    });
                    
                    await batch.commit();
                    if (typeof this.showToast === 'function') this.showToast(`${count} conversas excluídas com sucesso!`, 'info');
                    this.updateFunnelBatchUI();
                } catch (e) {
                    console.error("Erro ao excluir leads em lote:", e);
                    if (typeof this.showToast === 'function') this.showToast('Erro ao excluir conversas.', 'error');
                }
            }
        );
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

    async saveLeadAsClient() {
        if (!db) return;
        if (!this.activeLeadId || !this.activeLeadPhone) return;

        const cleanPhone = String(this.activeLeadPhone).replace(/\D/g, '');
        const existingClient = (this.clients || []).find(c => c.phone && String(c.phone).replace(/\D/g, '') === cleanPhone);

        if (existingClient) {
            if (typeof this.showToast === 'function') this.showToast(`Ops! Esse telefone já está registrado para ${existingClient.name} na sua base!`, 'warning');
            const btn = document.getElementById('btn-save-lead-client');
            if(btn) {
                 btn.innerHTML = '<i class="fas fa-check"></i> Já na Base';
                 btn.style.opacity = '0.5';
                 btn.style.pointerEvents = 'none';
            }
            return;
        }

        try {
            const leadDoc = await db.collection('leads').doc(this.activeLeadId).get();
            if (!leadDoc.exists) return;
            const leadData = leadDoc.data();

            const docRef = db.collection('clients').doc();
            const clientData = {
                name: leadData.name || 'Desconhecido',
                phone: cleanPhone,
                email: '',
                storeId: leadData.storeId || (this.currentUserProfile?.storeId || 'loja_1'),
                createdAt: new Date().toISOString()
            };
            
            if (this.user && this.currentUserProfile) {
                clientData.sellerId = this.user.uid;
                clientData.sellerName = this.currentUserProfile.name || 'Sistema';
            }
            
            await docRef.set(clientData);
            if (typeof this.showToast === 'function') this.showToast('Cliente Salvo na Base com Sucesso!', 'success');
            
            const btn = document.getElementById('btn-save-lead-client');
            if(btn) {
                 btn.innerHTML = '<i class="fas fa-check"></i> Salvo';
                 btn.style.opacity = '0.5';
                 btn.style.pointerEvents = 'none';
            }

        } catch(e) {
            console.error(e);
            if (typeof this.showToast === 'function') this.showToast('Erro ao salvar!', 'error');
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
        
        const btnSave = document.getElementById('btn-save-lead-client');
        if (btnSave) {
             const cleanPhone = String(lead.phone || '').replace(/\D/g, '');
             const exists = (this.clients || []).find(c => c.phone && String(c.phone).replace(/\D/g, '') === cleanPhone);
             if (exists) {
                 btnSave.innerHTML = '<i class="fas fa-check"></i> Já na Base';
                 btnSave.style.opacity = '0.5';
                 btnSave.style.pointerEvents = 'none';
             } else {
                 btnSave.innerHTML = '<i class="fas fa-save"></i> Salvar na Base';
                 btnSave.style.opacity = '1';
                 btnSave.style.pointerEvents = 'auto';
             }
        }
        
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
            
            let htmlBuffer = '';
            snapshot.forEach(doc => {
                const msg = doc.data();
                const d = msg.timestamp ? msg.timestamp.toDate() : new Date();
                const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                const senderName = msg.sender === 'agent' ? 'Você' : (lead.name || 'Cliente');
                const safeText = (msg.text || '').replace(/"/g, '&quot;');
                let displayHtml = (msg.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                // Formatação WhatsApp-like para grupos (Identifica *Nome:* no começo)
                let groupSenderHtml = '';
                const groupMatch = displayHtml.match(/^\*([^*]+):\*\s*(.*)/s);
                if (groupMatch && msg.sender !== 'agent') {
                    // Substitui a tag grosseira por um título colorido bonitinho sem asteriscos
                    groupSenderHtml = `<div style="color: #0284c7; font-size: 11.5px; font-weight: 600; margin-bottom: 2px;">${groupMatch[1]}</div>`;
                    displayHtml = groupMatch[2]; // Pega apenas a mensagem limpa
                }
                
                let displayImageUrl = msg.imageUrl;
                let displayVideoUrl = msg.videoUrl;
                if (displayImageUrl && displayImageUrl.startsWith('http://') && window.location.protocol === 'https:') {
                    displayImageUrl = 'https://us-central1-valentinacosmeticos-5f239.cloudfunctions.net/apiProxy?targetUrl=' + encodeURIComponent(displayImageUrl);
                }
                if (displayVideoUrl && displayVideoUrl.startsWith('http://') && window.location.protocol === 'https:') {
                    displayVideoUrl = 'https://us-central1-valentinacosmeticos-5f239.cloudfunctions.net/apiProxy?targetUrl=' + encodeURIComponent(displayVideoUrl);
                }
                
                if (msg.videoUrl) {
                    displayHtml = `<video src="${displayVideoUrl}" controls style="max-width:100%; border-radius:6px; margin-bottom:6px; max-height: 250px; display:block; background: #000;"></video>` + displayHtml;
                } else if (msg.imageUrl) {
                    const fallbackHtml = `this.style.display='none'; this.insertAdjacentHTML('afterend', '<div style=\\'background:rgba(239, 68, 68, 0.1); color:#ef4444; font-size:11px; padding:6px 10px; border-radius:6px; margin-bottom:6px; display:flex; align-items:center; gap:6px;\\'><i class=\\'fas fa-image-slash\\'></i> Mídia expirada ou formato indisponível</div>');`;
                    displayHtml = `<a href="${displayImageUrl}" target="_blank"><img src="${displayImageUrl}" onerror="${fallbackHtml}" style="max-width:100%; border-radius:6px; margin-bottom:6px; max-height: 200px; object-fit: cover; display:block;"></a>` + displayHtml;
                }
                
                let displayAudioUrl = msg.audioUrl;
                if (displayAudioUrl && displayAudioUrl.startsWith('http://') && window.location.protocol === 'https:') {
                    displayAudioUrl = 'https://us-central1-valentinacosmeticos-5f239.cloudfunctions.net/apiProxy?targetUrl=' + encodeURIComponent(displayAudioUrl);
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
                            <audio src="${displayAudioUrl}" ontimeupdate="app.updateWaAudioTime(this)" onloadedmetadata="app.loadedWaAudio(this)" onended="app.endedWaAudio(this)" style="display: none;"></audio>
                        </div>
                    ` + displayHtml;
                }
                
                // Removemos espaços brancos em torno do displayHtml na string porque a classe tem white-space: pre-wrap
                if (msg.sender === 'agent') {
                    htmlBuffer += `
                        <div class="wa-bubble wa-bubble-agent" onclick="app.quoteMessage(this.getAttribute('data-text'), this.getAttribute('data-sender'))" data-text="${safeText}" data-sender="${senderName}" style="cursor: pointer; animation: fadeIn 0.3s ease;">
${displayHtml}
<div class="wa-bubble-time">${timeStr} <i class="fas fa-check" style="color:#8BA1AD;"></i></div></div>`;
                } else {
                    htmlBuffer += `
                        <div class="wa-bubble wa-bubble-client" onclick="app.quoteMessage(this.getAttribute('data-text'), this.getAttribute('data-sender'))" data-text="${safeText}" data-sender="${senderName}" style="cursor: pointer; animation: fadeIn 0.3s ease;">
${groupSenderHtml}${displayHtml}
<div class="wa-bubble-time" style="justify-content: flex-start;">${timeStr}</div></div>`;
                }
            });
            chatArea.innerHTML = htmlBuffer;
            
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
        
        if (this.currentUserProfile && this.currentUserProfile.role !== 'admin') {
            if (typeof this.showToast === 'function') this.showToast('Sem permissão para excluir histórico. Contate um Admin.', 'error');
            if (typeof this.saveAuditLog === 'function') this.saveAuditLog('funnel', 'attempt_delete', id, `Tentativa de exclusão individual bloqueada.<br><strong>Conversa:</strong> ${id}`);
            return;
        }

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

        let fileUrl = '';
        let isVideo = false;
        if (this.pendingChatFile) {
            if(this.showToast) this.showToast('Enviando anexo...', 'info');
            try {
                if (this.pendingChatFile.type.startsWith('video/')) isVideo = true;
                const fileRef = firebase.storage().ref(`chat_attachments/${this.activeLeadId}/${Date.now()}_${this.pendingChatFile.name}`);
                const snapshot = await fileRef.put(this.pendingChatFile);
                fileUrl = await snapshot.ref.getDownloadURL();
            } catch (e) {
                console.error("Erro no upload do anexo:", e);
                if(this.showToast) this.showToast('Erro ao fazer upload do arquivo.', 'error');
                return;
            }
            this.cancelUpload();
        }

        // Recuperar a loja que esse cliente pertence para rotear a mensagem pela API correta
        const currentLead = this.leadsList.find(l => l.id === this.activeLeadId);
        const sourceStore = currentLead ? (currentLead.storeId || 'loja_1') : 'loja_1';

        // Salva localmente IMEDIATAMENTE (optimistic UI)
        try {
            const msgObj = {
                text: sentText,
                sender: 'agent',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (fileUrl) {
                if (isVideo) msgObj.videoUrl = fileUrl;
                else msgObj.imageUrl = fileUrl;
            }
            
            await db.collection('leads').doc(this.activeLeadId).collection('messages').add(msgObj);

            // Automação 4.2: Envio de mensagem move o cliente para 'Em Atendimento'
            const curLead = this.leadsList.find(l => l.id === this.activeLeadId);
            if (curLead && curLead.status === 'inbox') {
                await db.collection('leads').doc(this.activeLeadId).update({
                    status: 'negotiation',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch(e) {
            console.error("Erro ao salvar mensagem otimista no banco:", e);
        }

        // Despacha a mensagem usando a API conectada paralelamente
        if (typeof this.sendWhatsAppMessage === 'function') {
            const success = await this.sendWhatsAppMessage(this.activeLeadPhone, sentText, fileUrl, isVideo ? 'video' : 'image', sourceStore);
            if (!success) {
                if(this.showToast) this.showToast('Erro ao enviar mensagem pelo WhatsApp.', 'error');
                // Could update message state if we tracked ID, but for now we just show a toast.
            }
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
