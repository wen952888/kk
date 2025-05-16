--- START OF FILE client.js ---

// public/client.js
const socket = io({
    reconnectionAttempts: 5,
    reconnectionDelay: 3000
});

// --- State Variables ---
let currentView = 'loading';
let myUserId = null;
let myUsername = null;
let currentRoomId = null;
let currentGameState = null;
let previousGameState = null;
let isReadyForGame = false;
let selectedCards = [];
let currentSortMode = 'rank';
let currentHint = null;
let currentHintCycleIndex = 0;

// --- WebRTC State Variables ---
let localStream = null;
let peerConnections = {}; // { 'otherUserId': RTCPeerConnection }
const RTC_CONFIGURATION = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Consider adding TURN servers for production
        // {
        //   urls: 'turn:your.turn.server:3478',
        //   username: 'yourUsername',
        //   credential: 'yourPassword'
        // }
    ]
};
let isVoiceChatEnabled = false;
let isPushToTalkActive = false;


// --- DOM Elements (Cached for frequent access) ---
const loadingView = document.getElementById('loadingView');
const loginRegisterView = document.getElementById('loginRegisterView');
const lobbyView = document.getElementById('lobbyView');
const roomView = document.getElementById('roomView');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const views = { loadingView, loginRegisterView, lobbyView, roomView, gameOverOverlay };

const regPhoneInput = document.getElementById('regPhone');
const regPasswordInput = document.getElementById('regPassword');
const registerButton = document.getElementById('registerButton');
const loginPhoneInput = document.getElementById('loginPhone');
const loginPasswordInput = document.getElementById('loginPassword');
const loginButton = document.getElementById('loginButton');
const authMessage = document.getElementById('authMessage');

const logoutButton = document.getElementById('logoutButton');
const lobbyUsername = document.getElementById('lobbyUsername');
const createRoomNameInput = document.getElementById('createRoomName');
const createRoomPasswordInput = document.getElementById('createRoomPassword');
const createRoomButton = document.getElementById('createRoomButton');
const roomListEl = document.getElementById('roomList');
const lobbyMessage = document.getElementById('lobbyMessage');

const centerPileArea = document.getElementById('centerPileArea');
const lastHandTypeDisplay = document.getElementById('lastHandTypeDisplay');
const playSelectedCardsButton = document.getElementById('playSelectedCardsButton');
const passTurnButton = document.getElementById('passTurnButton');
const hintButton = document.getElementById('hintButton');
const sortHandButton = document.getElementById('sortHandButton');

const playerAreas = {
    0: document.getElementById('playerAreaBottom'),
    1: document.getElementById('playerAreaLeft'),
    2: document.getElementById('playerAreaTop'),
    3: document.getElementById('playerAreaRight')
};

const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverReason = document.getElementById('gameOverReason');
const gameOverScores = document.getElementById('gameOverScores');
const backToLobbyButton = document.getElementById('backToLobbyButton');

// WebRTC DOM Elements
const voiceControlsContainer = document.getElementById('voiceControlsContainer');
const toggleVoiceChatButton = document.getElementById('toggleVoiceChatButton');
const pushToTalkButton = document.getElementById('pushToTalkButton');
const remoteAudioContainer = document.getElementById('remoteAudioContainer');


const ALARM_ICON_SRC = '/images/alarm-icon.svg';
const AVATAR_PATHS = [
    '/images/avatar-slot-0.png',
    '/images/avatar-slot-1.png',
    '/images/avatar-slot-2.png',
    '/images/avatar-slot-3.png',
];

// --- Utility Functions ---
function showView(viewName) {
    console.log(`[VIEW] Switching from ${currentView} to: ${viewName}`);
    currentView = viewName;
    for (const key in views) {
        if (views[key]) {
            views[key].classList.add('hidden-view');
            views[key].classList.remove('view-block', 'view-flex');
        }
    }
    const targetView = views[viewName];
    if (targetView) {
        targetView.classList.remove('hidden-view');
        if (viewName === 'roomView' || viewName === 'gameOverOverlay') {
            targetView.classList.add('view-flex');
        } else {
            targetView.classList.add('view-block');
        }
    } else {
        console.warn(`[VIEW] View element not found: ${viewName}`);
    }
    const allowScroll = (viewName === 'loginRegisterView' || viewName === 'lobbyView');
    document.documentElement.style.overflow = allowScroll ? '' : 'hidden';
    document.body.style.overflow = allowScroll ? '' : 'hidden';
    clearMessages();

    if (viewName !== 'roomView' && viewName !== 'gameOverOverlay') {
        selectedCards = [];
        currentHint = null;
        currentHintCycleIndex = 0;
        if (currentView !== 'gameOverOverlay') {
            currentGameState = null;
            previousGameState = null;
        }
    }

    // Voice chat UI visibility
    if (voiceControlsContainer) {
        if (viewName === 'roomView') {
            voiceControlsContainer.classList.remove('hidden-view');
            updateVoiceButtonStates(); // Update buttons based on current state
        } else {
            voiceControlsContainer.classList.add('hidden-view');
            if (isVoiceChatEnabled) { // If user was in voice chat and leaves room view
                disableVoiceChatFeatures(true); // true to reset button text and state
            }
        }
    }
}
function displayMessage(element, message, isError = false, isSuccess = false) { if (element) { element.textContent = message; element.classList.remove('error', 'success', 'message'); if (isError) element.classList.add('error'); else if (isSuccess) element.classList.add('success'); else if (element.id !== 'gameStatusDisplay') element.classList.add('message'); } }
function clearMessages() { [authMessage, lobbyMessage].forEach(el => { if (el) { el.textContent = ''; el.classList.remove('error', 'success', 'message'); } }); }
function getSuitSymbol(suit) { switch (suit?.toUpperCase()) { case 'H': return '♥'; case 'D': return '♦'; case 'C': return '♣'; case 'S': return '♠'; default: return '?'; } }
function getSuitClass(suit) { switch (suit?.toUpperCase()) { case 'H': return 'hearts'; case 'D': return 'diamonds'; case 'C': return 'clubs'; case 'S': return 'spades'; default: return ''; } }
const RANK_ORDER_CLIENT = ["4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2", "3"];
const RANK_VALUES_CLIENT = {}; RANK_ORDER_CLIENT.forEach((r, i) => RANK_VALUES_CLIENT[r] = i);
const SUIT_ORDER_CLIENT = ["D", "C", "H", "S"];
const SUIT_VALUES_CLIENT = {}; SUIT_ORDER_CLIENT.forEach((s, i) => SUIT_VALUES_CLIENT[s] = i);
function compareSingleCardsClient(cardA, cardB) { const rankValueA = RANK_VALUES_CLIENT[cardA.rank]; const rankValueB = RANK_VALUES_CLIENT[cardB.rank]; if (rankValueA !== rankValueB) return rankValueA - rankValueB; return SUIT_VALUES_CLIENT[cardA.suit] - SUIT_VALUES_CLIENT[cardB.suit]; }
function compareBySuitThenRank(cardA, cardB) { const suitValueA = SUIT_VALUES_CLIENT[cardA.suit]; const suitValueB = SUIT_VALUES_CLIENT[cardB.suit]; if (suitValueA !== suitValueB) return suitValueA - suitValueB; return RANK_VALUES_CLIENT[cardA.rank] - RANK_VALUES_CLIENT[cardB.rank]; }

// --- WebRTC Utility Functions ---
async function startLocalAudio() {
    if (localStream) return true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('[VOICE] Local audio stream obtained.');
        localStream.getAudioTracks().forEach(track => track.enabled = false); // Initially disabled for PTT
        return true;
    } catch (error) {
        console.error('[VOICE] Error accessing microphone:', error);
        displayMessage(document.getElementById('gameStatusDisplay'), '麦克风权限获取失败。', true);
        localStream = null;
        return false;
    }
}

function stopLocalAudio() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        console.log('[VOICE] Stopped local audio stream.');
    }
}

function createPeerConnection(targetUserId) {
    if (peerConnections[targetUserId]) {
        console.log(`[VOICE] PeerConnection with ${targetUserId} already exists. Closing old one.`);
        peerConnections[targetUserId].close();
    }

    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    peerConnections[targetUserId] = pc;
    console.log(`[VOICE] Created PeerConnection for ${targetUserId}`);

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-ice-candidate', {
                targetUserId: targetUserId,
                candidate: event.candidate,
                roomId: currentRoomId
            });
        }
    };

    pc.ontrack = (event) => {
        console.log(`[VOICE] Received remote track from ${targetUserId}`);
        if (event.streams && event.streams[0] && remoteAudioContainer) {
            let remoteAudio = document.getElementById(`audio-${targetUserId}`);
            if (!remoteAudio) {
                remoteAudio = document.createElement('audio');
                remoteAudio.id = `audio-${targetUserId}`;
                remoteAudio.autoplay = true;
                // remoteAudio.controls = true; // For debugging
                remoteAudioContainer.appendChild(remoteAudio);
            }
            remoteAudio.srcObject = event.streams[0];
        } else {
            console.warn(`[VOICE] Failed to attach remote track from ${targetUserId}, stream or container missing.`);
        }
    };

    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
        // console.log(`[VOICE] Added local audio tracks to PC for ${targetUserId} (enabled: ${localStream.getAudioTracks()[0]?.enabled})`);
    } else {
        console.warn(`[VOICE] Local stream not available when creating PC for ${targetUserId}`);
    }

    pc.oniceconnectionstatechange = () => {
        console.log(`[VOICE] ICE connection state for ${targetUserId}: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
            console.warn(`[VOICE] Connection with ${targetUserId} ${pc.iceConnectionState}. Cleaning up.`);
            closePeerConnection(targetUserId);
        }
    };
    return pc;
}

async function makeCall(targetUserId) {
    if (!isVoiceChatEnabled || !localStream) { // Check if voice chat is enabled by user
        console.warn(`[VOICE] Cannot make call to ${targetUserId}, local stream not ready or voice chat disabled.`);
        return;
    }
    if (myUserId === targetUserId) return; // Don't call self

    console.log(`[VOICE] Attempting to make call to ${targetUserId}`);
    const pc = createPeerConnection(targetUserId);
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log(`[VOICE] Sending offer to ${targetUserId}`);
        socket.emit('webrtc-offer', {
            targetUserId: targetUserId,
            sdp: offer,
            roomId: currentRoomId,
            fromUserId: myUserId // Good to include for clarity on server/receiver
        });
    } catch (error) {
        console.error(`[VOICE] Error creating offer for ${targetUserId}:`, error);
    }
}

function closePeerConnection(userId) {
    if (peerConnections[userId]) {
        peerConnections[userId].onicecandidate = null;
        peerConnections[userId].ontrack = null;
        peerConnections[userId].oniceconnectionstatechange = null;
        peerConnections[userId].close();
        delete peerConnections[userId];
        console.log(`[VOICE] Closed PeerConnection with ${userId}`);
    }
    const audioEl = document.getElementById(`audio-${userId}`);
    if (audioEl) {
        audioEl.srcObject = null; // Release stream
        audioEl.remove();
    }
}

function closeAllPeerConnections() {
    console.log('[VOICE] Closing all peer connections.');
    for (const userId in peerConnections) {
        closePeerConnection(userId);
    }
    // peerConnections = {}; // closePeerConnection already deletes, so this might be redundant
    if (remoteAudioContainer) remoteAudioContainer.innerHTML = '';
}

async function enableVoiceChatFeatures() {
    if (!currentGameState || !myUserId) {
        console.warn('[VOICE] Cannot enable voice chat, not in a valid game state.');
        return;
    }
    const micStarted = await startLocalAudio();
    if (!micStarted) {
        isVoiceChatEnabled = false;
        updateVoiceButtonStates();
        return;
    }

    isVoiceChatEnabled = true;
    console.log('[VOICE] Voice chat enabled by user.');
    updateVoiceButtonStates(); // Update buttons first

    currentGameState.players.forEach(player => {
        if (player.userId !== myUserId && player.connected) {
            makeCall(player.userId); // makeCall now checks isVoiceChatEnabled
        }
    });
}

function disableVoiceChatFeatures(resetButtonStateAndText = false) {
    isVoiceChatEnabled = false; // Set state first
    console.log('[VOICE] Voice chat disabled by user.');
    stopLocalAudio();
    closeAllPeerConnections();
    if (resetButtonStateAndText) {
        updateVoiceButtonStates();
    } else { // If just disabling, but not due to view change, keep button text consistent until next update
        if (toggleVoiceChatButton) toggleVoiceChatButton.textContent = '启用语音';
        if (pushToTalkButton) {
            pushToTalkButton.disabled = true;
            pushToTalkButton.classList.remove('ptt-active');
            isPushToTalkActive = false;
        }
    }
}

function updateVoiceButtonStates() {
    if (!toggleVoiceChatButton || !pushToTalkButton) return;

    if (isVoiceChatEnabled) {
        toggleVoiceChatButton.textContent = '禁用语音';
        toggleVoiceChatButton.title = '点击关闭语音聊天功能';
        pushToTalkButton.disabled = false;
    } else {
        toggleVoiceChatButton.textContent = '启用语音';
        toggleVoiceChatButton.title = '点击开启语音聊天功能';
        pushToTalkButton.disabled = true;
        pushToTalkButton.classList.remove('ptt-active');
        pushToTalkButton.textContent = '按住说话'; // Reset PTT button text
        isPushToTalkActive = false;
    }
}


function startPushToTalk() {
    if (!isVoiceChatEnabled || !localStream || isPushToTalkActive) return;
    isPushToTalkActive = true;
    localStream.getAudioTracks().forEach(track => track.enabled = true);
    if (pushToTalkButton) {
        pushToTalkButton.classList.add('ptt-active');
        pushToTalkButton.textContent = '正在说话...';
    }
    console.log('[VOICE] PTT: Started transmitting.');
}

function stopPushToTalk() {
    if (!isVoiceChatEnabled || !localStream || !isPushToTalkActive) return;
    isPushToTalkActive = false;
    if (localStream) { // Check again as it might have been stopped
        localStream.getAudioTracks().forEach(track => track.enabled = false);
    }
    if (pushToTalkButton) {
        pushToTalkButton.classList.remove('ptt-active');
        pushToTalkButton.textContent = '按住说话';
    }
    console.log('[VOICE] PTT: Stopped transmitting.');
}

// --- Rendering Functions (no changes needed for these specifically for voice) ---
function updateRoomControls(state) { /* ... same ... */ }
function renderRoomList(rooms) { /* ... same ... */ }
function updateGameInfoBarDOM(state) { /* ... same ... */ }
function updateGameStatusDisplayDOM(state) { /* ... same ... */ }
function renderCenterPileDOM(state) { /* ... same ... */ }
function renderRoomView(state) { /* ... same ... */ }
function clearPlayerAreaDOM(area) { /* ... same ... */ }
function renderPlayerArea(container, playerData, isMe, state, absoluteSlot) { /* ... same ... */ }
function fanCards(cardContainer, cardElements, areaId) { /* ... same ... */ }
function getCardImageFilename(cardData) { /* ... same ... */ }
function renderCard(cardData, isHidden, isCenterPileCard = false) { /* ... same ... */ }
function renderPlayerCards(containerParam, playerData, isMe, isMyTurnAndPlaying) {
    let targetContainer;
    if (isMe) {
        targetContainer = document.getElementById('myHand');
        if (!targetContainer) { console.error("[DEBUG] renderPlayerCards: #myHand NOT FOUND!"); return; }
        targetContainer.innerHTML = '';
        if (playerData.hand === undefined && !playerData.finished && isMe) { console.warn("[DEBUG] renderPlayerCards: My hand is undefined, cannot render."); return; }
    }  else {
        targetContainer = containerParam;
        if (!targetContainer) { console.error(`[DEBUG] renderPlayerCards for OPPONENT (${playerData.username}): Passed container is null.`); return; }
        targetContainer.innerHTML = '';
    }

    const cardElements = [];
    if (isMe) {
        let sortedHand = playerData.hand && Array.isArray(playerData.hand) ? [...playerData.hand] : [];
        if (playerData.finished) {
            targetContainer.innerHTML = '<span style="color:#888; font-style:italic;">已出完</span>';
        } else if (sortedHand.length === 0) {
            targetContainer.innerHTML = '<span style="color:#555; font-style:italic;">- 无手牌 -</span>';
        } else {
            if (currentSortMode === 'rank') sortedHand.sort(compareSingleCardsClient);
            else sortedHand.sort(compareBySuitThenRank);
            sortedHand.forEach((cardData, index) => {
                const cardElement = renderCard(cardData, false, false);
                cardElement.style.zIndex = index;
                const isSelected = selectedCards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);
                const isHinted = isMyTurnAndPlaying && currentHint && currentHint.cards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);

                if (isSelected) cardElement.classList.add('selected');
                else cardElement.classList.remove('selected'); // Ensure not selected if not in array

                if (isHinted) cardElement.classList.add('hinted');
                else cardElement.classList.remove('hinted');  // Ensure not hinted if not current hint

                if (isMyTurnAndPlaying) {
                    cardElement.classList.remove('disabled');
                    cardElement.onclick = () => toggleCardSelection(cardData, cardElement);
                } else {
                    cardElement.classList.add('disabled');
                    cardElement.onclick = null; // Remove listener
                    // Non-turn, ensure visual states are reset if they somehow persisted
                    cardElement.classList.remove('selected');
                    cardElement.classList.remove('hinted');
                }
                targetContainer.appendChild(cardElement);
            });
        }
    } else { // Opponent's hand
        if (playerData.finished) { targetContainer.innerHTML = '<span style="color:#888; font-style:italic;">已出完</span>'; }
        else if (playerData.handCount > 0) {
            for (let i = 0; i < playerData.handCount; i++) {
                const cardElement = renderCard(null, true, false);
                targetContainer.appendChild(cardElement);
                cardElements.push(cardElement);
            }
            let handCountEl = targetContainer.closest('.playerArea')?.querySelector('.hand-count-display');
            if (!handCountEl) {
                handCountEl = document.createElement('div');
                handCountEl.classList.add('hand-count-display');
                const playerAreaEl = targetContainer.closest('.playerArea');
                if (playerAreaEl) { playerAreaEl.appendChild(handCountEl); }
            }
            if (handCountEl) handCountEl.textContent = `${playerData.handCount} 张`;
        } else {
            targetContainer.innerHTML = '<span style="color:#555; font-style:italic;">- 等待 -</span>';
            let handCountEl = targetContainer.closest('.playerArea')?.querySelector('.hand-count-display');
            if (handCountEl) handCountEl.remove();
        }
        if (cardElements.length > 0) {
            requestAnimationFrame(() => {
                fanCards(targetContainer, cardElements, targetContainer.closest('.playerArea')?.id);
            });
        }
    }
}


// --- Event Handlers for UI elements ---
function handleRegister() { /* ... same ... */ }
function handleLogin() { /* ... same ... */ }

function handleLogout() {
    console.log('Logging out...');
    disableVoiceChatFeatures(true); // Disable voice before disconnecting
    try { localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); } catch (e) { console.warn('LocalStorage error while removing user session:', e); }
    myUserId = null; myUsername = null; currentRoomId = null; currentGameState = null; previousGameState = null; isReadyForGame = false; selectedCards = []; currentHint = null; currentHintCycleIndex = 0;
    if (socket.connected) { socket.disconnect(); }
    socket.connect();
    showView('loginRegisterView');
    if(loginPhoneInput) loginPhoneInput.value = ''; if(loginPasswordInput) loginPasswordInput.value = '';
}

function handleGameLeave() {
    if (!currentRoomId) { console.log("Not in a room to leave."); handleReturnToLobby(); return; }
    console.log(`Attempting to leave room: ${currentRoomId} from game view.`);

    disableVoiceChatFeatures(true); // Disable voice before emitting leaveRoom

    const actualLeaveButton = document.getElementById('leaveRoomButton');
    if (actualLeaveButton) actualLeaveButton.disabled = true;
    socket.emit('leaveRoom', (response) => {
        if (actualLeaveButton) actualLeaveButton.disabled = false;
        if (response.success) {
            // handleReturnToLobby will call showView, which handles voice UI reset
            handleReturnToLobby();
        } else {
            const gameStatusDisp = document.getElementById('gameStatusDisplay');
            displayMessage(gameStatusDisp || lobbyMessage, response.message || '离开房间失败。', true);
             // If leaving failed, re-evaluate voice UI if needed, though usually server would handle it
        }
    });
}
function handleCreateRoom() { /* ... same, then on success: */
    // if (response.success) { ... showView('roomView'); ... renderRoomView(response.roomState); updateVoiceButtonStates(); }
}
function joinRoom(roomId, needsPassword) { /* ... same, then on success: */
    // if (response.success) { ... showView('roomView'); ... renderRoomView(response.roomState); updateVoiceButtonStates(); }
}
function handleReadyClick() { /* ... same ... */ }
function handleSortHand() { /* ... same ... */ }
function toggleCardSelection(cardData, cardElement) { /* ... (ensure no major changes from previous working version) ... */
    if (!cardElement || cardElement.classList.contains('disabled')) return;
    const index = selectedCards.findIndex(c => c.rank === cardData.rank && c.suit === cardData.suit);
    if (index > -1) {
        selectedCards.splice(index, 1);
        cardElement.classList.remove('selected');
    } else {
        selectedCards.push(cardData);
        cardElement.classList.add('selected');
    }
    if (playSelectedCardsButton && currentGameState && currentGameState.currentPlayerId === myUserId) {
        playSelectedCardsButton.disabled = selectedCards.length === 0;
    }
}
function handlePlaySelectedCards() { /* ... same ... */ }
function handlePassTurn() { /* ... same ... */ }
function handleHint() { /* ... (ensure no major changes from previous working version, PTT doesn't affect this directly) ... */
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) {
        displayMessage(gameStatusDisp, '现在不是你的回合或状态无效。', true);
        return;
    }
    setGameActionButtonsDisabled(true);
    clearHintsAndSelection(false); // Clear only visual hint, not selection or cycle

    socket.emit('requestHint', currentHintCycleIndex, (response) => {
        if (currentGameState && currentGameState.status === 'playing' && currentGameState.currentPlayerId === myUserId) {
            setGameActionButtonsDisabled(false);
        }
        if (response.success && response.hint && response.hint.cards && response.hint.cards.length > 0) {
            displayMessage(gameStatusDisp, `提示: ${response.hint.type || '组合'} (再点提示可尝试下一个)`, false, true);
            currentHint = response.hint;
            currentHintCycleIndex = response.nextHintIndex;
            highlightHintedCards(currentHint.cards);
        } else {
            displayMessage(gameStatusDisp, response.message || '没有可出的牌或无更多提示。', true);
            currentHint = null;
        }
    });
}
function setGameActionButtonsDisabled(disabled) { /* ... same ... */ }
function highlightHintedCards(hintedCardsArray) { /* ... same ... */ }
function clearHintsAndSelection(resetHintCycleAndSelection = true) { /* ... (ensure no major changes from previous working version) ... */
    const localMyHandArea = document.getElementById('myHand');
    if (localMyHandArea) {
        const hintedElements = localMyHandArea.querySelectorAll('.card.hinted');
        hintedElements.forEach(el => el.classList.remove('hinted'));
    }
    if (resetHintCycleAndSelection) {
        currentHint = null;
        currentHintCycleIndex = 0;
        selectedCards = [];
        if(playSelectedCardsButton) playSelectedCardsButton.disabled = true;
        if (localMyHandArea) {
            const selectedElements = localMyHandArea.querySelectorAll('.card.selected');
            selectedElements.forEach(el => el.classList.remove('selected'));
        }
    }
}
function handleReturnToLobby() {
    console.log("Returning to lobby.");
    // disableVoiceChatFeatures(true); // showView will handle this when switching from roomView
    currentRoomId = null; currentGameState = null; previousGameState = null; isReadyForGame = false; selectedCards = []; currentHint = null; currentHintCycleIndex = 0;
    if (gameOverOverlay && !gameOverOverlay.classList.contains('hidden-view')) { gameOverOverlay.classList.add('hidden-view'); gameOverOverlay.classList.remove('view-flex'); }
    showView('lobbyView'); // This will hide voice controls and potentially disable voice if active
    socket.emit('listRooms', (rooms) => { renderRoomList(rooms); });
}
function showGameOver(scoreResultData) { /* ... same ... */ }

// --- Socket Event Handlers ---
socket.on('connect', () => { /* ... same ... */ });
socket.on('disconnect', (reason) => {
    console.log('[NET] Disconnected from server:', reason);
    if (isVoiceChatEnabled) { // If disconnected during voice chat
        disableVoiceChatFeatures(true);
    }
    if (currentView !== 'loginRegisterView' && currentView !== 'loadingView') {
        showView('loadingView');
        displayMessage(loadingView.querySelector('p'), `与服务器断开连接: ${reason}. 正在尝试重连...`, true);
    }
});
socket.on('connect_error', (err) => { /* ... same ... */ });
socket.on('roomListUpdate', (rooms) => { /* ... same ... */ });
socket.on('playerReadyUpdate', ({ userId, isReady }) => { /* ... same ... */ });

socket.on('playerJoined', (newPlayerInfo) => {
    console.log(`[EVENT] Player joined: ${newPlayerInfo.username}`);
    if (currentView === 'roomView' && currentGameState) {
        const existingPlayer = currentGameState.players.find(p => p.userId === newPlayerInfo.userId);
        if (existingPlayer) { Object.assign(existingPlayer, newPlayerInfo, {connected: true});}
        else { currentGameState.players.push({ ...newPlayerInfo, score:0, hand:undefined, handCount:0, role:null, finished:false, connected:true }); currentGameState.players.sort((a,b) => a.slot - b.slot); }
        
        renderRoomView(currentGameState); // Render first to update player list in UI
        displayMessage(document.getElementById('gameStatusDisplay'), `${newPlayerInfo.username} 加入了房间。`, false, true);

        if (isVoiceChatEnabled && newPlayerInfo.userId !== myUserId && newPlayerInfo.connected) {
            console.log(`[VOICE] New player ${newPlayerInfo.username} joined. Making call (voice chat enabled).`);
            makeCall(newPlayerInfo.userId);
        }
    } else if (currentView === 'roomView' && !currentGameState) {
        socket.emit('requestGameState', (state) => { if(state) { currentGameState = state; renderRoomView(state); /* Potentially init voice here if auto-joining voice */ } });
    }
});

socket.on('playerLeft', ({ userId, username, reason }) => {
    console.log(`[EVENT] Player left: ${username}, Reason: ${reason}`);
    if (currentGameState && currentView === 'roomView') {
        closePeerConnection(userId); // Close WebRTC connection
        const playerIdx = currentGameState.players.findIndex(p => p.userId === userId);
        if (playerIdx > -1) {
             currentGameState.players[playerIdx].connected = false; // Mark as disconnected in game state
             currentGameState.players[playerIdx].isReady = false;
        }
        renderRoomView(currentGameState);
        displayMessage(document.getElementById('gameStatusDisplay'), `${username} ${reason === 'disconnected' ? '断线了' : '离开了房间'}。`, true);
    }
});
socket.on('playerReconnected', (reconnectedPlayerInfo) => { /* ... same ... then potentially: */
    // if (isVoiceChatEnabled && reconnectedPlayerInfo.userId !== myUserId && reconnectedPlayerInfo.connected) {
    //     console.log(`[VOICE] Player ${reconnectedPlayerInfo.username} reconnected. Making call.`);
    //     makeCall(reconnectedPlayerInfo.userId);
    // }
});

socket.on('gameStarted', (initialGameState) => {
    console.log(`[EVENT] gameStarted received for room ${initialGameState.roomId}. My current room: ${currentRoomId}`);
    if (currentView !== 'roomView' || currentRoomId !== initialGameState.roomId) {
        console.warn("[DEBUG] gameStarted: Not in the correct view or room. IGNORED.");
        return;
    }
    // previousGameState = currentGameState ? JSON.parse(JSON.stringify(currentGameState)) : null;
    // currentGameState = initialGameState;
    // const gameStatusDisp = document.getElementById('gameStatusDisplay');
    // if (gameStatusDisp) displayMessage(gameStatusDisp, '游戏开始！祝你好运！', false, true);
    // selectedCards = [];
    // clearHintsAndSelection(true);
    // renderRoomView(currentGameState);
    // updateVoiceButtonStates(); // Ensure voice buttons are in correct state if user enabled voice while waiting

    // More robust: disable and re-enable if already on, to establish with game players
    if (isVoiceChatEnabled) {
        disableVoiceChatFeatures(); // Clear old connections
        enableVoiceChatFeatures();  // Connect to current game players
    } else {
        updateVoiceButtonStates();
    }
    // The rest of your gameStarted logic remains
    const myInitialPlayerState = initialGameState.players.find(p => p.userId === myUserId);
    console.log('[DEBUG] gameStarted: Processing event. My hand in initialGameState:', myInitialPlayerState?.hand);
    previousGameState = currentGameState ? JSON.parse(JSON.stringify(currentGameState)) : null;
    currentGameState = initialGameState;
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (gameStatusDisp) displayMessage(gameStatusDisp, '游戏开始！祝你好运！', false, true);
    selectedCards = [];
    clearHintsAndSelection(true);
    console.log('[DEBUG] gameStarted: Calling full renderRoomView with new initialGameState.');
    renderRoomView(currentGameState);
});

socket.on('gameStateUpdate', (newState) => { /* ... (ensure no major changes from previous working version regarding game logic) ... */
    if (currentView !== 'roomView' || !currentGameState || currentRoomId !== newState.roomId) {
        console.warn("[DEBUG] gameStateUpdate: Ignoring, not in room view or state mismatch.");
        return;
    }
    const myOldPlayerState = currentGameState.players.find(p => p.userId === myUserId);
    previousGameState = JSON.parse(JSON.stringify(currentGameState));
    currentGameState = newState;
    const myNewPlayerState = currentGameState.players.find(p => p.userId === myUserId);

    if (myNewPlayerState) {
        if (myNewPlayerState.hand !== undefined) {
            if (!myNewPlayerState.finished) {
                // console.log(`[DEBUG] gameStateUpdate: Server sent my updated hand. Using it. Count: ${myNewPlayerState.hand.length}`);
            }
        } else if (myNewPlayerState.handCount === 0 && !myNewPlayerState.finished) {
            myNewPlayerState.hand = [];
        }
    }
    if (previousGameState.currentPlayerId === myUserId && currentGameState.currentPlayerId !== myUserId) {
        selectedCards = [];
        clearHintsAndSelection(true);
    } else if (currentGameState.currentPlayerId === myUserId && !currentGameState.lastHandInfo && previousGameState.lastHandInfo) {
        selectedCards = [];
        clearHintsAndSelection(true);
    }
    console.log('[DEBUG] gameStateUpdate: Calling renderRoomView.');
    renderRoomView(currentGameState);
});
socket.on('invalidPlay', ({ message }) => { /* ... same ... */ });
socket.on('gameOver', (results) => { /* ... same, then potentially: */
    // disableVoiceChatFeatures(true); // Or let showView handle it when gameOverOverlay is shown
});
socket.on('gameStartFailed', ({ message }) => { /* ... same ... */ });
socket.on('allPlayersResetReady', () => { /* ... same ... */ });


// --- WebRTC Signaling Socket Handlers ---
socket.on('webrtc-offer', async (data) => {
    const { sdp, fromUserId, roomId } = data;
    if (roomId !== currentRoomId) return console.warn('[VOICE] Received offer for a different room.');

    if (!isVoiceChatEnabled) {
        console.log(`[VOICE] Received offer from ${fromUserId}, but local voice chat is disabled. Ignoring.`);
        return;
    }
    if (!localStream && !(await startLocalAudio())) { // Try to start audio if not already
        console.warn(`[VOICE] Cannot process offer from ${fromUserId}, local stream not ready/failed to start.`);
        return;
    }

    console.log(`[VOICE] Received offer from ${fromUserId}`);
    const pc = createPeerConnection(fromUserId);
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log(`[VOICE] Sending answer to ${fromUserId}`);
        socket.emit('webrtc-answer', {
            targetUserId: fromUserId,
            sdp: answer,
            roomId: currentRoomId,
            fromUserId: myUserId
        });
    } catch (error) {
        console.error(`[VOICE] Error processing offer from ${fromUserId}:`, error);
    }
});

socket.on('webrtc-answer', async (data) => {
    const { sdp, fromUserId, roomId } = data;
    if (roomId !== currentRoomId) return console.warn('[VOICE] Received answer for a different room.');
    if (!isVoiceChatEnabled) return; // Ignore if voice chat is not enabled

    console.log(`[VOICE] Received answer from ${fromUserId}`);
    const pc = peerConnections[fromUserId];
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            console.log(`[VOICE] Successfully set remote description for answer from ${fromUserId}`);
        } catch (error) {
            console.error(`[VOICE] Error setting remote description for answer from ${fromUserId}:`, error);
        }
    } else {
        console.warn(`[VOICE] No PeerConnection found for answer from ${fromUserId}. Might have been closed.`);
    }
});

socket.on('webrtc-ice-candidate', async (data) => {
    const { candidate, fromUserId, roomId } = data;
    if (roomId !== currentRoomId) return console.warn('[VOICE] Received ICE candidate for a different room.');
    if (!isVoiceChatEnabled) return;

    const pc = peerConnections[fromUserId];
    if (pc && pc.signalingState !== 'closed') { // Only add if PC exists and not closed
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            if (!error.message.includes("remote description is set") && !error.message.includes("connection is closed")) {
                 console.error(`[VOICE] Error adding ICE candidate from ${fromUserId}:`, error);
            }
        }
    } else {
        // console.warn(`[VOICE] No PeerConnection or closed PC for ICE candidate from ${fromUserId}`);
    }
});


// --- Initialization ---
function initClientSession() { /* ... same ... then after reauth success and potentially rejoining room: */
    // if (response.success && response.roomState) { ... renderRoomView(currentGameState); updateVoiceButtonStates(); ... }
    // else if (response.success) { ... updateVoiceButtonStates(); } // Lobby view
}
function setupEventListeners() {
    if(registerButton) registerButton.addEventListener('click', handleRegister);
    if(loginButton) loginButton.addEventListener('click', handleLogin);
    const lobbyLogoutBtnInstance = document.getElementById('logoutButton');
    if(lobbyLogoutBtnInstance) lobbyLogoutBtnInstance.addEventListener('click', handleLogout);
    if(createRoomButton) createRoomButton.addEventListener('click', handleCreateRoom);

    if (toggleVoiceChatButton) toggleVoiceChatButton.addEventListener('click', () => {
        if (isVoiceChatEnabled) {
            disableVoiceChatFeatures();
        } else {
            enableVoiceChatFeatures();
        }
    });

    if (pushToTalkButton) {
        pushToTalkButton.addEventListener('mousedown', startPushToTalk);
        pushToTalkButton.addEventListener('mouseup', stopPushToTalk);
        pushToTalkButton.addEventListener('mouseleave', stopPushToTalk);
        pushToTalkButton.addEventListener('touchstart', (e) => { e.preventDefault(); startPushToTalk(); }, { passive: false });
        pushToTalkButton.addEventListener('touchend', (e) => { e.preventDefault(); stopPushToTalk(); });
        pushToTalkButton.addEventListener('touchcancel', (e) => { e.preventDefault(); stopPushToTalk(); });
    }


    if (roomView) {
        roomView.addEventListener('click', function(event) {
            const buttonElement = event.target.closest('button');
            if (!buttonElement) return;
            // Exclude voice buttons from this generic handler if they have their own specific listeners
            if (buttonElement.id === 'toggleVoiceChatButton' || buttonElement.id === 'pushToTalkButton') return;

            const buttonId = buttonElement.id;
            // ... (rest of your existing switch case for game buttons)
             if (currentView !== 'roomView' && buttonId !== 'backToLobbyButton' && buttonId !== 'leaveRoomButton') { if (currentView === 'gameOverOverlay' && buttonId === 'backToLobbyButton') { } else if (currentView === 'roomView' && buttonId === 'leaveRoomButton') { } else { console.warn(`Button click for ${buttonId} ignored, current view is ${currentView}`); return; } } switch (buttonId) { case 'readyButton': handleReadyClick(); break; case 'leaveRoomButton': handleGameLeave(); break; case 'sortHandButton': handleSortHand(); break; case 'playSelectedCardsButton': handlePlaySelectedCards(); break; case 'passTurnButton': handlePassTurn(); break; case 'hintButton': handleHint(); break; case 'backToLobbyButton': handleReturnToLobby(); break; }
        });
    }
    // ... (rest of keypress listeners)
    regPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !registerButton.disabled) handleRegister(); }); loginPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !loginButton.disabled) handleLogin(); }); createRoomNameInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !createRoomButton.disabled) handleCreateRoom(); }); createRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !createRoomButton.disabled) handleCreateRoom(); });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Setting up client...");
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    // No longer need to append remoteAudioContainer here if it's in HTML already
    // const gameAreaElement = document.getElementById('gameArea');
    // if (gameAreaElement && remoteAudioContainer) { // Ensure remoteAudioContainer is defined
    //     gameAreaElement.appendChild(remoteAudioContainer);
    // } else if (remoteAudioContainer) {
    //     document.body.appendChild(remoteAudioContainer);
    // }

    setupEventListeners(); // Call this after all DOM elements are assumed to be available
    updateVoiceButtonStates(); // Set initial state of voice buttons

    if (socket.connected) {
        console.log("[INIT] Socket already connected on DOMContentLoaded.");
        initClientSession();
    } else {
        console.log("[INIT] Socket not connected on DOMContentLoaded. Waiting for 'connect' event.");
        showView('loadingView');
    }
    console.log('Client setup complete.');
});
