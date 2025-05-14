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
let currentGameState = null; // This will be our single source of truth from the server
// let previousGameState = null; // We might not need this if we always re-render from currentGameState
let isReadyForGame = false;
let selectedCards = [];
let currentSortMode = 'rank';
let currentHint = null;
let currentHintCycleIndex = 0;

// --- DOM Elements ---
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
const myHandArea = document.getElementById('myHand');
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

const ALARM_ICON_SRC = '/images/alarm-icon.svg';
const AVATAR_PATHS = [
    '/images/avatar-slot-0.png',
    '/images/avatar-slot-1.png',
    '/images/avatar-slot-2.png',
    '/images/avatar-slot-3.png',
];

// --- Utility Functions ---
function showView(viewName) { console.log(`[VIEW] Switching from ${currentView} to: ${viewName}`); currentView = viewName; for (const key in views) { if (views[key]) { views[key].classList.add('hidden-view'); views[key].classList.remove('view-block', 'view-flex'); } } const targetView = views[viewName]; if (targetView) { targetView.classList.remove('hidden-view'); if (viewName === 'roomView' || viewName === 'gameOverOverlay') { targetView.classList.add('view-flex'); } else { targetView.classList.add('view-block'); } } else { console.warn(`[VIEW] View element not found: ${viewName}`); } const allowScroll = (viewName === 'loginRegisterView' || viewName === 'lobbyView'); document.documentElement.style.overflow = allowScroll ? '' : 'hidden'; document.body.style.overflow = allowScroll ? '' : 'hidden'; clearMessages(); if (viewName !== 'roomView' && viewName !== 'gameOverOverlay') { selectedCards = []; currentHint = null; currentHintCycleIndex = 0; if (currentView !== 'gameOverOverlay') {currentGameState = null; /* previousGameState = null; */} } }
function displayMessage(element, message, isError = false, isSuccess = false) { if (element) { element.textContent = message; element.classList.remove('error', 'success'); if (isError) element.classList.add('error'); else if (isSuccess) element.classList.add('success'); else if (element.id !== 'gameStatusDisplay') element.className = 'message'; } }
function clearMessages() { [authMessage, lobbyMessage].forEach(el => { if (el) { el.textContent = ''; el.classList.remove('error', 'success'); el.className = 'message'; } }); const gameStatusDisp = document.getElementById('gameStatusDisplay'); if (gameStatusDisp && !gameStatusDisp.classList.contains('error') && !gameStatusDisp.classList.contains('success') && currentView !== 'roomView' && currentView !== 'gameOverOverlay') { /* gameStatusDisp.textContent = ''; */ } }
function getSuitSymbol(suit) { switch (suit?.toUpperCase()) { case 'H': return '♥'; case 'D': return '♦'; case 'C': return '♣'; case 'S': return '♠'; default: return '?'; } }
function getSuitClass(suit) { switch (suit?.toUpperCase()) { case 'H': return 'hearts'; case 'D': return 'diamonds'; case 'C': return 'clubs'; case 'S': return 'spades'; default: return ''; } }
const RANK_ORDER_CLIENT = ["4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2", "3"];
const RANK_VALUES_CLIENT = {}; RANK_ORDER_CLIENT.forEach((r, i) => RANK_VALUES_CLIENT[r] = i);
const SUIT_ORDER_CLIENT = ["D", "C", "H", "S"];
const SUIT_VALUES_CLIENT = {}; SUIT_ORDER_CLIENT.forEach((s, i) => SUIT_VALUES_CLIENT[s] = i);
function compareSingleCardsClient(cardA, cardB) { const rankValueA = RANK_VALUES_CLIENT[cardA.rank]; const rankValueB = RANK_VALUES_CLIENT[cardB.rank]; if (rankValueA !== rankValueB) return rankValueA - rankValueB; return SUIT_VALUES_CLIENT[cardA.suit] - SUIT_VALUES_CLIENT[cardB.suit]; }
function compareBySuitThenRank(cardA, cardB) { const suitValueA = SUIT_VALUES_CLIENT[cardA.suit]; const suitValueB = SUIT_VALUES_CLIENT[cardB.suit]; if (suitValueA !== suitValueB) return suitValueA - suitValueB; return RANK_VALUES_CLIENT[cardA.rank] - RANK_VALUES_CLIENT[cardB.rank]; }

// --- Rendering Functions ---
function renderRoomList(rooms) { if (!roomListEl) { console.error("CLIENT: roomList DOM element (roomListEl) not found!"); return; } roomListEl.innerHTML = ''; if (!Array.isArray(rooms)) { console.error("CLIENT: rooms data is not an array!", rooms); roomListEl.innerHTML = '<p>获取房间列表失败 (数据格式错误)。</p>'; return; } if (rooms.length === 0) { roomListEl.innerHTML = '<p>当前没有房间。</p>'; return; } rooms.forEach(room => { const item = document.createElement('div'); item.classList.add('room-item'); const nameSpan = document.createElement('span'); nameSpan.textContent = `${room.roomName} (${room.playerCount}/${room.maxPlayers})`; item.appendChild(nameSpan); const statusSpan = document.createElement('span'); statusSpan.textContent = `状态: ${room.status}`; statusSpan.classList.add(`status-${room.status}`); item.appendChild(statusSpan); if (room.hasPassword) { const passwordSpan = document.createElement('span'); passwordSpan.textContent = '🔒'; item.appendChild(passwordSpan); } const joinButton = document.createElement('button'); joinButton.textContent = '加入'; joinButton.disabled = room.status !== 'waiting' || room.playerCount >= room.maxPlayers; joinButton.onclick = () => joinRoom(room.roomId, room.hasPassword); item.appendChild(joinButton); roomListEl.appendChild(item); }); }
function updateGameInfoBarDOM(state) { const gameInfoBar = document.getElementById('gameInfoBar'); if (gameInfoBar) { const roomNameIdEl = gameInfoBar.querySelector('.room-name-id'); if (roomNameIdEl) { roomNameIdEl.innerHTML = ` <span class="room-name">${state.roomName || '房间'}</span> <span class="room-id">ID: ${state.roomId || 'N/A'}</span> `; } } }
function updateGameStatusDisplayDOM(state) { const gameStatusDisplay = document.getElementById('gameStatusDisplay'); if (gameStatusDisplay) { let messageText = ''; if (state.status === 'waiting') { const numPlayers = state.players.filter(p => p.connected).length; const maxPlayers = 4; messageText = `等待 ${numPlayers}/${maxPlayers} 位玩家准备...`; } else if (state.status === 'playing') { const currentPlayer = state.players.find(p => p.userId === state.currentPlayerId); messageText = currentPlayer ? (currentPlayer.userId === myUserId ? '轮到你出牌！' : `等待 ${currentPlayer.username} 出牌...`) : '游戏进行中...'; } else if (state.status === 'finished') { messageText = '游戏已结束'; } else { messageText = `状态: ${state.status}`; } if (gameStatusDisplay.textContent !== messageText && !gameStatusDisplay.classList.contains('error') && !gameStatusDisplay.classList.contains('success')) { displayMessage(gameStatusDisplay, messageText); } } }
function renderCenterPileDOM(state) { if (!centerPileArea) { console.error("CLIENT: centerPileArea DOM element not found!"); return; } centerPileArea.innerHTML = ''; if (state.centerPile && Array.isArray(state.centerPile) && state.centerPile.length > 0) { state.centerPile.forEach(cardData => { const cardElement = renderCard(cardData, false, true); centerPileArea.appendChild(cardElement); }); } else { const placeholder = document.createElement('span'); placeholder.textContent = '- 等待出牌 -'; placeholder.style.color = '#aaa'; placeholder.style.fontSize = '0.9em'; centerPileArea.appendChild(placeholder); } if (lastHandTypeDisplay) { if (state.lastHandInfo && state.lastHandInfo.type) { lastHandTypeDisplay.textContent = `类型: ${state.lastHandInfo.type}`; } else if (state.isFirstTurn && !state.lastHandInfo) { lastHandTypeDisplay.textContent = '请先出牌'; } else { lastHandTypeDisplay.textContent = '新回合'; } } }
function renderRoomView(state) {
    console.log(`[CLIENT RENDER] renderRoomView called at ${new Date().toLocaleTimeString()}`);
    if (!state || !roomView || !myUserId) { console.error("[CLIENT RENDER] RenderRoomView called with invalid state or no myUserId", state, myUserId); if (!myUserId && currentView === 'roomView') { handleLogout(); alert("用户身份丢失，请重新登录。"); } return; }
    updateGameInfoBarDOM(state);
    updateGameStatusDisplayDOM(state);
    Object.values(playerAreas).forEach(clearPlayerAreaDOM);
    const myPlayer = state.players.find(p => p.userId === myUserId);
    if (!myPlayer) { console.error("[CLIENT RENDER] My player data not found in game state!", state.players); handleGameLeave(); return; }
    isReadyForGame = myPlayer.isReady;
    const mySlot = myPlayer.slot;
    state.players.forEach(player => {
        const isMe = player.userId === myUserId;
        let relativeSlot = (player.slot - mySlot + state.players.length) % state.players.length;
        const targetArea = playerAreas[relativeSlot];
        if (targetArea) {
            // console.log(`[CLIENT RENDER] Rendering player ${player.username} in slot ${player.slot} (relative ${relativeSlot})`);
            renderPlayerArea(targetArea, player, isMe, state, player.slot);
        } else {
            console.warn(`[CLIENT RENDER] No target area for relative slot ${relativeSlot}`);
        }
    });
    renderCenterPileDOM(state);
    updateRoomControls(state);
    if (state.currentPlayerId !== myUserId || state.status !== 'playing') { clearHintsAndSelection(false); }
    console.log(`[CLIENT RENDER] renderRoomView finished for room ${state.roomId}`);
}
function clearPlayerAreaDOM(area) { if (!area) return; const avatarEl = area.querySelector('.player-avatar'); const nameEl = area.querySelector('.playerName'); const roleEl = area.querySelector('.playerRole'); const infoEl = area.querySelector('.playerInfo'); const cardsEl = area.querySelector('.playerCards'); const handCountEl = area.querySelector('.hand-count-display'); if (avatarEl) { avatarEl.innerHTML = ''; avatarEl.style.backgroundImage = ''; } if (nameEl) nameEl.textContent = (area.id === 'playerAreaBottom' && myUsername) ? myUsername + ' (你)' : '空位'; if (roleEl) roleEl.textContent = '[?]'; if (infoEl) infoEl.innerHTML = '总分: 0'; if (cardsEl) cardsEl.innerHTML = '<span style="color:#888; font-style:italic;">- 等待 -</span>'; if (handCountEl) handCountEl.remove(); if (area.id === 'playerAreaBottom') { const actionsContainers = area.querySelectorAll('.my-actions-container'); actionsContainers.forEach(ac => ac.classList.add('hidden-view')); const readyBtn = area.querySelector('#readyButton'); if (readyBtn) readyBtn.classList.add('hidden-view'); } }
function renderPlayerArea(container, playerData, isMe, state, absoluteSlot) { const avatarEl = container.querySelector('.player-avatar'); const nameEl = container.querySelector('.playerName'); const roleEl = container.querySelector('.playerRole'); const infoEl = container.querySelector('.playerInfo'); const cardsEl = container.querySelector('.playerCards'); if (!playerData || !playerData.userId) { clearPlayerAreaDOM(container); return; } if (avatarEl) { avatarEl.innerHTML = ''; avatarEl.style.backgroundImage = `url('${AVATAR_PATHS[absoluteSlot % AVATAR_PATHS.length]}')`; if (state.status === 'playing' && playerData.userId === state.currentPlayerId && !playerData.finished) { const alarmImg = document.createElement('img'); alarmImg.src = ALARM_ICON_SRC; alarmImg.alt = '出牌提示'; alarmImg.classList.add('alarm-icon'); avatarEl.appendChild(alarmImg); avatarEl.style.backgroundImage = 'none'; } } if (nameEl) nameEl.textContent = playerData.username + (isMe ? ' (你)' : ''); if (roleEl) roleEl.textContent = playerData.role ? `[${playerData.role}]` : '[?]'; if (infoEl) { let infoText = `总分: ${playerData.score || 0}`; if (playerData.finished) infoText += ' <span class="finished">[已完成]</span>'; else if (!playerData.connected && state.status !== 'waiting') infoText += ' <span class="disconnected">[已断线]</span>'; else if (state.status === 'waiting' && !isMe) { infoText += playerData.isReady ? ' <span class="ready">[已准备]</span>' : ' <span class="not-ready">[未准备]</span>'; } infoEl.innerHTML = infoText; } if (cardsEl) renderPlayerCards(cardsEl, playerData, isMe, state.status === 'playing' && state.currentPlayerId === myUserId); }

function fanCards(cardContainer, cardElements, areaId) {
    const numCards = cardElements.length;
    if (numCards === 0 || areaId === 'playerAreaBottom') {
        if (areaId === 'playerAreaBottom') {
            cardElements.forEach((card, i) => { // Ensure zIndex is set for self hand for CSS overlap
                card.style.zIndex = i;
                card.style.transform = ''; card.style.left = ''; card.style.top = ''; card.style.position = '';
            });
        }
        return;
    }
    const offsetXPerCard = 1; const offsetYPerCard = 1;
    const maxVisibleStackedCards = Math.min(numCards, 3);
    cardElements.forEach((card, i) => {
        let currentOffsetX = (i < maxVisibleStackedCards) ? i * offsetXPerCard : (maxVisibleStackedCards - 1) * offsetXPerCard;
        let currentOffsetY = (i < maxVisibleStackedCards) ? i * offsetYPerCard : (maxVisibleStackedCards - 1) * offsetYPerCard;
        card.style.transform = `translate(${currentOffsetX}px, ${currentOffsetY}px)`;
        card.style.zIndex = i; card.style.opacity = '1';
    });
}

function getCardImageFilename(cardData) { if (!cardData || typeof cardData.rank !== 'string' || typeof cardData.suit !== 'string') { console.error("Invalid cardData for getCardImageFilename:", cardData); return null; } let rankStr = cardData.rank.toLowerCase(); if (rankStr === 't') rankStr = '10'; else if (rankStr === 'j') rankStr = 'jack'; else if (rankStr === 'q') rankStr = 'queen'; else if (rankStr === 'k') rankStr = 'king'; else if (rankStr === 'a') rankStr = 'ace'; let suitStr = ''; switch (cardData.suit.toUpperCase()) { case 'S': suitStr = 'spades'; break; case 'H': suitStr = 'hearts'; break; case 'D': suitStr = 'diamonds'; break; case 'C': suitStr = 'clubs'; break; default: console.warn("Invalid suit for card image:", cardData.suit); return null; } return `${rankStr}_of_${suitStr}.png`; }
function renderCard(cardData, isHidden, isCenterPileCard = false) { const cardDiv = document.createElement('div'); cardDiv.classList.add('card'); if (isHidden || !cardData) { cardDiv.classList.add('hidden'); } else { cardDiv.classList.add('visible'); const filename = getCardImageFilename(cardData); if (filename) { cardDiv.style.backgroundImage = `url('/images/cards/${filename}')`; cardDiv.dataset.suit = cardData.suit; cardDiv.dataset.rank = cardData.rank; } else { cardDiv.textContent = `${cardData.rank || '?'}${getSuitSymbol(cardData.suit)}`; cardDiv.classList.add(getSuitClass(cardData.suit)); console.error("Failed to generate filename for card:", cardData, "Using text fallback."); } } return cardDiv; }

function renderPlayerCards(container, playerData, isMe, isMyTurnAndPlaying) {
    // console.log(`[CLIENT RENDER] renderPlayerCards for ${playerData.username} (isMe: ${isMe}) at ${new Date().toLocaleTimeString()}`);
    // if (isMe) {
    //     console.log(`  My hand data:`, playerData.hand ? JSON.parse(JSON.stringify(playerData.hand)) : 'undefined/empty');
    // }
    while (container.firstChild) { container.removeChild(container.firstChild); }
    const localCardElementsForOpponent = [];
    if (isMe) {
        let sortedHand = playerData.hand ? [...playerData.hand] : []; // ALWAYS use hand from current playerData
        if (playerData.finished) { container.innerHTML = '<span style="color:#888; font-style:italic;">已出完</span>'; }
        else if (sortedHand.length === 0) { container.innerHTML = '<span style="color:#555; font-style:italic;">- 无手牌 -</span>'; }
        else {
            if (currentSortMode === 'rank') sortedHand.sort(compareSingleCardsClient);
            else if (currentSortMode === 'suit') sortedHand.sort(compareBySuitThenRank);
            sortedHand.forEach((cardData, index) => {
                const cardElement = renderCard(cardData, false, false);
                cardElement.style.zIndex = index; // Set z-index for CSS stacking
                const isSelected = selectedCards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);
                const isHinted = currentHint && currentHint.cards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);
                if (isSelected) cardElement.classList.add('selected');
                if (isHinted) cardElement.classList.add('hinted');
                if (isMyTurnAndPlaying) { cardElement.onclick = () => toggleCardSelection(cardData, cardElement); }
                else { cardElement.classList.add('disabled'); }
                container.appendChild(cardElement);
            });
        }
    } else { // Opponent's hand
        if (playerData.finished) { container.innerHTML = '<span style="color:#888; font-style:italic;">已出完</span>'; }
        else if (playerData.handCount > 0) {
            for (let i = 0; i < playerData.handCount; i++) {
                const cardElement = renderCard(null, true, false);
                container.appendChild(cardElement);
                localCardElementsForOpponent.push(cardElement);
            }
            let handCountEl = container.closest('.playerArea')?.querySelector('.hand-count-display');
            if (!handCountEl) { handCountEl = document.createElement('div'); handCountEl.classList.add('hand-count-display'); const playerAreaEl = container.closest('.playerArea'); if (playerAreaEl) { playerAreaEl.appendChild(handCountEl); } }
            if (handCountEl) handCountEl.textContent = `${playerData.handCount} 张`;
        } else { container.innerHTML = '<span style="color:#555; font-style:italic;">- 等待 -</span>'; let handCountEl = container.closest('.playerArea')?.querySelector('.hand-count-display'); if (handCountEl) handCountEl.remove(); }
        if (localCardElementsForOpponent.length > 0) { requestAnimationFrame(() => { fanCards(container, localCardElementsForOpponent, container.closest('.playerArea')?.id); }); }
    }
}

function toggleCardSelection(cardData, cardElement) {
    if (!cardElement || cardElement.classList.contains('disabled')) return;
    const indexInSelected = selectedCards.findIndex(c => c.rank === cardData.rank && c.suit === cardData.suit);
    const handCardElements = Array.from(myHandArea.querySelectorAll('.card:not(.hidden)'));

    if (indexInSelected > -1) { // Deselecting
        selectedCards.splice(indexInSelected, 1);
        cardElement.classList.remove('selected');
        // Restore z-index based on its original DOM order (which renderPlayerCards sets)
        const domIndex = handCardElements.indexOf(cardElement);
        if (domIndex !== -1) cardElement.style.zIndex = domIndex;
    } else { // Selecting
        selectedCards.push(cardData);
        cardElement.classList.add('selected');
        // Elevate z-index slightly for the selected card to pop, CSS class handles the main lift
        // CSS .selected should have a z-index like 50. The base cards have 0-12.
        // This ensures it's above its direct unselected neighbors.
        // For cards further to the right, their original higher z-index (e.g., 10 vs 5) might still make them overlap.
        // The transform should visually lift it enough.
         cardElement.style.zIndex = (parseInt(cardElement.style.zIndex || '0', 10) + 20).toString(); // Temporarily boost
    }
    if (playSelectedCardsButton && currentGameState && currentGameState.currentPlayerId === myUserId) {
         playSelectedCardsButton.disabled = selectedCards.length === 0;
    }
}

// ... (Rest of the functions: updateRoomControls, handleRegister, handleLogin, etc. - ALL THE SAME AS PREVIOUS FULL VERSION)
function updateRoomControls(state) { if (!state || !myUserId) return; const myPlayerInState = state.players.find(p => p.userId === myUserId); if (!myPlayerInState) return; const readyButtonInstance = document.getElementById('readyButton'); if (readyButtonInstance) { if (state.status === 'waiting') { readyButtonInstance.classList.remove('hidden-view'); readyButtonInstance.textContent = myPlayerInState.isReady ? '取消' : '准备'; readyButtonInstance.classList.toggle('ready', myPlayerInState.isReady); readyButtonInstance.disabled = false; } else { readyButtonInstance.classList.add('hidden-view'); } } const actionsContainers = document.querySelectorAll('#playerAreaBottom .my-actions-container'); if (actionsContainers.length > 0) { if (state.status === 'playing' && state.currentPlayerId === myUserId && !myPlayerInState.finished) { actionsContainers.forEach(ac => ac.classList.remove('hidden-view')); if(playSelectedCardsButton) playSelectedCardsButton.disabled = selectedCards.length === 0; if(passTurnButton) { let disablePass = (!state.lastHandInfo && !state.isFirstTurn); if (state.isFirstTurn && !state.lastHandInfo) { const iAmD4Holder = myPlayerInState.hand && myPlayerInState.hand.some(c => c.rank === '4' && c.suit === 'D'); if (iAmD4Holder) disablePass = true; } passTurnButton.disabled = disablePass; } if(hintButton) hintButton.disabled = false; if(sortHandButton) sortHandButton.disabled = false; } else { actionsContainers.forEach(ac => ac.classList.add('hidden-view')); } } }
function handleRegister() { const phone = regPhoneInput.value.trim(); const password = regPasswordInput.value; if (!phone || !password) { displayMessage(authMessage, '请输入手机号和密码。', true); return; } if (password.length < 4) { displayMessage(authMessage, '密码至少需要4位。', true); return; } registerButton.disabled = true; socket.emit('register', { phoneNumber: phone, password }, (response) => { registerButton.disabled = false; displayMessage(authMessage, response.message, !response.success, response.success); if (response.success) { regPhoneInput.value = ''; regPasswordInput.value = ''; } }); }
function handleLogin() { const phone = loginPhoneInput.value.trim(); const password = loginPasswordInput.value; if (!phone || !password) { displayMessage(authMessage, '请输入手机号和密码。', true); return; } loginButton.disabled = true; socket.emit('login', { phoneNumber: phone, password }, (response) => { loginButton.disabled = false; displayMessage(authMessage, response.message, !response.success, response.success); if (response.success) { myUserId = response.userId; myUsername = response.username; try { localStorage.setItem('kkUserId', myUserId); localStorage.setItem('kkUsername', myUsername); } catch (e) { console.warn('LocalStorage error while saving user session:', e); } if(lobbyUsername) lobbyUsername.textContent = myUsername; showView('lobbyView'); socket.emit('listRooms', (rooms) => renderRoomList(rooms)); } }); }
function handleLogout() { console.log('Logging out...'); try { localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); } catch (e) { console.warn('LocalStorage error while removing user session:', e); } myUserId = null; myUsername = null; currentRoomId = null; currentGameState = null; previousGameState = null; isReadyForGame = false; selectedCards = []; currentHint = null; currentHintCycleIndex = 0; if (socket.connected) { socket.disconnect(); } socket.connect(); showView('loginRegisterView'); if(loginPhoneInput) loginPhoneInput.value = ''; if(loginPasswordInput) loginPasswordInput.value = ''; }
function handleGameLeave() { if (!currentRoomId) { console.log("Not in a room to leave."); handleReturnToLobby(); return; } console.log(`Attempting to leave room: ${currentRoomId} from game view.`); const actualLeaveButton = document.getElementById('leaveRoomButton'); if (actualLeaveButton) actualLeaveButton.disabled = true; socket.emit('leaveRoom', (response) => { if (actualLeaveButton) actualLeaveButton.disabled = false; if (response.success) { handleReturnToLobby(); } else { const gameStatusDisp = document.getElementById('gameStatusDisplay'); displayMessage(gameStatusDisp || lobbyMessage, response.message || '离开房间失败。', true); } }); }
function handleCreateRoom() { const roomName = createRoomNameInput.value.trim(); const password = createRoomPasswordInput.value; if (!roomName) { displayMessage(lobbyMessage, '请输入房间名称。', true); return; } createRoomButton.disabled = true; socket.emit('createRoom', { roomName, password: password || null }, (response) => { createRoomButton.disabled = false; if (response.success) { currentRoomId = response.roomId; showView('roomView'); previousGameState = null; currentGameState = response.roomState; renderRoomView(response.roomState); } else { displayMessage(lobbyMessage, response.message, true); } }); }
function joinRoom(roomId, needsPassword) { let passwordToTry = null; if (needsPassword) { passwordToTry = prompt(`房间 "${roomId}" 受密码保护，请输入密码:`, ''); if (passwordToTry === null) return; } displayMessage(lobbyMessage, `正在加入房间 ${roomId}...`, false); socket.emit('joinRoom', { roomId, password: passwordToTry }, (response) => { if (response.success) { currentRoomId = response.roomId; showView('roomView'); previousGameState = null; currentGameState = response.roomState; renderRoomView(response.roomState); displayMessage(lobbyMessage, '', false); } else { displayMessage(lobbyMessage, response.message, true); } }); }
function handleReadyClick() { if (!currentRoomId || !currentGameState) return; const actualReadyButton = document.getElementById('readyButton'); if (!actualReadyButton) {console.error("Ready button not found!"); return;} const desiredReadyState = !isReadyForGame; actualReadyButton.disabled = true; socket.emit('playerReady', desiredReadyState, (response) => { actualReadyButton.disabled = false; if (!response.success) { const gameStatusDisp = document.getElementById('gameStatusDisplay'); displayMessage(gameStatusDisp, response.message || "无法改变准备状态。", true); } }); }
function handleSortHand() { if (currentSortMode === 'rank') currentSortMode = 'suit'; else currentSortMode = 'rank'; if (currentGameState && currentView === 'roomView') { const myPlayer = currentGameState.players.find(p => p.userId === myUserId); if (myPlayer && myPlayer.hand) { const selfArea = playerAreas[0]; if(selfArea) { const cardsEl = selfArea.querySelector('.myHand'); if (cardsEl) renderPlayerCards(cardsEl, myPlayer, true, currentGameState.status === 'playing' && currentGameState.currentPlayerId === myUserId); } } } }
function handlePlaySelectedCards() { const gameStatusDisp = document.getElementById('gameStatusDisplay'); if (selectedCards.length === 0) { displayMessage(gameStatusDisp, '请先选择要出的牌。', true); return; } if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) { displayMessage(gameStatusDisp, '现在不是你的回合或状态无效。', true); return; } setGameActionButtonsDisabled(true); socket.emit('playCard', selectedCards, (response) => { if (!response.success) { displayMessage(gameStatusDisp, response.message || '出牌失败。', true); if (currentGameState && currentGameState.status === 'playing' && currentGameState.currentPlayerId === myUserId) { setGameActionButtonsDisabled(false); } } else { selectedCards = []; clearHintsAndSelection(true); } }); }
function handlePassTurn() { const gameStatusDisp = document.getElementById('gameStatusDisplay'); if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) { displayMessage(gameStatusDisp, '现在不是你的回合或状态无效。', true); return; } if (passTurnButton && passTurnButton.disabled) { displayMessage(gameStatusDisp, '你必须出牌。', true); return; } setGameActionButtonsDisabled(true); selectedCards = []; socket.emit('passTurn', (response) => { if (!response.success) { displayMessage(gameStatusDisp, response.message || 'Pass 失败。', true); if (currentGameState && currentGameState.status === 'playing' && currentGameState.currentPlayerId === myUserId) { setGameActionButtonsDisabled(false); } } else { clearHintsAndSelection(true); } }); }
function handleHint() { const gameStatusDisp = document.getElementById('gameStatusDisplay'); if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) { displayMessage(gameStatusDisp, '现在不是你的回合或状态无效。', true); return; } setGameActionButtonsDisabled(true); socket.emit('requestHint', currentHintCycleIndex, (response) => { if (currentGameState && currentGameState.status === 'playing' && currentGameState.currentPlayerId === myUserId) { setGameActionButtonsDisabled(false); } clearHintsAndSelection(false); if (response.success && response.hint && response.hint.cards) { displayMessage(gameStatusDisp, '找到提示！(再点提示可尝试下一个)', false, true); currentHint = response.hint; currentHintCycleIndex = response.nextHintIndex; highlightHintedCards(currentHint.cards); } else { displayMessage(gameStatusDisp, response.message || '没有可出的牌或无更多提示。', true); currentHint = null; currentHintCycleIndex = 0; } }); }
function setGameActionButtonsDisabled(disabled) { if (playSelectedCardsButton) playSelectedCardsButton.disabled = disabled; if (passTurnButton) passTurnButton.disabled = disabled; if (hintButton) hintButton.disabled = disabled; if (!disabled && currentGameState) { updateRoomControls(currentGameState); } }
function highlightHintedCards(hintedCardsArray) { if (!hintedCardsArray || hintedCardsArray.length === 0) return; if (!myHandArea) return; const cardElements = myHandArea.querySelectorAll('.card.visible:not(.hidden)'); hintedCardsArray.forEach(hintCard => { for(const elem of cardElements) { if(elem.dataset.rank === hintCard.rank && elem.dataset.suit === hintCard.suit) { elem.classList.add('hinted'); break; } } }); }
function clearHintsAndSelection(resetHintCycleAndSelection = true) { if (resetHintCycleAndSelection) { currentHint = null; currentHintCycleIndex = 0; selectedCards = []; if(playSelectedCardsButton) playSelectedCardsButton.disabled = true; } if (myHandArea) { const hintedElements = myHandArea.querySelectorAll('.card.hinted'); hintedElements.forEach(el => el.classList.remove('hinted')); if(resetHintCycleAndSelection){ const selectedElements = myHandArea.querySelectorAll('.card.selected'); selectedElements.forEach(el => el.classList.remove('selected')); } } }
function handleReturnToLobby() { console.log("Returning to lobby."); currentRoomId = null; currentGameState = null; previousGameState = null; isReadyForGame = false; selectedCards = []; currentHint = null; currentHintCycleIndex = 0; if (gameOverOverlay && !gameOverOverlay.classList.contains('hidden-view')) { gameOverOverlay.classList.add('hidden-view'); gameOverOverlay.classList.remove('view-flex'); } showView('lobbyView'); socket.emit('listRooms', (rooms) => { renderRoomList(rooms); }); }
function showGameOver(scoreResultData) { if (!scoreResultData) { console.warn("showGameOver called with no data. Using last known game state if available."); gameOverTitle.textContent = "游戏结束!"; gameOverReason.textContent = currentGameState?.gameResult?.reason || "无法获取详细结果。"; gameOverScores.innerHTML = ''; const playersToDisplay = currentGameState?.players || []; playersToDisplay.forEach(playerData => { const p = document.createElement('p'); p.textContent = `${playerData.name} (${playerData.role || '?'}) 总分: ${playerData.score}`; gameOverScores.appendChild(p); }); } else { gameOverTitle.textContent = scoreResultData.result || "游戏结束!"; gameOverReason.textContent = scoreResultData.reason || (scoreResultData.result ? '' : "游戏正常结束。"); gameOverScores.innerHTML = ''; const playersToDisplay = scoreResultData.finalScores || currentGameState?.players || []; playersToDisplay.forEach(playerData => { const p = document.createElement('p'); let scoreText = `${playerData.name} (${playerData.role || '?'})`; if (scoreResultData.scoreChanges && scoreResultData.scoreChanges[playerData.id] !== undefined) { const change = scoreResultData.scoreChanges[playerData.id]; const changeDisplay = change > 0 ? `+${change}` : (change < 0 ? `${change}` : '0'); const changeClass = change > 0 ? 'score-plus' : (change < 0 ? 'score-minus' : 'score-zero'); scoreText += ` : <span class="${changeClass}">${changeDisplay}</span>`; } scoreText += ` (总分: ${playerData.score})`; p.innerHTML = scoreText; gameOverScores.appendChild(p); }); } showView('gameOverOverlay'); }

// --- Socket Event Handlers ---
socket.on('connect', () => { console.log('Connected to server! Socket ID:', socket.id); if (gameOverOverlay && !gameOverOverlay.classList.contains('hidden-view')) { gameOverOverlay.classList.add('hidden-view'); gameOverOverlay.classList.remove('view-flex'); } initClientSession(); });
socket.on('disconnect', (reason) => { console.log('Disconnected from server:', reason); if (currentView !== 'loginRegisterView
