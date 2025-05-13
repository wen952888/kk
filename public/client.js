// public/client.js
const socket = io();

// --- State Variables ---
let currentView = 'loading'; // Initial view
let myUserId = null;
let myUsername = null;
let currentRoomId = null;
let currentGameState = null;
let isReady = false;
let selectedCards = [];
let currentSortMode = 'rank';
let currentHint = null;
let currentHintIndex = 0;

// --- DOM Elements ---
// (DOM element getters remain the same)
const loadingView = document.getElementById('loadingView');
const loginRegisterView = document.getElementById('loginRegisterView');
const lobbyView = document.getElementById('lobbyView');
const roomView = document.getElementById('roomView');
const views = { loadingView, loginRegisterView, lobbyView, roomView, gameOverOverlay }; // Added gameOverOverlay to views map
// Auth
const regPhoneInput = document.getElementById('regPhone');
const regPasswordInput = document.getElementById('regPassword');
const registerButton = document.getElementById('registerButton');
const loginPhoneInput = document.getElementById('loginPhone');
const loginPasswordInput = document.getElementById('loginPassword');
const loginButton = document.getElementById('loginButton');
const authMessage = document.getElementById('authMessage');
const logoutButton = document.getElementById('logoutButton');
// Lobby
const lobbyUsername = document.getElementById('lobbyUsername');
const createRoomNameInput = document.getElementById('createRoomName');
const createRoomPasswordInput = document.getElementById('createRoomPassword');
const createRoomButton = document.getElementById('createRoomButton');
const roomList = document.getElementById('roomList');
const lobbyMessage = document.getElementById('lobbyMessage');
// Room/Game
const roomNameDisplay = document.getElementById('roomNameDisplay');
const gameModeDisplay = document.getElementById('gameModeDisplay');
const roomStatusDisplay = document.getElementById('roomStatusDisplay');
const leaveRoomButton = document.getElementById('leaveRoomButton');
const gameArea = document.getElementById('gameArea');
const centerPileArea = document.getElementById('centerPileArea');
const lastHandTypeDisplay = document.getElementById('lastHandTypeDisplay');
const myHandArea = document.getElementById('myHand');
const myActionsArea = document.getElementById('myActions');
const playSelectedCardsButton = document.getElementById('playSelectedCardsButton');
const passTurnButton = document.getElementById('passTurnButton');
const hintButton = document.getElementById('hintButton');
const sortHandButton = document.getElementById('sortHandButton');
const playerAreas = { 0: document.getElementById('playerAreaBottom'), 1: document.getElementById('playerAreaLeft'), 2: document.getElementById('playerAreaTop'), 3: document.getElementById('playerAreaRight') };
const readyButton = document.getElementById('readyButton');
const gameMessage = document.getElementById('gameMessage');
// Game Over Overlay
const gameOverOverlay = document.getElementById('gameOverOverlay');
const gameOverTitle = document.getElementById('gameOverTitle');
const gameOverReason = document.getElementById('gameOverReason');
const gameOverScores = document.getElementById('gameOverScores');
const backToLobbyButton = document.getElementById('backToLobbyButton');


// --- Utility Functions ---
function showView(viewName) {
    console.log(`Switching view to: ${viewName}`);
    currentView = viewName;

    // Add 'hidden-view' to all managed views first
    for (const key in views) {
        if (views[key]) {
            views[key].classList.add('hidden-view');
            // Remove specific display classes if they exist (more robust)
            views[key].classList.remove('view-block', 'view-flex');
        }
    }

    // Then remove 'hidden-view' from the target view and add its display class
    const targetView = views[viewName];
    if (targetView) {
        targetView.classList.remove('hidden-view');
        if (viewName === 'roomView' || viewName === 'gameOverOverlay') { // gameOverOverlay also uses flex for centering
            targetView.classList.add('view-flex');
        } else {
            targetView.classList.add('view-block');
        }
    } else {
        console.warn(`View element not found: ${viewName}`);
    }

    const scroll = (viewName !== 'roomView'); // Allow scroll for lobby, login etc.
    document.documentElement.style.overflow = scroll ? '' : 'hidden';
    document.body.style.overflow = scroll ? '' : 'hidden';

    clearMessages();
    if (viewName !== 'roomView') {
        selectedCards = [];
        currentHint = null;
        currentHintIndex = 0;
        // hideGameOver(); // No longer needed as showView manages all views including overlay
    }
}

// ... (displayMessage, clearMessages, getSuitSymbol, getSuitClass, card comparison functions remain same) ...
function displayMessage(element, message, isError = false) { if (element) { element.textContent = message; element.className = `message ${isError ? 'error' : 'success'}`; } }
function clearMessages() { [authMessage, lobbyMessage, gameMessage].forEach(el => { if (el) el.textContent = ''; }); }
function getSuitSymbol(suit) { switch (suit?.toUpperCase()) { case 'H': return '♥'; case 'D': return '♦'; case 'C': return '♣'; case 'S': return '♠'; default: return '?'; } }
function getSuitClass(suit) { switch (suit?.toUpperCase()) { case 'H': return 'hearts'; case 'D': return 'diamonds'; case 'C': return 'clubs'; case 'S': return 'spades'; default: return ''; } }
const RANK_ORDER_CLIENT = ["4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2", "3"];
const RANK_VALUES_CLIENT = {}; RANK_ORDER_CLIENT.forEach((r, i) => RANK_VALUES_CLIENT[r] = i);
const SUIT_ORDER_CLIENT = ["D", "C", "H", "S"];
const SUIT_VALUES_CLIENT = {}; SUIT_ORDER_CLIENT.forEach((s, i) => SUIT_VALUES_CLIENT[s] = i);
function compareSingleCardsClient(cardA, cardB) {
    const rankValueA = RANK_VALUES_CLIENT[cardA.rank]; const rankValueB = RANK_VALUES_CLIENT[cardB.rank];
    if (rankValueA !== rankValueB) return rankValueA - rankValueB;
    return SUIT_VALUES_CLIENT[cardA.suit] - SUIT_VALUES_CLIENT[cardB.suit];
}
function compareBySuitThenRank(cardA, cardB) {
    const suitValueA = SUIT_VALUES_CLIENT[cardA.suit]; const suitValueB = SUIT_VALUES_CLIENT[cardB.suit];
    if (suitValueA !== suitValueB) return suitValueA - suitValueB;
    return RANK_VALUES_CLIENT[cardA.rank] - RANK_VALUES_CLIENT[cardB.rank];
}


// --- Rendering Functions ---
function renderRoomList(rooms) { /* ... unchanged, no inline styles used ... */
    if (!roomList) return; roomList.innerHTML = '';
    if (!rooms || rooms.length === 0) { roomList.innerHTML = '<p>当前没有房间。</p>'; return; }
    rooms.forEach(room => {
        const item = document.createElement('div'); item.classList.add('room-item');
        const nameSpan = document.createElement('span'); nameSpan.textContent = `${room.roomName} (${room.playerCount}/${room.maxPlayers})`; item.appendChild(nameSpan);
        const statusSpan = document.createElement('span'); statusSpan.textContent = `状态: ${room.status}`; statusSpan.classList.add(`status-${room.status}`); item.appendChild(statusSpan);
        const passwordSpan = document.createElement('span'); passwordSpan.textContent = room.hasPassword ? '🔒' : ''; item.appendChild(passwordSpan);
        const joinButton = document.createElement('button'); joinButton.textContent = '加入'; joinButton.disabled = room.status !== 'waiting' || room.playerCount >= room.maxPlayers; joinButton.onclick = () => joinRoom(room.roomId, room.hasPassword); item.appendChild(joinButton);
        roomList.appendChild(item);
    });
 }

function renderRoomView(state) {
    currentGameState = state;
    if (!state || !roomView) return;

    roomNameDisplay.textContent = state.roomName || '房间';
    gameModeDisplay.textContent = state.gameMode === 'double_landlord' ? '(双地主模式)' : '(标准模式)';
    roomStatusDisplay.textContent = `状态: ${state.status}`;
    isReady = false;

    Object.values(playerAreas).forEach(clearPlayerArea);
    centerPileArea.innerHTML = '';
    lastHandTypeDisplay.textContent = state.lastHandInfo ? `类型: ${state.lastHandInfo.type}` : '-';

    const myPlayer = state.players.find(p => p.userId === myUserId);
    if (!myPlayer) { console.error("Cannot find myself in player list!"); return; }
    const mySlot = myPlayer.slot;

    state.players.forEach(player => {
        const isMe = player.userId === myUserId;
        if (isMe) isReady = player.isReady;

        let relativeSlot = (player.slot - mySlot + 4) % 4;
        const targetArea = playerAreas[relativeSlot];
        if (targetArea) renderPlayerArea(targetArea, player, isMe, state);
    });

    if (state.centerPile && state.centerPile.length > 0) {
        state.centerPile.forEach(cardData => centerPileArea.appendChild(renderCard(cardData, false)));
    } else {
        centerPileArea.innerHTML = '-';
    }
    updateRoomControls(state);
    if (state.currentPlayerId !== myUserId || state.status !== 'playing') clearHints();
}

function clearPlayerArea(area) { /* ... unchanged ... */
     if (!area) return;
     area.classList.remove('current-turn');
     const nameEl = area.querySelector('.playerName');
     const roleEl = area.querySelector('.playerRole');
     const infoEl = area.querySelector('.playerInfo');
     const cardsEl = area.querySelector('.playerCards');
     const actions = area.querySelector('.my-actions'); // Check if it's the bottom player area
     if (nameEl) nameEl.textContent = '空位';
     if (roleEl) roleEl.textContent = '';
     if (infoEl) infoEl.textContent = '';
     if (cardsEl) cardsEl.innerHTML = '';
     if(actions) actions.classList.add('hidden-view'); // Use class to hide
}

function renderPlayerArea(container, playerData, isMe, state) {
    // ... (renderPlayerArea logic unchanged, but relies on classes, not inline styles) ...
    const nameEl = container.querySelector('.playerName');
    const roleEl = container.querySelector('.playerRole'); // This is in the header for each player
    const infoEl = container.querySelector('.playerInfo');
    const cardsEl = container.querySelector('.playerCards');

    if (nameEl) nameEl.textContent = playerData.username + (isMe ? ' (你)' : '');
    if (roleEl) roleEl.textContent = `[${playerData.role || '?'}]`;


    if (infoEl) {
        let infoText = `总分: ${playerData.score || 0}`;
        if (playerData.finished) infoText += ' <span class="finished">[已完成]</span>';
        else if (!playerData.connected) infoText += ' <span class="disconnected">[已断线]</span>';
        else if (state.status === 'waiting') infoText += playerData.isReady ? ' <span class="ready">[已准备]</span>' : ' <span class="not-ready">[未准备]</span>';
        infoEl.innerHTML = infoText;
    }
    if (cardsEl) {
        renderPlayerCards(cardsEl, playerData, isMe, state.status === 'playing' && state.currentPlayerId === myUserId);
    }
    if (state.status === 'playing' && playerData.userId === state.currentPlayerId) {
        container.classList.add('current-turn');
    } else {
        container.classList.remove('current-turn');
    }
}

function renderPlayerCards(container, playerData, isMe, isMyTurn) {
    // ... (renderPlayerCards logic unchanged, but relies on classes for selected/hinted) ...
    container.innerHTML = '';
    const hand = isMe ? (playerData.hand || []) : [];

    let cardsToRender = [];
    if (isMe) {
        if (currentSortMode === 'rank') cardsToRender = [...hand].sort(compareSingleCardsClient);
        else if (currentSortMode === 'suit') cardsToRender = [...hand].sort(compareBySuitThenRank);
        else cardsToRender = [...hand];

        if (cardsToRender.length > 0) {
            cardsToRender.forEach(cardData => {
                const cardElement = renderCard(cardData, false);
                const cardId = `${cardData.rank}${cardData.suit}`;
                const isSelected = selectedCards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);
                const isHinted = currentHint && currentHint.cards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);

                if (isSelected) cardElement.classList.add('selected');
                if (isHinted) cardElement.classList.add('hinted');

                if (currentGameState.status === 'playing' && isMyTurn) {
                    cardElement.onclick = () => toggleCardSelection(cardData, cardElement);
                    cardElement.classList.remove('disabled');
                } else {
                    cardElement.classList.add('disabled');
                }
                container.appendChild(cardElement);
            });
        } else if (playerData.finished) {
            container.innerHTML = '<span>已完成</span>';
        } else {
            container.innerHTML = '<span>- 空 -</span>';
        }
    } else {
        if (playerData.finished) {
             container.innerHTML = '<span>已完成</span>';
        } else if (playerData.handCount > 0) {
            const countSpan = document.createElement('span');
            countSpan.textContent = `${playerData.handCount} 张 `;
            countSpan.style.color = '#666'; countSpan.style.fontSize = '0.9em';
            container.appendChild(countSpan);
            for (let i = 0; i < playerData.handCount; i++) {
                container.appendChild(renderCard(null, true));
            }
        } else {
            container.innerHTML = '<span>- 空 -</span>';
        }
    }
}

function renderCard(cardData, isHidden) { /* ... unchanged ... */
    const cardDiv = document.createElement('div'); cardDiv.classList.add('card');
    if (isHidden || !cardData) { cardDiv.classList.add('hidden'); }
    else {
        cardDiv.classList.add('visible'); cardDiv.classList.add(getSuitClass(cardData.suit));
        const rankSpan = document.createElement('span'); rankSpan.classList.add('rank'); rankSpan.textContent = cardData.rank === 'T' ? '10' : cardData.rank; cardDiv.appendChild(rankSpan);
        const suitSpan = document.createElement('span'); suitSpan.classList.add('suit'); suitSpan.textContent = getSuitSymbol(cardData.suit); cardDiv.appendChild(suitSpan);
        cardDiv.dataset.suit = cardData.suit; cardDiv.dataset.rank = cardData.rank;
    }
    return cardDiv;
 }

function updateRoomControls(state) {
    if (state.status === 'waiting') {
        readyButton.classList.remove('hidden-view');
        readyButton.classList.add('view-inline-block'); // Or 'view-block' if it's a block element
        readyButton.textContent = isReady ? '取消准备' : '准备';
        readyButton.classList.toggle('ready', isReady);
        gameMessage.textContent = '等待所有玩家准备 (4人)...';
        myActionsArea.classList.add('hidden-view'); // Hide game actions
    } else if (state.status === 'playing') {
        readyButton.classList.add('hidden-view'); // Hide ready button
        readyButton.classList.remove('view-inline-block', 'view-block');

        const currentPlayer = state.players.find(p => p.userId === state.currentPlayerId);
        const turnMessage = currentPlayer
            ? (currentPlayer.userId === myUserId ? '轮到你出牌！' : `等待 ${currentPlayer.username} 出牌...`)
            : '游戏进行中...';
         if (!gameMessage.textContent || gameMessage.textContent.startsWith('等待') || gameMessage.textContent === '游戏进行中...') {
             displayMessage(gameMessage, turnMessage);
         }

        if (state.currentPlayerId === myUserId) {
            myActionsArea.classList.remove('hidden-view');
            myActionsArea.classList.add('view-flex'); // Assuming my-actions is flex
            playSelectedCardsButton.disabled = selectedCards.length === 0;
            passTurnButton.disabled = !state.lastHandInfo; // Can't pass if starting round
            hintButton.disabled = false;
            sortHandButton.disabled = false;
        } else {
            myActionsArea.classList.add('hidden-view');
            myActionsArea.classList.remove('view-flex');
        }
    } else if (state.status === 'finished') {
        readyButton.classList.add('hidden-view');
        readyButton.classList.remove('view-inline-block', 'view-block');
        myActionsArea.classList.add('hidden-view');
        myActionsArea.classList.remove('view-flex');
        // gameMessage is handled by overlay
    }
}

// --- Event Handlers (handleRegister, handleLogin, handleLogout, etc.) ---
// (These should generally remain the same, just ensure no direct style manipulation for hiding/showing)
function handleRegister() { /* ... unchanged ... */
    const phone = regPhoneInput.value; const password = regPasswordInput.value;
    if (!phone || !password) { displayMessage(authMessage, '请输入手机号和密码。', true); return; }
    registerButton.disabled = true;
    socket.emit('register', { phoneNumber: phone, password }, (response) => {
        registerButton.disabled = false; displayMessage(authMessage, response.message, !response.success);
        if (response.success) { regPhoneInput.value = ''; regPasswordInput.value = ''; }
    });
 }
function handleLogin() { /* ... unchanged ... */
     const phone = loginPhoneInput.value; const password = loginPasswordInput.value;
     if (!phone || !password) { displayMessage(authMessage, '请输入手机号和密码。', true); return; }
     loginButton.disabled = true;
     socket.emit('login', { phoneNumber: phone, password }, (response) => {
         loginButton.disabled = false; displayMessage(authMessage, response.message, !response.success);
         if (response.success) {
             myUserId = response.userId; myUsername = response.username;
             try { localStorage.setItem('kkUserId', myUserId); localStorage.setItem('kkUsername', myUsername); } catch (e) { console.error('LocalStorage error:', e); }
             if(lobbyUsername) lobbyUsername.textContent = myUsername;
             showView('lobbyView');
             socket.emit('listRooms', (rooms) => renderRoomList(rooms));
         }
     });
 }
function handleLogout() { /* ... unchanged ... */
      console.log('Logging out...');
      try { localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); } catch (e) { console.error('LocalStorage error:', e); }
      myUserId = null; myUsername = null; currentRoomId = null; currentGameState = null; isReady = false; selectedCards = []; currentHint = null;
      socket.disconnect(); socket.connect();
      showView('loginRegisterView');
 }
function handleCreateRoom() { /* ... unchanged ... */
     const roomName = createRoomNameInput.value; const password = createRoomPasswordInput.value;
     if (!roomName) { displayMessage(lobbyMessage, '请输入房间名称。', true); return; }
     createRoomButton.disabled = true;
     socket.emit('createRoom', { roomName, password: password || null }, (response) => {
         createRoomButton.disabled = false; displayMessage(lobbyMessage, response.message, !response.success);
         if (response.success) {
             currentRoomId = response.roomId; showView('roomView'); renderRoomView(response.roomState);
             createRoomNameInput.value = ''; createRoomPasswordInput.value = '';
         }
     });
 }
function joinRoom(roomId, needsPassword) { /* ... unchanged ... */
      let password = null;
      if (needsPassword) { password = prompt(`房间 "${roomId}" 需要密码:` , ''); if (password === null) return; }
      displayMessage(lobbyMessage, `正在加入房间 ${roomId}...`);
      socket.emit('joinRoom', { roomId, password }, (response) => {
          displayMessage(lobbyMessage, response.message, !response.success);
          if (response.success) {
              currentRoomId = response.roomId; showView('roomView'); renderRoomView(response.roomState);
          }
      });
 }
function handleReadyClick() { /* ... unchanged ... */
      if (!currentRoomId) return; const desiredReadyState = !isReady; readyButton.disabled = true;
      socket.emit('playerReady', desiredReadyState, (response) => {
           readyButton.disabled = false;
           if (!response.success) displayMessage(gameMessage, response.message || "无法改变准备状态。", true);
      });
 }
function handleLeaveRoom() { /* ... unchanged ... */
     console.log("Leaving room (reloading page)..."); window.location.reload();
 }
function handleSortHand() { /* ... unchanged ... */
    if (currentSortMode === 'rank') currentSortMode = 'suit'; else currentSortMode = 'rank';
    console.log("Sorting mode:", currentSortMode);
    if (currentGameState) renderRoomView(currentGameState);
    clearHints();
}
function toggleCardSelection(cardData, cardElement) { /* ... unchanged ... */
    if (!cardElement) return; clearHints();
    const cardId = `${cardData.rank}${cardData.suit}`;
    const index = selectedCards.findIndex(c => c.rank === cardData.rank && c.suit === cardData.suit);
    if (index > -1) { selectedCards.splice(index, 1); cardElement.classList.remove('selected'); }
    else { selectedCards.push(cardData); cardElement.classList.add('selected'); }
    if (playSelectedCardsButton) playSelectedCardsButton.disabled = selectedCards.length === 0;
    console.log('Selected cards:', selectedCards.map(c => c.rank + c.suit));
}
function handlePlaySelectedCards() { /* ... unchanged ... */
    if (selectedCards.length === 0) { displayMessage(gameMessage, '请先选择要出的牌。', true); return; }
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) { displayMessage(gameMessage, '现在不是你的回合或状态无效。', true); return; }
    displayMessage(gameMessage, '正在出牌...');
    if(playSelectedCardsButton) playSelectedCardsButton.disabled = true;
    if(passTurnButton) passTurnButton.disabled = true;
    if(hintButton) hintButton.disabled = true;
    socket.emit('playCard', selectedCards, (response) => {
        if(playSelectedCardsButton) playSelectedCardsButton.disabled = false;
        if(passTurnButton) passTurnButton.disabled = false;
        if(hintButton) hintButton.disabled = false;
        if (!response.success) { displayMessage(gameMessage, response.message || '出牌失败。', true); }
        else { displayMessage(gameMessage, ''); selectedCards = []; clearHints(); }
    });
}
function handlePassTurn() { /* ... unchanged ... */
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) { displayMessage(gameMessage, '现在不是你的回合或状态无效。', true); return; }
    if (!currentGameState.lastHandInfo && !currentGameState.isFirstTurn) { displayMessage(gameMessage, '您必须出牌。', true); return; } // Allow pass on first turn if not D4 holder? No, first player must play.
    displayMessage(gameMessage, '正在 Pass...');
    if(playSelectedCardsButton) playSelectedCardsButton.disabled = true;
    if(passTurnButton) passTurnButton.disabled = true;
    if(hintButton) hintButton.disabled = true;
    selectedCards = [];
    socket.emit('passTurn', (response) => {
        if(playSelectedCardsButton) playSelectedCardsButton.disabled = false;
        if(passTurnButton) passTurnButton.disabled = false;
        if(hintButton) hintButton.disabled = false;
        if (!response.success) { displayMessage(gameMessage, response.message || 'Pass 失败。', true); }
        else { displayMessage(gameMessage, ''); clearHints(); }
    });
}
function handleHint() { /* ... unchanged ... */
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) { displayMessage(gameMessage, '现在不是你的回合或状态无效。', true); return; }
    clearHints(false); if(hintButton) hintButton.disabled = true; displayMessage(gameMessage, '正在获取提示...');
    socket.emit('requestHint', currentHintIndex, (response) => {
        if(hintButton) hintButton.disabled = false;
        if (response.success && response.hint && response.hint.cards) {
            displayMessage(gameMessage, '找到提示！'); currentHint = response.hint; currentHintIndex = response.nextHintIndex;
            highlightHintedCards(currentHint.cards);
        } else {
            displayMessage(gameMessage, response.message || '没有可出的牌或提示。', true); currentHint = null; currentHintIndex = 0;
        }
    });
}
function highlightHintedCards(hintedCards) { /* ... unchanged ... */
    if (!hintedCards || hintedCards.length === 0) return;
    const handContainer = myHandArea; const cardElements = handContainer.querySelectorAll('.card:not(.hidden)');
    hintedCards.forEach(hintCard => {
        for(const elem of cardElements) {
            if(elem.dataset.rank === hintCard.rank && elem.dataset.suit === hintCard.suit) {
                elem.classList.add('hinted'); break;
            }
        }
    });
}
function clearHints(resetIndex = true) { /* ... unchanged ... */
    if (resetIndex) { currentHint = null; currentHintIndex = 0; }
    const hintedElements = myHandArea.querySelectorAll('.card.hinted');
    hintedElements.forEach(el => el.classList.remove('hinted'));
}
function showGameOver(scoreResult) { /* ... unchanged ... */
    if (!gameOverOverlay || !scoreResult) return;
    gameOverTitle.textContent = scoreResult.result || "游戏结束!";
    gameOverReason.textContent = scoreResult.reason || "";
    gameOverScores.innerHTML = '';
    if (scoreResult.scoreChanges) {
         const finalScores = scoreResult.finalScores || [];
         const changes = scoreResult.scoreChanges;
         finalScores.forEach(playerScore => {
             const change = changes[playerScore.id] || 0;
             const changeText = change > 0 ? `+${change}` : (change < 0 ? `${change}` : '0');
             const changeClass = change > 0 ? 'score-plus' : (change < 0 ? 'score-minus' : 'score-zero');
             const scoreP = document.createElement('p');
             scoreP.innerHTML = `${playerScore.name} (${playerScore.role}): <span class="${changeClass}">${changeText}</span> (总分: ${playerScore.score})`;
             gameOverScores.appendChild(scoreP);
         });
    } else if (scoreResult.scores) {
         scoreResult.scores.forEach(playerScore => {
            const scoreP = document.createElement('p');
            scoreP.innerHTML = `${playerScore.name} (${playerScore.role}): (总分: ${playerScore.score})`;
            gameOverScores.appendChild(scoreP);
         });
    }
    showView('gameOverOverlay'); // Use showView to display overlay
}
// function hideGameOver() { // No longer needed if showView handles it
// if (gameOverOverlay) gameOverOverlay.classList.add('hidden-view');
// }


// --- Socket Event Listeners --- (mostly unchanged, ensure they call renderRoomView for UI updates)
socket.on('connect', () => { console.log('Connected to server! Socket ID:', socket.id); initClientSession(); });
socket.on('disconnect', (reason) => { console.log('Disconnected from server:', reason); showView('loadingView'); alert('与服务器断开连接: ' + reason + '\n请刷新页面重试。'); myUserId = null; myUsername = null; currentRoomId = null; currentGameState = null; });
socket.on('roomListUpdate', (rooms) => { console.log('Received room list update'); if (currentView === 'lobby') renderRoomList(rooms); });
socket.on('playerReadyUpdate', ({ userId, isReady }) => { if (currentGameState && currentView === 'room') { const player = currentGameState.players.find(p => p.userId === userId); if (player) player.isReady = isReady; renderRoomView(currentGameState); } });
socket.on('playerJoined', (newPlayer) => { if (currentGameState && currentView === 'room') { const existingIndex = currentGameState.players.findIndex(p => p.userId === newPlayer.userId); if (existingIndex === -1) currentGameState.players.push(newPlayer); else currentGameState.players[existingIndex] = { ...currentGameState.players[existingIndex], ...newPlayer, connected: true }; renderRoomView(currentGameState); } });
socket.on('playerLeft', ({ userId, username }) => { if (currentGameState && currentView === 'room') { const player = currentGameState.players.find(p => p.userId === userId); if (player) { player.connected = false; player.isReady = false; } renderRoomView(currentGameState); } });
socket.on('playerReconnected', ({ userId, username }) => { if (currentGameState && currentView === 'room') { const player = currentGameState.players.find(p => p.userId === userId); if (player) player.connected = true; socket.emit('requestGameState', (state) => { if (state) renderRoomView(state); }); } });
socket.on('gameStarted', (initialGameState) => { if (currentView === 'room') { displayMessage(gameMessage, '游戏开始！'); renderRoomView(initialGameState); selectedCards = []; clearHints();} });
socket.on('gameStateUpdate', (newState) => { if (currentView === 'room' && currentRoomId === newState.roomId) { if(newState.currentPlayerId !== myUserId || newState.status !== 'playing') { selectedCards = []; clearHints(); } renderRoomView(newState); } });
socket.on('invalidPlay', ({ message }) => { displayMessage(gameMessage, `操作无效: ${message}`, true); if(currentGameState) renderRoomView(currentGameState); });
socket.on('gameOver', (results) => { if (currentGameState && currentView === 'room') { currentGameState.status = 'finished'; renderRoomView(currentGameState); showGameOver(results); } });
socket.on('gameStartFailed', ({ message }) => { if (currentView === 'room') displayMessage(gameMessage, `游戏开始失败: ${message}`, true); });
socket.on('allPlayersResetReady', () => { if (currentGameState && currentView === 'room' && currentGameState.status === 'waiting') { currentGameState.players.forEach(p => p.isReady = false); renderRoomView(currentGameState); } });

// --- Initial Setup ---
function initClientSession() {
    let storedUserId = null;
    try {
        storedUserId = localStorage.getItem('kkUserId');
        const storedUsername = localStorage.getItem('kkUsername');
        if (storedUserId && storedUsername) { // Ensure username is also there
            console.log(`Found stored user ID: ${storedUserId}. Attempting reauthentication...`);
            socket.emit('reauthenticate', storedUserId, (response) => {
                if (response.success) {
                    myUserId = response.userId; myUsername = response.username;
                    if (lobbyUsername) lobbyUsername.textContent = myUsername;
                    if (response.roomState) {
                        currentRoomId = response.roomState.roomId; showView('roomView'); renderRoomView(response.roomState);
                    } else {
                        showView('lobbyView'); socket.emit('listRooms', (rooms) => renderRoomList(rooms));
                    }
                } else {
                    localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); showView('loginRegisterView');
                }
            });
        } else {
             console.log('No stored user ID/username found.'); showView('loginRegisterView');
        }
    } catch (e) {
        console.error('Error accessing localStorage:', e); showView('loginRegisterView');
    }
}

function setupEventListeners() {
    registerButton?.addEventListener('click', handleRegister);
    loginButton?.addEventListener('click', handleLogin);
    logoutButton?.addEventListener('click', handleLogout);
    createRoomButton?.addEventListener('click', handleCreateRoom);
    readyButton?.addEventListener('click', handleReadyClick);
    leaveRoomButton?.addEventListener('click', handleLeaveRoom);
    sortHandButton?.addEventListener('click', handleSortHand);
    playSelectedCardsButton?.addEventListener('click', handlePlaySelectedCards);
    passTurnButton?.addEventListener('click', handlePassTurn);
    hintButton?.addEventListener('click', handleHint);
    backToLobbyButton?.addEventListener('click', () => {
        // hideGameOver(); // showView will hide it
        showView('lobbyView');
        currentRoomId = null; currentGameState = null;
        socket.emit('listRooms', (rooms) => renderRoomList(rooms));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Setting up...");
    document.documentElement.style.overflow = ''; document.body.style.overflow = ''; // Initial scroll state
    setupEventListeners();
    // showView('loadingView'); // Set initial view (already default in HTML)
    if (socket.connected) initClientSession(); // If already connected (e.g., hot reload)
    else showView('loadingView'); // Show loading if not connected yet

    console.log('Client setup complete.');
});
