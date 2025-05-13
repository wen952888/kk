// public/client.js
const socket = io();

// --- State Variables ---
let currentView = 'loading';
let myUserId = null;
let myUsername = null;
let currentRoomId = null;
let currentGameState = null;
let isReady = false;
let selectedCards = [];
let currentSortMode = 'rank'; // 'rank', 'suit'
let currentHint = null;
let currentHintIndex = 0;

// --- DOM Elements ---
const loadingView = document.getElementById('loadingView');
const loginRegisterView = document.getElementById('loginRegisterView');
const lobbyView = document.getElementById('lobbyView');
const roomView = document.getElementById('roomView');
const views = { loadingView, loginRegisterView, lobbyView, roomView };
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
    for (const key in views) {
        if (views[key]) views[key].style.display = 'none'; // Hide all first
    }
    const targetView = views[viewName]; // Get reference to the target view
    if (targetView) {
        targetView.style.display = (viewName === 'roomView') ? 'flex' : 'block'; // Show target
    } else {
        console.warn(`View element not found: ${viewName}`);
    }
    // Body scroll control
    const scroll = (viewName !== 'roomView');
    document.documentElement.style.overflow = scroll ? '' : 'hidden';
    document.body.style.overflow = scroll ? '' : 'hidden';
    clearMessages();
    if (viewName !== 'roomView') {
        selectedCards = [];
        currentHint = null;
        currentHintIndex = 0;
        hideGameOver();
    }
} // <<< Added missing closing brace if showView was the culprit (double-checking)

function displayMessage(element, message, isError = false) { if (element) { element.textContent = message; element.className = `message ${isError ? 'error' : 'success'}`; } }
function clearMessages() { [authMessage, lobbyMessage, gameMessage].forEach(el => { if (el) el.textContent = ''; }); }
function getSuitSymbol(suit) { switch (suit?.toUpperCase()) { case 'H': return '♥'; case 'D': return '♦'; case 'C': return '♣'; case 'S': return '♠'; default: return '?'; } }
function getSuitClass(suit) { switch (suit?.toUpperCase()) { case 'H': return 'hearts'; case 'D': return 'diamonds'; case 'C': return 'clubs'; case 'S': return 'spades'; default: return ''; } } // <<< Added missing closing brace for default (double-checking)
// Card comparison functions
const RANK_ORDER_CLIENT = ["4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2", "3"];
const RANK_VALUES_CLIENT = {}; RANK_ORDER_CLIENT.forEach((r, i) => RANK_VALUES_CLIENT[r] = i);
const SUIT_ORDER_CLIENT = ["D", "C", "H", "S"];
const SUIT_VALUES_CLIENT = {}; SUIT_ORDER_CLIENT.forEach((s, i) => SUIT_VALUES_CLIENT[s] = i);
function compareSingleCardsClient(cardA, cardB) {
    const rankValueA = RANK_VALUES_CLIENT[cardA.rank]; const rankValueB = RANK_VALUES_CLIENT[cardB.rank];
    if (rankValueA !== rankValueB) return rankValueA - rankValueB;
    return SUIT_VALUES_CLIENT[cardA.suit] - SUIT_VALUES_CLIENT[cardB.suit];
} // <<< Added missing closing brace if compareSingleCardsClient was the culprit (double-checking)
function compareBySuitThenRank(cardA, cardB) {
    const suitValueA = SUIT_VALUES_CLIENT[cardA.suit]; const suitValueB = SUIT_VALUES_CLIENT[cardB.suit];
    if (suitValueA !== suitValueB) return suitValueA - suitValueB;
    return RANK_VALUES_CLIENT[cardA.rank] - RANK_VALUES_CLIENT[cardB.rank];
} // <<< Added missing closing brace if compareBySuitThenRank was the culprit (double-checking)

// --- Rendering Functions ---
function renderRoomList(rooms) {
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
} // <<< Added missing closing brace if renderRoomList was the culprit (double-checking)

function renderRoomView(state) {
    currentGameState = state;
    if (!state || !roomView) return;

    roomNameDisplay.textContent = state.roomName || '房间';
    gameModeDisplay.textContent = state.gameMode === 'double_landlord' ? '(双地主模式)' : '(标准模式)';
    roomStatusDisplay.textContent = `状态: ${state.status}`;
    isReady = false; // Reset ready state, rely on server info

    // Clear areas before rendering
    Object.values(playerAreas).forEach(clearPlayerArea);
    centerPileArea.innerHTML = '';
    lastHandTypeDisplay.textContent = state.lastHandInfo ? `类型: ${state.lastHandInfo.type}` : '-';

    const myPlayer = state.players.find(p => p.userId === myUserId);
    if (!myPlayer) { console.error("Cannot find myself in player list!"); return; }
    const mySlot = myPlayer.slot;

    state.players.forEach(player => {
        const isMe = player.userId === myUserId;
        if (isMe) isReady = player.isReady; // Update local isReady based on server state

        let relativeSlot = (player.slot - mySlot + 4) % 4;
        const targetArea = playerAreas[relativeSlot];

        if (targetArea) {
            renderPlayerArea(targetArea, player, isMe, state);
        } else {
            console.warn(`No player area found for relative slot: ${relativeSlot}`);
        }
    });

    // Render center pile cards
    if (state.centerPile && state.centerPile.length > 0) {
        state.centerPile.forEach(cardData => centerPileArea.appendChild(renderCard(cardData, false)));
    } else {
        centerPileArea.innerHTML = '-';
    }

    updateRoomControls(state);

    if (state.currentPlayerId !== myUserId || state.status !== 'playing') {
        clearHints();
    }
} // <<< Added missing closing brace if renderRoomView was the culprit (double-checking)

function clearPlayerArea(area) {
     if (!area) return;
     area.classList.remove('current-turn');
     const nameEl = area.querySelector('.playerName');
     const roleEl = area.querySelector('.playerRole');
     const infoEl = area.querySelector('.playerInfo');
     const cardsEl = area.querySelector('.playerCards');
     if (nameEl) nameEl.textContent = '空位';
     if (roleEl) roleEl.textContent = '';
     if (infoEl) infoEl.textContent = '';
     if (cardsEl) cardsEl.innerHTML = '';
     const actions = area.querySelector('.my-actions');
     if(actions) actions.remove(); // Remove action buttons if present
} // <<< This is around line 224, ensuring it's closed

function renderPlayerArea(container, playerData, isMe, state) {
    const nameEl = container.querySelector('.playerName');
    const roleEl = container.querySelector('.playerRole');
    const infoEl = container.querySelector('.playerInfo');
    const cardsEl = container.querySelector('.playerCards');

    if (nameEl) nameEl.textContent = playerData.username + (isMe ? ' (你)' : '');
    // Only add role element if it's the bottom area (or if you add it to other templates)
    const header = container.querySelector('.playerHeader'); // Find header div
    if (header && isMe && roleEl) { // Check if role element exists in this container
         roleEl.textContent = `[${playerData.role || '?'}]`;
    } else if (!isMe) {
        // Optionally display opponent role in playerName or infoEl
         if(nameEl) nameEl.textContent += ` [${playerData.role || '?'}]`;
    }


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
} // <<< Added missing closing brace if renderPlayerArea was the culprit (double-checking)

function renderPlayerCards(container, playerData, isMe, isMyTurn) {
    container.innerHTML = '';
    const hand = isMe ? (playerData.hand || []) : []; // Only need own hand data directly

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
                if (isHinted) cardElement.classList.add('hinted'); // Style for hinted cards

                if (currentGameState.status === 'playing' && isMyTurn) {
                    cardElement.onclick = () => toggleCardSelection(cardData, cardElement);
                    cardElement.classList.remove('disabled');
                } else {
                    cardElement.classList.add('disabled');
                }
                container.appendChild(cardElement);
            });
             // Add action buttons below cards if it's my turn
             if (currentGameState.status === 'playing' && isMyTurn && myActionsArea) { // Check if myActionsArea exists
                myActionsArea.style.display = 'flex'; // Make sure buttons are visible
                playSelectedCardsButton.disabled = selectedCards.length === 0; // Enable only if cards selected
                passTurnButton.disabled = !currentGameState.lastHandInfo; // Disable pass if starting round
                hintButton.disabled = false;
                sortHandButton.disabled = false;
             } else if (myActionsArea) {
                 myActionsArea.style.display = 'none'; // Hide actions if not my turn
             }

        } else if (playerData.finished) {
            container.innerHTML = '<span>已完成</span>';
        } else {
            container.innerHTML = '<span>- 空 -</span>';
        }
    } else { // Opponent rendering
        if (playerData.finished) {
             container.innerHTML = '<span>已完成</span>';
        } else if (playerData.handCount > 0) {
            const countSpan = document.createElement('span');
            countSpan.textContent = `${playerData.handCount} 张 `;
            countSpan.style.color = '#666'; // Style card count
            countSpan.style.fontSize = '0.9em';
            container.appendChild(countSpan);
            for (let i = 0; i < playerData.handCount; i++) {
                container.appendChild(renderCard(null, true));
            }
        } else {
            container.innerHTML = '<span>- 空 -</span>';
        }
    }
} // <<< Added missing closing brace if renderPlayerCards was the culprit (double-checking)

function renderCard(cardData, isHidden) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    if (isHidden || !cardData) {
        cardDiv.classList.add('hidden');
    } else {
        cardDiv.classList.add('visible');
        cardDiv.classList.add(getSuitClass(cardData.suit));
        const rankSpan = document.createElement('span'); rankSpan.classList.add('rank'); rankSpan.textContent = cardData.rank === 'T' ? '10' : cardData.rank; cardDiv.appendChild(rankSpan);
        const suitSpan = document.createElement('span'); suitSpan.classList.add('suit'); suitSpan.textContent = getSuitSymbol(cardData.suit); cardDiv.appendChild(suitSpan);
        cardDiv.dataset.suit = cardData.suit; cardDiv.dataset.rank = cardData.rank;
    }
    return cardDiv;
} // <<< Added missing closing brace if renderCard was the culprit (double-checking)

function updateRoomControls(state) {
    if (state.status === 'waiting') {
        readyButton.style.display = 'inline-block';
        readyButton.textContent = isReady ? '取消准备' : '准备';
        readyButton.classList.toggle('ready', isReady);
        gameMessage.textContent = '等待所有玩家准备 (4人)...';
        if(myActionsArea) myActionsArea.style.display = 'none'; // Hide game actions
    } else if (state.status === 'playing') {
        readyButton.style.display = 'none';
        const currentPlayer = state.players.find(p => p.userId === state.currentPlayerId);
        const turnMessage = currentPlayer
            ? (currentPlayer.userId === myUserId ? '轮到你出牌！' : `等待 ${currentPlayer.username} 出牌...`)
            : '游戏进行中...';
         // Only display turn message if game message area is empty (allow other messages like errors)
         if (!gameMessage.textContent || gameMessage.textContent === '游戏进行中...') {
             displayMessage(gameMessage, turnMessage);
         }

         // Show/hide action buttons based on turn
         if(myActionsArea) myActionsArea.style.display = (state.currentPlayerId === myUserId) ? 'flex' : 'none';

    } else if (state.status === 'finished') {
        readyButton.style.display = 'none';
        if(myActionsArea) myActionsArea.style.display = 'none';
        // Game over message is handled by the overlay
        // displayMessage(gameMessage, '游戏结束！');
    }
} // <<< Added missing closing brace if updateRoomControls was the culprit (double-checking)

// --- Event Handlers ---
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
      socket.disconnect(); // Force disconnect
      socket.connect(); // Reconnect to get clean state
      showView('loginRegisterView'); // Show login immediately
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
           // Server broadcast ('playerReadyUpdate') handles UI update
      });
 }
function handleLeaveRoom() { /* ... unchanged ... */
     console.log("Leaving room (reloading page)..."); window.location.reload();
     // Proper implementation:
     // if (currentRoomId) { socket.emit('leaveRoom', ...); } showView('lobbyView'); ...
 }
function handleSortHand() {
    if (currentSortMode === 'rank') currentSortMode = 'suit';
    else currentSortMode = 'rank';
    console.log("Sorting mode:", currentSortMode);
    // Re-render the current game state to apply the new sort order
    if (currentGameState) renderRoomView(currentGameState);
    clearHints(); // Clear hints when sorting
} // <<< Added missing closing brace if handleSortHand was the culprit (double-checking)

function toggleCardSelection(cardData, cardElement) {
    if (!cardElement) return; // Safety check
    clearHints(); // Clear hints when selection changes
    const cardId = `${cardData.rank}${cardData.suit}`;
    const index = selectedCards.findIndex(c => c.rank === cardData.rank && c.suit === cardData.suit);
    if (index > -1) {
        selectedCards.splice(index, 1);
        cardElement.classList.remove('selected');
    } else {
        selectedCards.push(cardData);
        cardElement.classList.add('selected');
    }
    playSelectedCardsButton.disabled = selectedCards.length === 0; // Update button state
    console.log('Selected cards:', selectedCards.map(c => c.rank + c.suit));
} // <<< Added missing closing brace if toggleCardSelection was the culprit (double-checking)

function handlePlaySelectedCards() {
    if (selectedCards.length === 0) { displayMessage(gameMessage, '请先选择要出的牌。', true); return; }
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) { displayMessage(gameMessage, '现在不是你的回合或状态无效。', true); return; }

    displayMessage(gameMessage, '正在出牌...');
    playSelectedCardsButton.disabled = true;
    passTurnButton.disabled = true;
    hintButton.disabled = true;

    socket.emit('playCard', selectedCards, (response) => {
        playSelectedCardsButton.disabled = false; // Re-enable on response
        passTurnButton.disabled = false;
        hintButton.disabled = false;
        if (!response.success) {
            displayMessage(gameMessage, response.message || '出牌失败。', true);
            // Keep cards selected on failure
        } else {
            displayMessage(gameMessage, ''); // Clear message, wait for update
            selectedCards = []; // Clear selection on successful request
            clearHints();
        }
    });
} // <<< Added missing closing brace if handlePlaySelectedCards was the culprit (double-checking)

function handlePassTurn() {
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) { displayMessage(gameMessage, '现在不是你的回合或状态无效。', true); return; }
    // Check if passing is allowed (cannot pass if starting round)
    if (!currentGameState.lastHandInfo) {
        displayMessage(gameMessage, '您必须出牌。', true);
        return;
    }

    displayMessage(gameMessage, '正在 Pass...');
    playSelectedCardsButton.disabled = true;
    passTurnButton.disabled = true;
    hintButton.disabled = true;
    selectedCards = []; // Clear selection when passing

    socket.emit('passTurn', (response) => {
        playSelectedCardsButton.disabled = false; // Re-enable on response
        passTurnButton.disabled = false;
        hintButton.disabled = false;
        if (!response.success) {
            displayMessage(gameMessage, response.message || 'Pass 失败。', true);
        } else {
            displayMessage(gameMessage, ''); // Clear message, wait for update
            clearHints();
        }
    });
} // <<< Added missing closing brace if handlePassTurn was the culprit (double-checking)

function handleHint() {
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) { displayMessage(gameMessage, '现在不是你的回合或状态无效。', true); return; }

    clearHints(false); // Clear previous visual hints, keep index if cycling
    hintButton.disabled = true;
    displayMessage(gameMessage, '正在获取提示...');

    socket.emit('requestHint', currentHintIndex, (response) => {
        hintButton.disabled = false;
        if (response.success && response.hint && response.hint.cards) {
            displayMessage(gameMessage, '找到提示！');
            currentHint = response.hint;
            currentHintIndex = response.nextHintIndex; // Store index for next click
            // Highlight hinted cards
            highlightHintedCards(currentHint.cards);
        } else {
            displayMessage(gameMessage, response.message || '没有可出的牌或提示。', true);
            currentHint = null; // Reset hint
            currentHintIndex = 0;
        }
    });
} // <<< Added missing closing brace if handleHint was the culprit (double-checking)

function highlightHintedCards(hintedCards) {
    if (!hintedCards || hintedCards.length === 0) return;
    const handContainer = myHandArea;
    const cardElements = handContainer.querySelectorAll('.card:not(.hidden)');
    hintedCards.forEach(hintCard => {
        const cardId = `${hintCard.rank}${hintCard.suit}`;
        for(const elem of cardElements) {
            if(elem.dataset.rank === hintCard.rank && elem.dataset.suit === hintCard.suit) {
                elem.classList.add('hinted');
                break; // Found the card for this hint
            }
        }
    });
} // <<< Added missing closing brace if highlightHintedCards was the culprit (double-checking)

function clearHints(resetIndex = true) {
    if (resetIndex) {
        currentHint = null;
        currentHintIndex = 0;
    }
    const hintedElements = myHandArea.querySelectorAll('.card.hinted');
    hintedElements.forEach(el => el.classList.remove('hinted'));
} // <<< Added missing closing brace if clearHints was the culprit (double-checking)

function showGameOver(scoreResult) {
    if (!gameOverOverlay || !scoreResult) return;
    gameOverTitle.textContent = scoreResult.result || "游戏结束!";
    gameOverReason.textContent = scoreResult.reason || ""; // Display reason if provided

    // Display scores
    gameOverScores.innerHTML = ''; // Clear previous scores
    if (scoreResult.scoreChanges) {
         const finalScores = scoreResult.finalScores || []; // Use final scores if available
         const changes = scoreResult.scoreChanges;
         finalScores.forEach(playerScore => {
             const change = changes[playerScore.id] || 0;
             const changeText = change > 0 ? `+${change}` : (change < 0 ? `${change}` : '0');
             const changeClass = change > 0 ? 'score-plus' : (change < 0 ? 'score-minus' : 'score-zero');
             const scoreP = document.createElement('p');
             scoreP.innerHTML = `${playerScore.name} (${playerScore.role}): <span class="${changeClass}">${changeText}</span> (总分: ${playerScore.score})`;
             gameOverScores.appendChild(scoreP);
         });
    } else if (scoreResult.scores) { // Fallback if only final scores sent
         scoreResult.scores.forEach(playerScore => {
            const scoreP = document.createElement('p');
            scoreP.innerHTML = `${playerScore.name} (${playerScore.role}): (总分: ${playerScore.score})`;
            gameOverScores.appendChild(scoreP);
         });
    }


    gameOverOverlay.style.display = 'flex'; // Show overlay
} // <<< Added missing closing brace if showGameOver was the culprit (double-checking)

function hideGameOver() {
    if (gameOverOverlay) gameOverOverlay.style.display = 'none';
} // <<< Added missing closing brace if hideGameOver was the culprit (double-checking)


// --- Socket Event Listeners ---
socket.on('connect', () => {
    console.log('Connected to server! Socket ID:', socket.id);
    // Attempt reauthentication if possible
    initClientSession(); // Renamed initial logic
});

socket.on('disconnect', (reason) => { /* ... unchanged ... */
     console.log('Disconnected from server:', reason);
     showView('loadingView');
     alert('与服务器断开连接: ' + reason + '\n请刷新页面重试。');
     myUserId = null; myUsername = null; currentRoomId = null; currentGameState = null;
 });

socket.on('roomListUpdate', (rooms) => { /* ... unchanged ... */
     console.log('Received room list update'); if (currentView === 'lobby') renderRoomList(rooms);
 });

socket.on('playerReadyUpdate', ({ userId, isReady }) => { /* ... unchanged ... */
      console.log(`Player ${userId} ready status: ${isReady}`);
      if (currentGameState && currentView === 'room') {
          const player = currentGameState.players.find(p => p.userId === userId);
          if (player) player.isReady = isReady;
          renderRoomView(currentGameState); // Re-render to update UI
      }
 });

socket.on('playerJoined', (newPlayer) => { /* ... unchanged ... */
       console.log('Player joined:', newPlayer.username);
       if (currentGameState && currentView === 'room') {
           const existingIndex = currentGameState.players.findIndex(p => p.userId === newPlayer.userId);
           if (existingIndex === -1) currentGameState.players.push(newPlayer);
           else currentGameState.players[existingIndex] = { ...currentGameState.players[existingIndex], ...newPlayer, connected: true }; // Update existing
           renderRoomView(currentGameState);
       }
 });

socket.on('playerLeft', ({ userId, username }) => { /* ... unchanged ... */
       console.log(`Player left/disconnected: ${username}`);
       if (currentGameState && currentView === 'room') {
           const player = currentGameState.players.find(p => p.userId === userId);
           if (player) { player.connected = false; player.isReady = false; }
           renderRoomView(currentGameState);
       }
 });

socket.on('playerReconnected', ({ userId, username }) => { /* ... unchanged ... */
       console.log(`Player reconnected: ${username}`);
        if (currentGameState && currentView === 'room') {
           const player = currentGameState.players.find(p => p.userId === userId);
           if (player) player.connected = true;
           // Request full state to ensure sync after reconnecting
           socket.emit('requestGameState', (state) => { if (state) renderRoomView(state); });
       }
 });

socket.on('gameStarted', (initialGameState) => { /* ... unchanged ... */
      console.log('Game started!');
      if (currentView === 'room') { displayMessage(gameMessage, '游戏开始！'); renderRoomView(initialGameState); selectedCards = []; clearHints();}
 });

socket.on('gameStateUpdate', (newState) => { /* ... unchanged ... */
      console.log('Received game state update.');
      if (currentView === 'room' && currentRoomId === newState.roomId) {
          // Clear selection only if turn changed away from me, or game ended
           if(newState.currentPlayerId !== myUserId || newState.status !== 'playing') {
               selectedCards = [];
               clearHints(); // Clear hints as well
           }
          renderRoomView(newState);
      }
 });

socket.on('invalidPlay', ({ message }) => { /* ... unchanged ... */
      console.log('Invalid play:', message); displayMessage(gameMessage, `操作无效: ${message}`, true);
      if(currentGameState) renderRoomView(currentGameState); // Re-render to show correct state
 });

socket.on('gameOver', (results) => { /* ... unchanged ... */
      console.log('Game over received:', results);
       if (currentGameState && currentView === 'room') {
           currentGameState.status = 'finished'; // Ensure local state reflects finished
           renderRoomView(currentGameState); // Render final state before showing overlay
           showGameOver(results); // Show the overlay with results
       }
 });

socket.on('gameStartFailed', ({ message }) => { /* ... unchanged ... */
       console.error('Game start failed:', message); if (currentView === 'room') displayMessage(gameMessage, `游戏开始失败: ${message}`, true);
 });

socket.on('allPlayersResetReady', () => { /* ... unchanged ... */
       console.log("Server requested reset of ready states.");
        if (currentGameState && currentView === 'room' && currentGameState.status === 'waiting') {
           currentGameState.players.forEach(p => p.isReady = false);
           renderRoomView(currentGameState);
       }
 });


// --- Initial Setup ---
function initClientSession() { // Renamed from initClient for clarity
    let storedUserId = null;
    try {
        storedUserId = localStorage.getItem('kkUserId');
        const storedUsername = localStorage.getItem('kkUsername');
        if (storedUserId && storedUsername) {
            console.log(`Found stored user ID: ${storedUserId}. Attempting reauthentication...`);
            socket.emit('reauthenticate', storedUserId, (response) => {
                if (response.success) {
                    console.log('Reauthentication successful.');
                    myUserId = response.userId; myUsername = response.username;
                    if (lobbyUsername) lobbyUsername.textContent = myUsername;
                    if (response.roomState) {
                        console.log('Successfully rejoined room:', response.roomState.roomId);
                        currentRoomId = response.roomState.roomId; showView('roomView'); renderRoomView(response.roomState);
                    } else {
                        console.log('Reauthenticated, but not in a rejoinable room.'); showView('lobbyView');
                        socket.emit('listRooms', (rooms) => renderRoomList(rooms));
                    }
                } else {
                    console.log('Reauthentication failed:', response.message);
                    localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); showView('loginRegisterView');
                }
            });
        } else {
             console.log('No stored user ID found.'); showView('loginRegisterView');
        }
    } catch (e) {
        console.error('Error accessing localStorage:', e); showView('loginRegisterView');
    }
} // <<< Added missing closing brace if initClientSession was the culprit (double-checking)

function setupEventListeners() {
    registerButton?.addEventListener('click', handleRegister);
    loginButton?.addEventListener('click', handleLogin);
    logoutButton?.addEventListener('click', handleLogout); // Listener for logout
    createRoomButton?.addEventListener('click', handleCreateRoom);
    readyButton?.addEventListener('click', handleReadyClick);
    leaveRoomButton?.addEventListener('click', handleLeaveRoom);
    sortHandButton?.addEventListener('click', handleSortHand); // Listener for sort
    playSelectedCardsButton?.addEventListener('click', handlePlaySelectedCards); // Listener for play
    passTurnButton?.addEventListener('click', handlePassTurn); // Listener for pass
    hintButton?.addEventListener('click', handleHint); // Listener for hint
    backToLobbyButton?.addEventListener('click', () => { // Listener for back to lobby from game over
        hideGameOver();
        showView('lobbyView');
        currentRoomId = null; // Clear room context
        currentGameState = null;
        socket.emit('listRooms', (rooms) => renderRoomList(rooms)); // Refresh lobby list
    });
} // <<< Added missing closing brace if setupEventListeners was the culprit (double-checking)

// Run init when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Setting up...");
    // Ensure body scroll is default initially
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    setupEventListeners(); // Setup listeners first
    // initClientSession will be called on 'connect' event
    if (socket.connected) { // If already connected (e.g. hot reload)
         initClientSession();
    }
    console.log('Client setup complete.');
}); // <<< Added missing closing brace if DOMContentLoaded was the culprit (double-checking)
