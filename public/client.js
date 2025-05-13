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
const logoutButton = document.getElementById('logoutButton'); // Lobby logout
const lobbyUsername = document.getElementById('lobbyUsername');
const createRoomNameInput = document.getElementById('createRoomName');
const createRoomPasswordInput = document.getElementById('createRoomPassword');
const createRoomButton = document.getElementById('createRoomButton');
const roomList = document.getElementById('roomList');
const lobbyMessage = document.getElementById('lobbyMessage');
const centerPileArea = document.getElementById('centerPileArea');
const lastHandTypeDisplay = document.getElementById('lastHandTypeDisplay');
const myHandArea = document.getElementById('myHand');
// Action buttons (ensure these IDs match your HTML in .my-actions-container)
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


function showView(viewName) {
    console.log(`Switching view from ${currentView} to: ${viewName}`);
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
    } else { console.warn(`View element not found: ${viewName}`); }
    const allowScroll = (viewName === 'loginRegisterView' || viewName === 'lobbyView');
    document.documentElement.style.overflow = allowScroll ? '' : 'hidden';
    document.body.style.overflow = allowScroll ? '' : 'hidden';
    clearMessages();
    if (viewName !== 'roomView' && viewName !== 'gameOverOverlay') {
        selectedCards = []; currentHint = null; currentHintCycleIndex = 0;
        if (currentView !== 'gameOverOverlay') currentGameState = null;
    }
}
function displayMessage(element, message, isError = false, isSuccess = false) {
    if (element) {
        element.textContent = message;
        element.classList.remove('error', 'success');
        if (isError) element.classList.add('error');
        else if (isSuccess) element.classList.add('success');
        else if (element.id !== 'gameStatusDisplay') element.className = 'message'; // Keep gameStatusDisplay clean
    }
}
function clearMessages() {
    [authMessage, lobbyMessage].forEach(el => {
        if (el) {
            el.textContent = ''; el.classList.remove('error', 'success'); el.className = 'message';
        }
    });
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (gameStatusDisp && !gameStatusDisp.classList.contains('error') && !gameStatusDisp.classList.contains('success') && currentView !== 'roomView' && currentView !== 'gameOverOverlay') {
        // gameStatusDisp.textContent = ''; // Let renderRoomView update it
    }
}
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

function renderRoomList(rooms) {
    if (!roomList) return; roomList.innerHTML = '';
    if (!rooms || rooms.length === 0) { roomList.innerHTML = '<p>当前没有房间。</p>'; return; }
    rooms.forEach(room => {
        const item = document.createElement('div'); item.classList.add('room-item');
        const nameSpan = document.createElement('span'); nameSpan.textContent = `${room.roomName} (${room.playerCount}/${room.maxPlayers})`; item.appendChild(nameSpan);
        const statusSpan = document.createElement('span'); statusSpan.textContent = `状态: ${room.status}`; statusSpan.classList.add(`status-${room.status}`); item.appendChild(statusSpan);
        if (room.hasPassword) {
            const passwordSpan = document.createElement('span'); passwordSpan.textContent = '🔒'; item.appendChild(passwordSpan);
        }
        const joinButton = document.createElement('button'); joinButton.textContent = '加入';
        joinButton.disabled = room.status !== 'waiting' || room.playerCount >= room.maxPlayers;
        joinButton.onclick = () => joinRoom(room.roomId, room.hasPassword); item.appendChild(joinButton);
        roomList.appendChild(item);
    });
 }

function renderRoomView(state) {
    if (!state || !roomView || !myUserId) {
        console.error("RenderRoomView called with invalid state or no myUserId", state, myUserId);
        if (!myUserId && currentView === 'roomView') { handleLogout(); alert("用户身份丢失，请重新登录。"); }
        return;
    }
    // currentGameState = state; // This is ALREADY DONE in gameStateUpdate handler, before calling renderRoomView

    const gameInfoBar = document.getElementById('gameInfoBar');
    if (gameInfoBar) {
        const roomNameIdEl = gameInfoBar.querySelector('.room-name-id');
        if (roomNameIdEl) {
            roomNameIdEl.innerHTML = `
                <span class="room-name">${state.roomName || '房间'}</span>
                <span class="room-id">ID: ${state.roomId || 'N/A'}</span>
            `;
        }
    }

    const gameStatusDisplay = document.getElementById('gameStatusDisplay');
    if (gameStatusDisplay) {
        if (state.status === 'waiting') {
            const numPlayers = state.players.length;
            const maxPlayers = 4;
            displayMessage(gameStatusDisplay, `等待 ${numPlayers}/${maxPlayers} 位玩家准备...`);
        } else if (state.status === 'playing') {
            const currentPlayer = state.players.find(p => p.userId === state.currentPlayerId);
            const turnMessage = currentPlayer ? (currentPlayer.userId === myUserId ? '轮到你出牌！' : `等待 ${currentPlayer.username} 出牌...`) : '游戏进行中...';
            // Only update display if the message is different and it's not an error/success
            if (gameStatusDisplay.textContent !== turnMessage && !gameStatusDisplay.classList.contains('error') && !gameStatusDisplay.classList.contains('success')) {
                 displayMessage(gameStatusDisplay, turnMessage);
            }
        } else if (state.status === 'finished') {
            displayMessage(gameStatusDisplay, '游戏已结束');
        } else {
            displayMessage(gameStatusDisplay, `状态: ${state.status}`);
        }
    }

    Object.values(playerAreas).forEach(clearPlayerAreaDOM);
    const myPlayer = state.players.find(p => p.userId === myUserId);
    if (!myPlayer) { console.error("My player data not found in game state!", state.players); handleGameLeave(); return; }
    isReadyForGame = myPlayer.isReady;
    const mySlot = myPlayer.slot;
    state.players.forEach(player => {
        const isMe = player.userId === myUserId;
        let relativeSlot = (player.slot - mySlot + state.players.length) % state.players.length;
        const targetArea = playerAreas[relativeSlot];
        if (targetArea) renderPlayerArea(targetArea, player, isMe, state, player.slot);
        else console.warn(`No target area for relative slot ${relativeSlot} (Player slot ${player.slot})`);
    });
    centerPileArea.innerHTML = '';
    if (state.centerPile && state.centerPile.length > 0) {
        state.centerPile.forEach(cardData => centerPileArea.appendChild(renderCard(cardData, false, true)));
    } else {
        const placeholder = document.createElement('span'); placeholder.textContent = '- 等待出牌 -'; placeholder.style.color = '#aaa';
        centerPileArea.appendChild(placeholder);
    }
    lastHandTypeDisplay.textContent = state.lastHandInfo ? `类型: ${state.lastHandInfo.type}` : '新回合';
    updateRoomControls(state); // This is crucial for button states
    if (state.currentPlayerId !== myUserId || state.status !== 'playing') clearHintsAndSelection(false);
}
function clearPlayerAreaDOM(area) {
     if (!area) return;
     const avatarEl = area.querySelector('.player-avatar');
     const nameEl = area.querySelector('.playerName');
     const roleEl = area.querySelector('.playerRole');
     const infoEl = area.querySelector('.playerInfo');
     const cardsEl = area.querySelector('.playerCards');
     const handCountEl = area.querySelector('.hand-count-display');
     if (avatarEl) {
        avatarEl.innerHTML = '';
        avatarEl.style.backgroundImage = '';
     }
     if (nameEl) nameEl.textContent = '空位';
     if (roleEl) roleEl.textContent = '';
     if (infoEl) infoEl.innerHTML = '';
     if (cardsEl) cardsEl.innerHTML = '';
     if (handCountEl) handCountEl.remove();
     if (area.id === 'playerAreaBottom') {
        const actionsContainer = area.querySelector('.my-actions-container');
        if(actionsContainer) { actionsContainer.classList.add('hidden-view'); }
     }
}
function renderPlayerArea(container, playerData, isMe, state, absoluteSlot) {
    const avatarEl = container.querySelector('.player-avatar');
    const nameEl = container.querySelector('.playerName');
    const roleEl = container.querySelector('.playerRole');
    const infoEl = container.querySelector('.playerInfo');
    const cardsEl = container.querySelector('.playerCards');

    if (avatarEl) {
        avatarEl.innerHTML = '';
        avatarEl.style.backgroundImage = `url('${AVATAR_PATHS[absoluteSlot % AVATAR_PATHS.length]}')`;
        if (state.status === 'playing' && playerData.userId === state.currentPlayerId) {
            const alarmImg = document.createElement('img');
            alarmImg.src = ALARM_ICON_SRC;
            alarmImg.alt = '出牌提示';
            alarmImg.classList.add('alarm-icon');
            avatarEl.appendChild(alarmImg);
            avatarEl.style.backgroundImage = 'none';
        }
    }

    if (nameEl) nameEl.textContent = playerData.username + (isMe ? ' (你)' : '');
    if (roleEl) roleEl.textContent = playerData.role ? `[${playerData.role}]` : '[?]';
    if (infoEl) {
        let infoText = `总分: ${playerData.score || 0}`;
        if (playerData.finished) infoText += ' <span class="finished">[已完成]</span>';
        else if (!playerData.connected && state.status !== 'waiting') infoText += ' <span class="disconnected">[已断线]</span>';
        else if (state.status === 'waiting') infoText += playerData.isReady ? ' <span class="ready">[已准备]</span>' : ' <span class="not-ready">[未准备]</span>';
        infoEl.innerHTML = infoText;
    }
    if (cardsEl) renderPlayerCards(cardsEl, playerData, isMe, state.status === 'playing' && state.currentPlayerId === myUserId);
}

function fanCards(cardContainer, cardElements, areaId) {
    const numCards = cardElements.length;
    if (numCards === 0) return;
    const cardWidth = 60;
    if (areaId === 'playerAreaBottom') {
        cardElements.forEach((card, i) => {
            card.style.zIndex = i;
        });
    } else {
        let maxAngle = 25;
        let angleStep = numCards > 1 ? maxAngle / (numCards - 1) : 0;
        angleStep = Math.min(angleStep, 4);
        let initialRotation = -((numCards - 1) * angleStep) / 2;
        let offsetMultiplier = 1.8;
        cardElements.forEach((card, i) => {
            const rotation = initialRotation + i * angleStep;
            let tx = "0px", ty = "0px";
            if (areaId === 'playerAreaTop') {
                card.style.left = `calc(50% - ${cardWidth / 2}px)`;
                ty = `${i * offsetMultiplier}px`;
                card.style.transform = `translateY(${ty}) rotate(${rotation}deg)`;
                card.style.zIndex = numCards - i;
            } else if (areaId === 'playerAreaLeft') {
                tx = `${i * offsetMultiplier}px`;
                card.style.transform = `translateX(${tx}) rotate(${rotation}deg) translateY(-50%)`;
                card.style.zIndex = numCards - i;
            } else if (areaId === 'playerAreaRight') {
                tx = `${-i * offsetMultiplier}px`;
                card.style.transform = `translateX(${tx}) rotate(${rotation}deg) translateY(-50%)`;
                card.style.zIndex = i;
            }
        });
    }
}
function renderPlayerCards(container, playerData, isMe, isMyTurnAndPlaying) {
    container.innerHTML = '';
    const cardElements = [];
    if (isMe) {
        let sortedHand = playerData.hand ? [...playerData.hand] : [];
        if (sortedHand.length === 0 && !playerData.finished) {
             container.innerHTML = '<span style="color:#ccc; font-style:italic;">- 无手牌 -</span>';
        } else if (playerData.finished) {
            container.innerHTML = '<span style="color:gray; font-style:italic;">已出完</span>';
        } else {
            if (currentSortMode === 'rank') sortedHand.sort(compareSingleCardsClient);
            else if (currentSortMode === 'suit') sortedHand.sort(compareBySuitThenRank);
            sortedHand.forEach(cardData => {
                const cardElement = renderCard(cardData, false);
                const isSelected = selectedCards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);
                const isHinted = currentHint && currentHint.cards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);
                if (isSelected) cardElement.classList.add('selected');
                if (isHinted) cardElement.classList.add('hinted');
                if (isMyTurnAndPlaying) {
                    cardElement.onclick = () => toggleCardSelection(cardData, cardElement);
                    cardElement.classList.remove('disabled');
                } else {
                    cardElement.classList.add('disabled');
                }
                container.appendChild(cardElement);
                cardElements.push(cardElement);
            });
        }
    } else {
        if (playerData.finished) {
            container.innerHTML = '<span style="color:gray; font-style:italic;">已出完</span>';
        } else if (playerData.handCount > 0) {
            for (let i = 0; i < playerData.handCount; i++) {
                const cardElement = renderCard(null, true);
                container.appendChild(cardElement);
                cardElements.push(cardElement);
            }
            let handCountEl = container.closest('.playerArea')?.querySelector('.hand-count-display');
            if (!handCountEl) {
                handCountEl = document.createElement('div');
                handCountEl.classList.add('hand-count-display');
                container.closest('.playerArea')?.appendChild(handCountEl);
            }
            handCountEl.textContent = `${playerData.handCount} 张`;
        } else {
            container.innerHTML = '<span style="color:#ccc; font-style:italic;">- 无手牌 -</span>';
            let handCountEl = container.closest('.playerArea')?.querySelector('.hand-count-display');
            if (handCountEl) handCountEl.remove();
        }
    }
    if (cardElements.length > 0) {
        requestAnimationFrame(() => {
             fanCards(container, cardElements, container.closest('.playerArea')?.id);
        });
    }
}
function renderCard(cardData, isHidden, isCenterPileCard = false) {
    const cardDiv = document.createElement('div'); cardDiv.classList.add('card');
    if (isCenterPileCard) {
        cardDiv.style.position = 'relative';
        cardDiv.style.margin = '3px';
    } else if (myHandArea && myHandArea.contains(cardDiv.parentNode)) {
        // This check is tricky because cardDiv.parentNode is null when cardDiv is created
        // The CSS for #playerAreaBottom .playerCards .card should handle self-cards' position
    }
    if (isHidden || !cardData) {
        cardDiv.classList.add('hidden');
    } else {
        cardDiv.classList.add('visible'); cardDiv.classList.add(getSuitClass(cardData.suit));
        const rankSpan = document.createElement('span'); rankSpan.classList.add('rank'); rankSpan.textContent = cardData.rank === 'T' ? '10' : cardData.rank; cardDiv.appendChild(rankSpan);
        const suitSpan = document.createElement('span'); suitSpan.classList.add('suit'); suitSpan.textContent = getSuitSymbol(cardData.suit); cardDiv.appendChild(suitSpan);
        cardDiv.dataset.suit = cardData.suit; cardDiv.dataset.rank = cardData.rank;
    }
    return cardDiv;
 }
function updateRoomControls(state) {
    if (!state || !myUserId) return;
    const myPlayerInState = state.players.find(p => p.userId === myUserId);
    if (!myPlayerInState) return;

    const readyButtonInstance = document.getElementById('readyButton');
    if (readyButtonInstance) {
        if (state.status === 'waiting') {
            readyButtonInstance.classList.remove('hidden-view');
            readyButtonInstance.classList.add('view-inline-block');
            readyButtonInstance.textContent = myPlayerInState.isReady ? '取消' : '准备';
            readyButtonInstance.classList.toggle('ready', myPlayerInState.isReady);
            readyButtonInstance.disabled = false;
        } else {
            readyButtonInstance.classList.add('hidden-view');
            readyButtonInstance.classList.remove('view-inline-block');
        }
    }

    const actionsContainer = document.querySelector('#playerAreaBottom .my-actions-container');
    if (actionsContainer) {
        if (state.status === 'playing' && state.currentPlayerId === myUserId && !myPlayerInState.finished) {
            actionsContainer.classList.remove('hidden-view');
            if(playSelectedCardsButton) playSelectedCardsButton.disabled = selectedCards.length === 0;
            if(passTurnButton) {
                let disablePass = (!state.lastHandInfo && !state.isFirstTurn);
                if (state.isFirstTurn && !state.lastHandInfo) {
                     const iAmD4Holder = myPlayerInState.hand && myPlayerInState.hand.some(c => c.rank === '4' && c.suit === 'D');
                     if (iAmD4Holder) disablePass = true;
                }
                passTurnButton.disabled = disablePass;
            }
            if(hintButton) hintButton.disabled = false;
            if(sortHandButton) sortHandButton.disabled = false;
        } else {
            actionsContainer.classList.add('hidden-view');
        }
    }
}

function handleRegister() {
    const phone = regPhoneInput.value.trim(); const password = regPasswordInput.value;
    if (!phone || !password) { displayMessage(authMessage, '请输入手机号和密码。', true); return; }
    if (password.length < 4) { displayMessage(authMessage, '密码至少需要4位。', true); return; }
    registerButton.disabled = true;
    socket.emit('register', { phoneNumber: phone, password }, (response) => {
        registerButton.disabled = false;
        displayMessage(authMessage, response.message, !response.success, response.success);
        if (response.success) { regPhoneInput.value = ''; regPasswordInput.value = ''; }
    });
 }
function handleLogin() {
     const phone = loginPhoneInput.value.trim(); const password = loginPasswordInput.value;
     if (!phone || !password) { displayMessage(authMessage, '请输入手机号和密码。', true); return; }
     loginButton.disabled = true;
     socket.emit('login', { phoneNumber: phone, password }, (response) => {
         loginButton.disabled = false;
         displayMessage(authMessage, response.message, !response.success, response.success);
         if (response.success) {
             myUserId = response.userId; myUsername = response.username;
             try { localStorage.setItem('kkUserId', myUserId); localStorage.setItem('kkUsername', myUsername); }
             catch (e) { console.warn('LocalStorage error while saving user session:', e); }
             if(lobbyUsername) lobbyUsername.textContent = myUsername;
             showView('lobbyView');
         }
     });
 }
function handleLogout() {
      console.log('Logging out from lobby...');
      try { localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); }
      catch (e) { console.warn('LocalStorage error while removing user session:', e); }
      myUserId = null; myUsername = null; currentRoomId = null; currentGameState = null; isReadyForGame = false; selectedCards = []; currentHint = null; currentHintCycleIndex = 0;
      if (socket.connected) socket.disconnect();
      socket.connect();
      showView('loginRegisterView');
 }
function handleGameLeave() {
    if (!currentRoomId) {
        console.log("Not in a room to leave.");
        handleReturnToLobby();
        return;
    }
    console.log(`Attempting to leave room: ${currentRoomId} from game view.`);
    const actualLeaveButton = document.getElementById('leaveRoomButton');
    if (actualLeaveButton) actualLeaveButton.disabled = true;
    socket.emit('leaveRoom', (response) => {
        if (actualLeaveButton) actualLeaveButton.disabled = false;
        if (response.success) {
            handleReturnToLobby();
        } else {
            const gameStatusDisp = document.getElementById('gameStatusDisplay');
            displayMessage(gameStatusDisp || alert, response.message || '离开房间失败。', true);
        }
    });
}
function handleCreateRoom() {
     const roomName = createRoomNameInput.value.trim(); const password = createRoomPasswordInput.value;
     if (!roomName) { displayMessage(lobbyMessage, '请输入房间名称。', true); return; }
     createRoomButton.disabled = true;
     socket.emit('createRoom', { roomName, password: password || null }, (response) => {
         createRoomButton.disabled = false;
         displayMessage(lobbyMessage, response.message, !response.success, response.success);
         if (response.success) {
             currentRoomId = response.roomId;
             showView('roomView');
             renderRoomView(response.roomState);
             createRoomNameInput.value = ''; createRoomPasswordInput.value = '';
         }
     });
 }
function joinRoom(roomId, needsPassword) {
      let passwordToTry = null;
      if (needsPassword) {
          passwordToTry = prompt(`房间 "${roomId}" 受密码保护，请输入密码:`, '');
          if (passwordToTry === null) return;
      }
      displayMessage(lobbyMessage, `正在加入房间 ${roomId}...`, false);
      socket.emit('joinRoom', { roomId, password: passwordToTry }, (response) => {
          displayMessage(lobbyMessage, response.message, !response.success, response.success);
          if (response.success) {
              currentRoomId = response.roomId;
              showView('roomView');
              renderRoomView(response.roomState);
          }
      });
 }
function handleReadyClick() {
      if (!currentRoomId || !currentGameState) return;
      const actualReadyButton = document.getElementById('readyButton');
      if (!actualReadyButton) return;
      const desiredReadyState = !isReadyForGame;
      actualReadyButton.disabled = true;
      socket.emit('playerReady', desiredReadyState, (response) => {
           actualReadyButton.disabled = false;
           if (!response.success) {
               const gameStatusDisp = document.getElementById('gameStatusDisplay');
               displayMessage(gameStatusDisp, response.message || "无法改变准备状态。", true);
           }
      });
 }
function handleSortHand() {
    if (currentSortMode === 'rank') currentSortMode = 'suit';
    else currentSortMode = 'rank';
    console.log("Sorting mode changed to:", currentSortMode);
    if (currentGameState && currentView === 'roomView') {
        renderRoomView(currentGameState);
    }
    clearHintsAndSelection(true);
}
function toggleCardSelection(cardData, cardElement) {
    if (!cardElement || cardElement.classList.contains('disabled')) return;
    clearHintsAndSelection(false);
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
function handlePlaySelectedCards() {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (selectedCards.length === 0) { displayMessage(gameStatusDisp, '请先选择要出的牌。', true); return; }
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) {
        displayMessage(gameStatusDisp, '现在不是你的回合或状态无效。', true); return;
    }
    setGameActionButtonsDisabled(true);
    socket.emit('playCard', selectedCards, (response) => {
        if (!response.success) {
            displayMessage(gameStatusDisp, response.message || '出牌失败。', true);
            if (currentGameState && currentGameState.currentPlayerId === myUserId) {
                setGameActionButtonsDisabled(false);
            }
        } else {
            selectedCards = [];
            clearHintsAndSelection(true);
        }
    });
}
function handlePassTurn() {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) {
        displayMessage(gameStatusDisp, '现在不是你的回合或状态无效。', true); return;
    }
    if (passTurnButton.disabled) {
        displayMessage(gameStatusDisp, '你必须出牌。', true);
        return;
    }
    setGameActionButtonsDisabled(true);
    selectedCards = [];
    socket.emit('passTurn', (response) => {
        if (!response.success) {
            displayMessage(gameStatusDisp, response.message || 'Pass 失败。', true);
            if (currentGameState && currentGameState.currentPlayerId === myUserId) {
                 setGameActionButtonsDisabled(false);
            }
        } else {
            clearHintsAndSelection(true);
        }
    });
}
function handleHint() {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) {
        displayMessage(gameStatusDisp, '现在不是你的回合或状态无效。', true); return;
    }
    clearHintsAndSelection(false);
    setGameActionButtonsDisabled(true);
    socket.emit('requestHint', currentHintCycleIndex, (response) => {
        if (currentGameState && currentGameState.currentPlayerId === myUserId) {
            setGameActionButtonsDisabled(false);
        }
        if (response.success && response.hint && response.hint.cards) {
            displayMessage(gameStatusDisp, '找到提示！(点击提示可尝试下一个)', false, true);
            currentHint = response.hint;
            currentHintCycleIndex = response.nextHintIndex;
            highlightHintedCards(currentHint.cards);
        } else {
            displayMessage(gameStatusDisp, response.message || '没有可出的牌或无更多提示。', true);
            currentHint = null;
            currentHintCycleIndex = 0;
        }
    });
}
function setGameActionButtonsDisabled(disabled) {
    if (disabled) {
        if(playSelectedCardsButton) playSelectedCardsButton.disabled = true;
        if(passTurnButton) passTurnButton.disabled = true;
        if(hintButton) hintButton.disabled = true;
    } else {
        if (currentGameState) updateRoomControls(currentGameState);
    }
}
function highlightHintedCards(hintedCardsArray) {
    if (!hintedCardsArray || hintedCardsArray.length === 0) return;
    if (!myHandArea) return;
    const cardElements = myHandArea.querySelectorAll('.card.visible:not(.hidden)');
    hintedCardsArray.forEach(hintCard => {
        for(const elem of cardElements) {
            if(elem.dataset.rank === hintCard.rank && elem.dataset.suit === hintCard.suit) {
                elem.classList.add('hinted');
                break;
            }
        }
    });
}
function clearHintsAndSelection(resetHintCycle = true) {
    if (resetHintCycle) {
        currentHint = null;
        currentHintCycleIndex = 0;
    }
    if (myHandArea) {
        const hintedElements = myHandArea.querySelectorAll('.card.hinted');
        hintedElements.forEach(el => el.classList.remove('hinted'));
    }
}
function handleReturnToLobby() {
    console.log("Returning to lobby.");
    currentRoomId = null; currentGameState = null; isReadyForGame = false;
    selectedCards = []; currentHint = null; currentHintCycleIndex = 0;
    if (gameOverOverlay && !gameOverOverlay.classList.contains('hidden-view')) {
        gameOverOverlay.classList.add('hidden-view');
        gameOverOverlay.classList.remove('view-flex');
    }
    showView('lobbyView');
    socket.emit('listRooms', (rooms) => renderRoomList(rooms));
}
function showGameOver(scoreResultData) {
    if (!scoreResultData) {
        console.warn("showGameOver called with no data.");
        gameOverTitle.textContent = "游戏结束!";
        gameOverReason.textContent = "无法获取详细结果。";
        gameOverScores.innerHTML = '';
    } else {
        gameOverTitle.textContent = scoreResultData.result || "游戏结束!";
        gameOverReason.textContent = scoreResultData.reason || "";
        gameOverScores.innerHTML = '';
        const playersToDisplay = scoreResultData.finalScores || currentGameState?.players || [];
        playersToDisplay.forEach(playerData => {
            const p = document.createElement('p');
            let scoreText = `${playerData.name} (${playerData.role || '?'})`;
            if (scoreResultData.scoreChanges && scoreResultData.scoreChanges[playerData.id] !== undefined) {
                const change = scoreResultData.scoreChanges[playerData.id];
                const changeDisplay = change > 0 ? `+${change}` : (change < 0 ? `${change}` : '0');
                const changeClass = change > 0 ? 'score-plus' : (change < 0 ? 'score-minus' : 'score-zero');
                scoreText += ` : <span class="${changeClass}">${changeDisplay}</span>`;
            }
            scoreText += ` (总分: ${playerData.score})`;
            p.innerHTML = scoreText;
            gameOverScores.appendChild(p);
        });
    }
    showView('gameOverOverlay');
}

socket.on('connect', () => {
    console.log('Connected to server! Socket ID:', socket.id);
    if (gameOverOverlay && !gameOverOverlay.classList.contains('hidden-view')) {
        gameOverOverlay.classList.add('hidden-view');
        gameOverOverlay.classList.remove('view-flex');
    }
    initClientSession();
});
socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    if (currentView !== 'loginRegisterView') {
        showView('loadingView');
        displayMessage(loadingView.querySelector('p'), `与服务器断开连接: ${reason}. 请刷新页面或等待重连...`, true);
    }
    currentRoomId = null; currentGameState = null; isReadyForGame = false;
});
socket.on('roomListUpdate', (rooms) => {
    console.log('Received room list update:', rooms);
    if (currentView === 'lobbyView') renderRoomList(rooms);
});
socket.on('playerReadyUpdate', ({ userId, isReady }) => {
    if (currentGameState && currentView === 'roomView') {
        const player = currentGameState.players.find(p => p.userId === userId);
        if (player) player.isReady = isReady;
        if (userId === myUserId) isReadyForGame = isReady;
        renderRoomView(currentGameState);
    }
});
socket.on('playerJoined', (newPlayerInfo) => {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (currentGameState && currentView === 'roomView') {
        console.log('Player joined:', newPlayerInfo.username);
        const existingPlayer = currentGameState.players.find(p => p.userId === newPlayerInfo.userId);
        if (existingPlayer) {
            Object.assign(existingPlayer, newPlayerInfo, {connected: true});
        } else {
            currentGameState.players.push({ ...newPlayerInfo, score:0, hand:undefined, handCount:0, role:null, finished:false, connected:true });
        }
        currentGameState.players.sort((a,b) => a.slot - b.slot);
        renderRoomView(currentGameState);
        displayMessage(gameStatusDisp, `${newPlayerInfo.username} 加入了房间。`, false, true);
    }
});
socket.on('playerLeft', ({ userId, username, reason }) => {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (currentGameState && currentView === 'roomView') {
        console.log('Player left:', username, reason);
        const player = currentGameState.players.find(p => p.userId === userId);
        if (player) {
            player.connected = false;
            player.isReady = false;
        }
        renderRoomView(currentGameState);
        displayMessage(gameStatusDisp, `${username} ${reason === 'disconnected' ? '断线了' : '离开了房间'}。`, true);
    }
});
socket.on('playerReconnected', (reconnectedPlayerInfo) => {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
     if (currentGameState && currentView === 'roomView') {
        console.log('Player reconnected:', reconnectedPlayerInfo.username);
        const player = currentGameState.players.find(p => p.userId === reconnectedPlayerInfo.userId);
        if (player) {
            Object.assign(player, reconnectedPlayerInfo, {connected: true});
        } else {
            currentGameState.players.push({ ...reconnectedPlayerInfo, score:0, hand:undefined, handCount:0, role:null, finished:false, connected:true });
            currentGameState.players.sort((a,b) => a.slot - b.slot);
        }
        renderRoomView(currentGameState);
        displayMessage(gameStatusDisp, `${reconnectedPlayerInfo.username} 重新连接。`, false, true);
    }
});
socket.on('gameStarted', (initialGameState) => {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (currentView === 'roomView' && currentRoomId === initialGameState.roomId) {
        console.log('Game started!', initialGameState);
        displayMessage(gameStatusDisp, '游戏开始！祝你好运！', false, true);
        selectedCards = []; clearHintsAndSelection(true);
        renderRoomView(initialGameState);
    }
});
socket.on('gameStateUpdate', (newState) => {
    if (currentView === 'roomView' && currentRoomId === newState.roomId) {
        if (currentGameState && ( (currentGameState.currentPlayerId === myUserId && newState.currentPlayerId !== myUserId) ||
            (!newState.lastHandInfo && currentGameState.lastHandInfo) )
           ) {
            selectedCards = [];
            clearHintsAndSelection(true);
        }
        currentGameState = newState; // Update local state *before* rendering
        renderRoomView(newState);    // Re-render with the new state
    } else if (currentRoomId && currentRoomId !== newState.roomId) {
        console.warn("Received gameStateUpdate for a different room. Ignoring.");
    }
});
socket.on('invalidPlay', ({ message }) => {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    displayMessage(gameStatusDisp, `操作无效: ${message}`, true);
    if (currentGameState && currentGameState.currentPlayerId === myUserId) {
        updateRoomControls(currentGameState);
    }
});
socket.on('gameOver', (results) => {
    if (currentView === 'roomView' && results && currentRoomId === results.roomId) {
        console.log('Game Over event received:', results);
        if (currentGameState) currentGameState.status = 'finished';
        showGameOver(results);
    } else if (currentView === 'roomView' && !currentGameState && results && results.roomId === currentRoomId) {
        console.log('Game Over event received for current room after refresh.');
        showGameOver(results);
    }
});
socket.on('gameStartFailed', ({ message }) => {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (currentView === 'roomView') {
        displayMessage(gameStatusDisp, `游戏开始失败: ${message}`, true);
        if (currentGameState) {
            currentGameState.players.forEach(p => p.isReady = false);
            isReadyForGame = false;
            renderRoomView(currentGameState);
        }
    }
});
socket.on('allPlayersResetReady', () => {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (currentGameState && currentView === 'roomView' && currentGameState.status === 'waiting') {
        currentGameState.players.forEach(p => p.isReady = false);
        isReadyForGame = false;
        renderRoomView(currentGameState);
        displayMessage(gameStatusDisp, '部分玩家状态变更，请重新准备。', true);
    }
});

function initClientSession() {
    let storedUserId = null;
    try {
        storedUserId = localStorage.getItem('kkUserId');
    } catch (e) {
        console.warn('Error accessing localStorage for user ID:', e);
        showView('loginRegisterView');
        return;
    }

    if (storedUserId) {
        console.log(`Found stored user ID: ${storedUserId}. Attempting reauthentication...`);
        showView('loadingView'); displayMessage(loadingView.querySelector('p'), "正在重新连接...", false);
        socket.emit('reauthenticate', storedUserId, (response) => {
            if (response.success) {
                myUserId = response.userId;
                myUsername = response.username;
                if (lobbyUsername) lobbyUsername.textContent = myUsername;

                if (response.roomState) {
                    currentRoomId = response.roomState.roomId;
                    if (response.roomState.status === 'finished') {
                        console.log("Reconnected to a finished game room, redirecting to lobby.");
                        handleReturnToLobby();
                    } else {
                        showView('roomView');
                        renderRoomView(response.roomState);
                    }
                } else {
                    showView('lobbyView');
                    socket.emit('listRooms', (rooms) => renderRoomList(rooms));
                }
            } else {
                try { localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); } catch (e) {}
                displayMessage(authMessage, response.message, true);
                showView('loginRegisterView');
            }
        });
    } else {
         console.log('No stored user ID found.');
         showView('loginRegisterView');
    }
}

function setupEventListeners() {
    if(registerButton) registerButton.addEventListener('click', handleRegister);
    if(loginButton) loginButton.addEventListener('click', handleLogin);
    const lobbyLogoutBtn = document.getElementById('logoutButton');
    if(lobbyLogoutBtn) lobbyLogoutBtn.addEventListener('click', handleLogout);

    if(createRoomButton) createRoomButton.addEventListener('click', handleCreateRoom);

    document.body.addEventListener('click', function(event) {
        if (event.target.id === 'readyButton') {
            handleReadyClick();
        }
        if (event.target.id === 'leaveRoomButton') {
            handleGameLeave();
        }
    });

    if(sortHandButton) sortHandButton.addEventListener('click', handleSortHand);
    if(playSelectedCardsButton) playSelectedCardsButton.addEventListener('click', handlePlaySelectedCards);
    if(passTurnButton) passTurnButton.addEventListener('click', handlePassTurn);
    if(hintButton) hintButton.addEventListener('click', handleHint);
    if(backToLobbyButton) backToLobbyButton.addEventListener('click', handleReturnToLobby);

    regPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });
    loginPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    createRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleCreateRoom(); });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Setting up client...");
    document.documentElement.style.overflow = ''; document.body.style.overflow = '';
    setupEventListeners();

    if (socket.connected) {
         initClientSession();
    } else {
        showView('loadingView');
        displayMessage(loadingView.querySelector('p'), "正在连接服务器...", false);
    }
    console.log('Client setup complete.');
});
