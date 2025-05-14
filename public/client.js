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
        if (currentView !== 'gameOverOverlay') {currentGameState = null; previousGameState = null;}
    }
}
function displayMessage(element, message, isError = false, isSuccess = false) {
    if (element) {
        element.textContent = message;
        element.classList.remove('error', 'success');
        if (isError) element.classList.add('error');
        else if (isSuccess) element.classList.add('success');
        else if (element.id !== 'gameStatusDisplay') element.className = 'message';
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

// --- Rendering Functions ---
function renderRoomList(rooms) {
    // console.log('CLIENT: renderRoomList called with rooms:', rooms); // Verbose
    if (!roomListEl) {
        console.error("CLIENT: roomList DOM element (roomListEl) not found!");
        return;
    }
    roomListEl.innerHTML = '';
    if (!Array.isArray(rooms)) {
        console.error("CLIENT: rooms data is not an array!", rooms);
        roomListEl.innerHTML = '<p>获取房间列表失败 (数据格式错误)。</p>';
        return;
    }
    if (rooms.length === 0) {
        roomListEl.innerHTML = '<p>当前没有房间。</p>';
        return;
    }
    rooms.forEach(room => {
        const item = document.createElement('div'); item.classList.add('room-item');
        const nameSpan = document.createElement('span'); nameSpan.textContent = `${room.roomName} (${room.playerCount}/${room.maxPlayers})`; item.appendChild(nameSpan);
        const statusSpan = document.createElement('span'); statusSpan.textContent = `状态: ${room.status}`; statusSpan.classList.add(`status-${room.status}`); item.appendChild(statusSpan);
        if (room.hasPassword) {
            const passwordSpan = document.createElement('span'); passwordSpan.textContent = '🔒'; item.appendChild(passwordSpan);
        }
        const joinButton = document.createElement('button'); joinButton.textContent = '加入';
        joinButton.disabled = room.status !== 'waiting' || room.playerCount >= room.maxPlayers;
        joinButton.onclick = () => joinRoom(room.roomId, room.hasPassword);
        item.appendChild(joinButton);
        roomListEl.appendChild(item);
    });
 }

function updateGameInfoBarDOM(state) {
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
}
function updateGameStatusDisplayDOM(state) {
    const gameStatusDisplay = document.getElementById('gameStatusDisplay');
    if (gameStatusDisplay) {
        let messageText = '';
        if (state.status === 'waiting') {
            const numPlayers = state.players.filter(p => p.connected).length; // Count only connected players for waiting message
            const maxPlayers = 4; // Assuming maxPlayers is 4
            messageText = `等待 ${numPlayers}/${maxPlayers} 位玩家准备...`;
        } else if (state.status === 'playing') {
            const currentPlayer = state.players.find(p => p.userId === state.currentPlayerId);
            messageText = currentPlayer ? (currentPlayer.userId === myUserId ? '轮到你出牌！' : `等待 ${currentPlayer.username} 出牌...`) : '游戏进行中...';
        } else if (state.status === 'finished') {
            messageText = '游戏已结束';
        } else {
            messageText = `状态: ${state.status}`;
        }
        // Only update if text actually changes and it's not an error/success message being displayed
        if (gameStatusDisplay.textContent !== messageText && !gameStatusDisplay.classList.contains('error') && !gameStatusDisplay.classList.contains('success')) {
            displayMessage(gameStatusDisplay, messageText);
        }
    }
}

function renderCenterPileDOM(state) {
    if (!centerPileArea) {
        console.error("CLIENT: centerPileArea DOM element not found!");
        return;
    }
    centerPileArea.innerHTML = ''; // Always clear the previous cards in the center pile

    if (state.centerPile && Array.isArray(state.centerPile) && state.centerPile.length > 0) {
        // console.log("CLIENT: Rendering center pile with cards:", JSON.parse(JSON.stringify(state.centerPile))); // Verbose
        state.centerPile.forEach(cardData => {
            const cardElement = renderCard(cardData, false, true); // Third arg true for center pile card
            centerPileArea.appendChild(cardElement);
        });
    } else {
        // console.log("CLIENT: Rendering center pile as empty."); // Verbose
        const placeholder = document.createElement('span');
        placeholder.textContent = '- 等待出牌 -';
        placeholder.style.color = '#aaa';
        placeholder.style.fontSize = '0.9em';
        centerPileArea.appendChild(placeholder);
    }

    // Update the "Last Hand Type" display (this should ONLY be text)
    if (lastHandTypeDisplay) {
        if (state.lastHandInfo && state.lastHandInfo.type) {
            lastHandTypeDisplay.textContent = `类型: ${state.lastHandInfo.type}`;
        } else if (state.isFirstTurn && !state.lastHandInfo) {
             lastHandTypeDisplay.textContent = '请先出牌';
        } else {
            lastHandTypeDisplay.textContent = '新回合';
        }
    }
    // Defensive check: Ensure #centerInfo or #lastHandTypeDisplay isn't holding old card elements
    const centerInfoEl = document.getElementById('centerInfo');
    if(centerInfoEl){
        const strayCards = centerInfoEl.querySelectorAll('.card');
        if (strayCards.length > 0 && !centerInfoEl.contains(centerPileArea)) { // Don't remove cards from the actual pile
            console.warn("CLIENT: Found stray card elements within #centerInfo (but not in #centerPileArea), removing them.");
            strayCards.forEach(card => card.remove());
        }
    }
}


function renderRoomView(state) {
    if (!state || !roomView || !myUserId) {
        console.error("RenderRoomView (full) called with invalid state or no myUserId", state, myUserId);
        if (!myUserId && currentView === 'roomView') { handleLogout(); alert("用户身份丢失，请重新登录。"); }
        return;
    }
    // console.log("Executing FULL renderRoomView based on new state:", JSON.parse(JSON.stringify(state))); // Verbose

    updateGameInfoBarDOM(state);
    // updateGameStatusDisplayDOM is called by gameStateUpdate etc. or here if needed as fallback
    // Let's ensure it's called here for full render consistency
    updateGameStatusDisplayDOM(state);


    Object.values(playerAreas).forEach(clearPlayerAreaDOM);
    const myPlayer = state.players.find(p => p.userId === myUserId);
    if (!myPlayer) { console.error("My player data not found in game state!", state.players); handleGameLeave(); return; }
    isReadyForGame = myPlayer.isReady;
    const mySlot = myPlayer.slot;

    state.players.forEach(player => {
        const isMe = player.userId === myUserId;
        // Calculate relative slot for display (0=bottom, 1=left, 2=top, 3=right)
        let relativeSlot = (player.slot - mySlot + state.players.length) % state.players.length; // Assuming state.players.length is 4 for a 4-player game
        if (state.players.length !== 4 && state.players.length > 0) { // Adjust for non-4-player games if necessary, though UI is designed for 4
             // This logic might need refinement if you support < 4 players with this UI layout.
             // For now, it will map slots 0,1,2,3 as is if player.length is not 4, which might look odd.
        }
        const targetArea = playerAreas[relativeSlot];
        if (targetArea) renderPlayerArea(targetArea, player, isMe, state, player.slot); // Pass absoluteSlot for avatar
        else console.warn(`No target area for relative slot ${relativeSlot} (Player slot ${player.slot}, My slot ${mySlot})`);
    });

    renderCenterPileDOM(state);
    updateRoomControls(state);

    if (state.currentPlayerId !== myUserId || state.status !== 'playing') {
        clearHintsAndSelection(false); // Clear visual hints if not my turn
    }
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
        avatarEl.innerHTML = ''; // Clear alarm icon
        avatarEl.style.backgroundImage = ''; // Clear background image
     }
     if (nameEl) nameEl.textContent = (area.id === 'playerAreaBottom' && myUsername) ? myUsername + ' (你)' : '空位';
     if (roleEl) roleEl.textContent = '[?]';
     if (infoEl) infoEl.innerHTML = '总分: 0';
     if (cardsEl) cardsEl.innerHTML = '<span style="color:#888; font-style:italic;">- 等待 -</span>';
     if (handCountEl) handCountEl.remove();

     // For bottom (self) area, also hide buttons if not applicable
     if (area.id === 'playerAreaBottom') {
        const actionsContainers = area.querySelectorAll('.my-actions-container');
        actionsContainers.forEach(ac => ac.classList.add('hidden-view'));
        const readyBtn = area.querySelector('#readyButton');
        if (readyBtn) readyBtn.classList.add('hidden-view');
     }
}
function renderPlayerArea(container, playerData, isMe, state, absoluteSlot) {
    const avatarEl = container.querySelector('.player-avatar');
    const nameEl = container.querySelector('.playerName');
    const roleEl = container.querySelector('.playerRole');
    const infoEl = container.querySelector('.playerInfo');
    const cardsEl = container.querySelector('.playerCards');

    if (!playerData || !playerData.userId) { // Handle empty slot case explicitly
        clearPlayerAreaDOM(container); // Use clear function to reset to "empty" state
        return;
    }

    if (avatarEl) {
        avatarEl.innerHTML = ''; // Clear previous content (like alarm icon)
        avatarEl.style.backgroundImage = `url('${AVATAR_PATHS[absoluteSlot % AVATAR_PATHS.length]}')`;
        if (state.status === 'playing' && playerData.userId === state.currentPlayerId && !playerData.finished) {
            const alarmImg = document.createElement('img');
            alarmImg.src = ALARM_ICON_SRC;
            alarmImg.alt = '出牌提示';
            alarmImg.classList.add('alarm-icon');
            avatarEl.appendChild(alarmImg);
            avatarEl.style.backgroundImage = 'none'; // Hide default avatar if alarm is shown
        }
    }
    if (nameEl) nameEl.textContent = playerData.username + (isMe ? ' (你)' : '');
    if (roleEl) roleEl.textContent = playerData.role ? `[${playerData.role}]` : '[?]';
    if (infoEl) {
        let infoText = `总分: ${playerData.score || 0}`;
        if (playerData.finished) infoText += ' <span class="finished">[已完成]</span>';
        else if (!playerData.connected && state.status !== 'waiting') infoText += ' <span class="disconnected">[已断线]</span>';
        else if (state.status === 'waiting' && !isMe) { // Opponent's ready status
             infoText += playerData.isReady ? ' <span class="ready">[已准备]</span>' : ' <span class="not-ready">[未准备]</span>';
        }
        infoEl.innerHTML = infoText;
    }

    // Self-area specific: ready button and action buttons visibility is handled by updateRoomControls
    // This function focuses on player data rendering.

    if (cardsEl) renderPlayerCards(cardsEl, playerData, isMe, state.status === 'playing' && state.currentPlayerId === myUserId);
}

function fanCards(cardContainer, cardElements, areaId) {
    const numCards = cardElements.length;
    if (numCards === 0) return;

    // IMPORTANT: This width MUST roughly match the CSS width of .card for opponent hands
    // If CSS card width is 110px, this should be around 110 or slightly less.
    // Let's try to get it from a card element if possible, otherwise use a default.
    let cardWidth = 110; // Default, should match CSS .card width
    if (cardElements[0]) {
        const computedStyle = getComputedStyle(cardElements[0]);
        const cssWidth = parseFloat(computedStyle.width);
        if (!isNaN(cssWidth) && cssWidth > 0) {
            cardWidth = cssWidth;
        }
    }


    if (areaId === 'playerAreaBottom') { // My hand - cards are laid out by flex, z-index for overlap
        cardElements.forEach((card, i) => {
            card.style.zIndex = i;
        });
    } else { // Opponent hands - fanned out
        let maxAngle = 20; // Max spread angle
        let angleStep = numCards > 1 ? maxAngle / (numCards - 1) : 0;
        angleStep = Math.min(angleStep, 3); // Limit angle step to prevent excessive fanning for many cards
        let initialRotation = -((numCards - 1) * angleStep) / 2; // Center the fan
        let offsetMultiplier = 2; // How much cards overlap vertically/horizontally

        cardElements.forEach((card, i) => {
            const rotation = initialRotation + i * angleStep;
            let tx = "0px", ty = "0px";

            if (areaId === 'playerAreaTop') {
                card.style.left = `calc(50% - ${cardWidth / 2}px)`; // Center horizontally
                ty = `${i * offsetMultiplier}px`; // Overlap vertically
                card.style.transform = `translateY(${ty}) rotate(${rotation}deg)`;
                card.style.zIndex = numCards - i; // Cards on top are further down the array
            } else if (areaId === 'playerAreaLeft') {
                tx = `${i * offsetMultiplier * 0.8}px`; // Overlap horizontally
                // Adjust vertical offset to keep fan somewhat centered vertically in its area
                ty = `calc(-50% + ${(i - (numCards -1) / 2) * offsetMultiplier * 0.2}px )`;
                card.style.transform = `translateX(${tx}) translateY(${ty}) rotate(${rotation}deg)`;
                card.style.zIndex = numCards - i;
            } else if (areaId === 'playerAreaRight') {
                tx = `${-i * offsetMultiplier * 0.8}px`; // Overlap horizontally (negative for right side)
                ty = `calc(-50% + ${(i - (numCards -1) / 2) * offsetMultiplier * 0.2}px )`;
                card.style.transform = `translateX(${tx}) translateY(${ty}) rotate(${rotation}deg)`;
                card.style.zIndex = i; // Cards on top are earlier in the array for right side
            }
        });
    }
}
function getCardImageFilename(cardData) {
    if (!cardData || typeof cardData.rank !== 'string' || typeof cardData.suit !== 'string') {
        console.error("Invalid cardData for getCardImageFilename:", cardData);
        return null;
    }
    let rankStr = cardData.rank.toLowerCase();
    if (rankStr === 't') rankStr = '10';
    else if (rankStr === 'j') rankStr = 'jack';
    else if (rankStr === 'q') rankStr = 'queen';
    else if (rankStr === 'k') rankStr = 'king';
    else if (rankStr === 'a') rankStr = 'ace';

    let suitStr = '';
    switch (cardData.suit.toUpperCase()) {
        case 'S': suitStr = 'spades'; break;
        case 'H': suitStr = 'hearts'; break;
        case 'D': suitStr = 'diamonds'; break;
        case 'C': suitStr = 'clubs'; break;
        default: console.warn("Invalid suit for card image:", cardData.suit); return null;
    }
    return `${rankStr}_of_${suitStr}.png`;
}
function renderCard(cardData, isHidden, isCenterPileCard = false) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    if (isCenterPileCard) {
        // Styles for center pile cards (e.g., relative positioning) are handled by CSS selector: #centerPileArea .card
        // No specific class needed here unless more distinction is required.
    }

    if (isHidden || !cardData) {
        cardDiv.classList.add('hidden'); // Applies card-back.png via CSS
    } else {
        cardDiv.classList.add('visible');
        const filename = getCardImageFilename(cardData);
        if (filename) {
            cardDiv.style.backgroundImage = `url('/images/cards/${filename}')`;
            cardDiv.dataset.suit = cardData.suit;
            cardDiv.dataset.rank = cardData.rank;
        } else {
            cardDiv.textContent = `${cardData.rank || '?'}${getSuitSymbol(cardData.suit)}`;
            cardDiv.classList.add(getSuitClass(cardData.suit));
            console.error("Failed to generate filename for card:", cardData, "Using text fallback.");
        }
    }
    return cardDiv;
}
function renderPlayerCards(container, playerData, isMe, isMyTurnAndPlaying) {
    container.innerHTML = ''; // Clear previous cards
    const cardElements = [];

    if (isMe) {
        let sortedHand = playerData.hand ? [...playerData.hand] : [];
        if (playerData.finished) {
            container.innerHTML = '<span style="color:#888; font-style:italic;">已出完</span>';
        } else if (sortedHand.length === 0) {
             container.innerHTML = '<span style="color:#555; font-style:italic;">- 无手牌 -</span>';
        } else {
            if (currentSortMode === 'rank') sortedHand.sort(compareSingleCardsClient);
            else if (currentSortMode === 'suit') sortedHand.sort(compareBySuitThenRank);

            sortedHand.forEach(cardData => {
                const cardElement = renderCard(cardData, false, false); // Not center pile card
                const isSelected = selectedCards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);
                const isHinted = currentHint && currentHint.cards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);

                if (isSelected) cardElement.classList.add('selected');
                if (isHinted) cardElement.classList.add('hinted');

                if (isMyTurnAndPlaying) {
                    cardElement.onclick = () => toggleCardSelection(cardData, cardElement);
                    cardElement.classList.remove('disabled'); // Should not be needed if default is not disabled
                } else {
                    cardElement.classList.add('disabled'); // Make non-turn cards unclickable/greyed
                }
                container.appendChild(cardElement);
                cardElements.push(cardElement);
            });
        }
    } else { // Opponent's hand
        if (playerData.finished) {
            container.innerHTML = '<span style="color:#888; font-style:italic;">已出完</span>';
        } else if (playerData.handCount > 0) {
            for (let i = 0; i < playerData.handCount; i++) {
                const cardElement = renderCard(null, true, false); // Hidden, not center pile
                container.appendChild(cardElement);
                cardElements.push(cardElement);
            }
            // Update or create hand count display for opponents
            let handCountEl = container.closest('.playerArea')?.querySelector('.hand-count-display');
            if (!handCountEl) {
                handCountEl = document.createElement('div');
                handCountEl.classList.add('hand-count-display');
                // Attempt to append it near the player info or cards, adjust as needed
                const playerInfoArea = container.closest('.playerArea')?.querySelector('.playerInfo');
                if (playerInfoArea && playerInfoArea.parentNode) {
                     playerInfoArea.parentNode.insertBefore(handCountEl, playerInfoArea.nextSibling);
                } else {
                     container.closest('.playerArea')?.appendChild(handCountEl); // Fallback
                }
            }
            handCountEl.textContent = `${playerData.handCount} 张`;

        } else { // No cards and not finished (e.g. game not started fully)
            container.innerHTML = '<span style="color:#555; font-style:italic;">- 等待 -</span>';
            let handCountEl = container.closest('.playerArea')?.querySelector('.hand-count-display');
            if (handCountEl) handCountEl.remove(); // Remove count if no cards
        }
    }

    if (cardElements.length > 0) {
        requestAnimationFrame(() => { // Use rAF for smoother rendering of fanned cards
             fanCards(container, cardElements, container.closest('.playerArea')?.id);
        });
    }
}

function updateRoomControls(state) {
    if (!state || !myUserId) return;
    const myPlayerInState = state.players.find(p => p.userId === myUserId);
    if (!myPlayerInState) return;

    const readyButtonInstance = document.getElementById('readyButton');
    if (readyButtonInstance) {
        if (state.status === 'waiting') {
            readyButtonInstance.classList.remove('hidden-view');
            readyButtonInstance.textContent = myPlayerInState.isReady ? '取消' : '准备';
            readyButtonInstance.classList.toggle('ready', myPlayerInState.isReady);
            readyButtonInstance.disabled = false;
        } else {
            readyButtonInstance.classList.add('hidden-view');
        }
    }

    const actionsContainers = document.querySelectorAll('#playerAreaBottom .my-actions-container');
    if (actionsContainers.length > 0) {
        if (state.status === 'playing' && state.currentPlayerId === myUserId && !myPlayerInState.finished) {
            actionsContainers.forEach(ac => ac.classList.remove('hidden-view'));

            if(playSelectedCardsButton) playSelectedCardsButton.disabled = selectedCards.length === 0;
            if(passTurnButton) {
                let disablePass = (!state.lastHandInfo && !state.isFirstTurn); // Can't pass if you are leading a new round
                // Special D4 rule for first turn of the game
                if (state.isFirstTurn && !state.lastHandInfo) { // Game's very first turn
                     const iAmD4Holder = myPlayerInState.hand && myPlayerInState.hand.some(c => c.rank === '4' && c.suit === 'D');
                     if (iAmD4Holder) disablePass = true; // Must play D4
                }
                passTurnButton.disabled = disablePass;
            }
            if(hintButton) hintButton.disabled = false;
            if(sortHandButton) sortHandButton.disabled = false;
        } else {
            actionsContainers.forEach(ac => ac.classList.add('hidden-view'));
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
             socket.emit('listRooms', (rooms) => renderRoomList(rooms)); // Fetch rooms on login
         }
     });
 }
function handleLogout() {
      console.log('Logging out...');
      try { localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); }
      catch (e) { console.warn('LocalStorage error while removing user session:', e); }
      myUserId = null; myUsername = null; currentRoomId = null; currentGameState = null; previousGameState = null; isReadyForGame = false; selectedCards = []; currentHint = null; currentHintCycleIndex = 0;
      if (socket.connected) {
        // socket.emit('explicitLogout'); // Optional: inform server if needed
        socket.disconnect(); // Disconnect to clear server-side session if any
      }
      socket.connect(); // Reconnect to get a fresh session
      showView('loginRegisterView');
      if(loginPhoneInput) loginPhoneInput.value = ''; // Clear login form
      if(loginPasswordInput) loginPasswordInput.value = '';
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

    socket.emit('leaveRoom', (response) => { // No data needed, server knows room from socket.roomId
        if (actualLeaveButton) actualLeaveButton.disabled = false;
        if (response.success) {
            handleReturnToLobby(); // This will clear room state
        } else {
            const gameStatusDisp = document.getElementById('gameStatusDisplay');
            displayMessage(gameStatusDisp || lobbyMessage, response.message || '离开房间失败。', true);
        }
    });
}
function handleCreateRoom() {
     const roomName = createRoomNameInput.value.trim(); const password = createRoomPasswordInput.value;
     if (!roomName) { displayMessage(lobbyMessage, '请输入房间名称。', true); return; }
     createRoomButton.disabled = true;
     socket.emit('createRoom', { roomName, password: password || null }, (response) => {
         createRoomButton.disabled = false;
         // displayMessage(lobbyMessage, response.message, !response.success, response.success); // Message displayed by joining
         if (response.success) {
             currentRoomId = response.roomId;
             showView('roomView');
             previousGameState = null; // Fresh start for the room
             currentGameState = response.roomState;
             renderRoomView(response.roomState);
         } else {
             displayMessage(lobbyMessage, response.message, true);
         }
     });
 }
function joinRoom(roomId, needsPassword) {
      let passwordToTry = null;
      if (needsPassword) {
          passwordToTry = prompt(`房间 "${roomId}" 受密码保护，请输入密码:`, '');
          if (passwordToTry === null) return; // User cancelled prompt
      }
      displayMessage(lobbyMessage, `正在加入房间 ${roomId}...`, false);
      socket.emit('joinRoom', { roomId, password: passwordToTry }, (response) => {
          // displayMessage(lobbyMessage, response.message, !response.success, response.success);
          if (response.success) {
              currentRoomId = response.roomId;
              showView('roomView');
              previousGameState = null; // Fresh start for the room
              currentGameState = response.roomState;
              renderRoomView(response.roomState);
              displayMessage(lobbyMessage, '', false); // Clear lobby message on successful join
          } else {
              displayMessage(lobbyMessage, response.message, true);
          }
      });
 }
function handleReadyClick() {
      if (!currentRoomId || !currentGameState) return;
      const actualReadyButton = document.getElementById('readyButton');
      if (!actualReadyButton) {console.error("Ready button not found!"); return;}
      const desiredReadyState = !isReadyForGame; // Toggle current ready state
      actualReadyButton.disabled = true; // Disable button during request
      socket.emit('playerReady', desiredReadyState, (response) => {
           actualReadyButton.disabled = false; // Re-enable after response
           if (!response.success) {
               const gameStatusDisp = document.getElementById('gameStatusDisplay');
               displayMessage(gameStatusDisp, response.message || "无法改变准备状态。", true);
           }
           // State will be updated by 'playerReadyUpdate' event from server
      });
 }
function handleSortHand() {
    if (currentSortMode === 'rank') currentSortMode = 'suit';
    else currentSortMode = 'rank';
    // console.log("Sorting mode changed to:", currentSortMode); // Verbose
    if (currentGameState && currentView === 'roomView') {
        const myPlayer = currentGameState.players.find(p => p.userId === myUserId);
        if (myPlayer && myPlayer.hand) { // Re-render my hand area
            const selfArea = playerAreas[0]; // Assuming 0 is always self area
            if(selfArea) {
                const cardsEl = selfArea.querySelector('.myHand'); // More specific selector
                if (cardsEl) renderPlayerCards(cardsEl, myPlayer, true, currentGameState.status === 'playing' && currentGameState.currentPlayerId === myUserId);
            }
        }
    }
    // clearHintsAndSelection(true); // Sorting might invalidate current hint
}
function toggleCardSelection(cardData, cardElement) {
    if (!cardElement || cardElement.classList.contains('disabled')) return;
    // clearHintsAndSelection(false); // Don't clear hint cycle on card selection, user might be trying to match hint

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
            // Re-enable buttons only if it's still my turn and game is playing
            if (currentGameState && currentGameState.status === 'playing' && currentGameState.currentPlayerId === myUserId) {
                setGameActionButtonsDisabled(false);
            }
        } else {
            // Success: clear selection. Game state update will handle enabling/disabling buttons.
            selectedCards = [];
            clearHintsAndSelection(true); // Reset hint cycle after successful play
            // Don't re-enable buttons here, wait for gameStateUpdate
        }
    });
}
function handlePassTurn() {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) {
        displayMessage(gameStatusDisp, '现在不是你的回合或状态无效。', true); return;
    }
    if (passTurnButton && passTurnButton.disabled) { // Check if button is logically disabled
        displayMessage(gameStatusDisp, '你必须出牌。', true);
        return;
    }
    setGameActionButtonsDisabled(true);
    selectedCards = []; // Clear selection on pass
    socket.emit('passTurn', (response) => {
        if (!response.success) {
            displayMessage(gameStatusDisp, response.message || 'Pass 失败。', true);
            if (currentGameState && currentGameState.status === 'playing' && currentGameState.currentPlayerId === myUserId) {
                 setGameActionButtonsDisabled(false);
            }
        } else {
            clearHintsAndSelection(true); // Reset hint cycle after successful pass
        }
    });
}
function handleHint() {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) {
        displayMessage(gameStatusDisp, '现在不是你的回合或状态无效。', true); return;
    }
    // clearHintsAndSelection(false); // Don't clear previous hint just yet, server will give new one
    setGameActionButtonsDisabled(true);
    socket.emit('requestHint', currentHintCycleIndex, (response) => {
        if (currentGameState && currentGameState.status === 'playing' && currentGameState.currentPlayerId === myUserId) {
            setGameActionButtonsDisabled(false);
        }
        clearHintsAndSelection(false); // Clear previous visual hint *before* applying new one
        if (response.success && response.hint && response.hint.cards) {
            displayMessage(gameStatusDisp, '找到提示！(再点提示可尝试下一个)', false, true);
            currentHint = response.hint;
            currentHintCycleIndex = response.nextHintIndex;
            highlightHintedCards(currentHint.cards);
            // Auto-select hinted cards:
            // selectedCards = [...currentHint.cards];
            // const myPlayer = currentGameState.players.find(p => p.userId === myUserId);
            // if (myPlayer && myPlayer.hand) {
            //     const cardsEl = myHandArea.querySelector('.myHand');
            //     if (cardsEl) renderPlayerCards(cardsEl, myPlayer, true, true); // Re-render to show selection
            // }
            // if(playSelectedCardsButton) playSelectedCardsButton.disabled = selectedCards.length === 0;

        } else {
            displayMessage(gameStatusDisp, response.message || '没有可出的牌或无更多提示。', true);
            currentHint = null; // No valid hint found
            currentHintCycleIndex = 0; // Reset cycle
        }
    });
}
function setGameActionButtonsDisabled(disabled) {
    // This function is a bit broad. updateRoomControls is more specific.
    // However, for immediate disabling during an action, it's okay.
    if (playSelectedCardsButton) playSelectedCardsButton.disabled = disabled;
    if (passTurnButton) passTurnButton.disabled = disabled;
    if (hintButton) hintButton.disabled = disabled;
    // Sort button can generally remain enabled
    if (!disabled && currentGameState) { // If re-enabling, defer to specific logic
        updateRoomControls(currentGameState);
    }
}
function highlightHintedCards(hintedCardsArray) {
    if (!hintedCardsArray || hintedCardsArray.length === 0) return;
    if (!myHandArea) return;
    // Ensure we are selecting cards from the correct container (myHand)
    const cardElements = myHandArea.querySelectorAll('.card.visible:not(.hidden)');
    hintedCardsArray.forEach(hintCard => {
        for(const elem of cardElements) {
            if(elem.dataset.rank === hintCard.rank && elem.dataset.suit === hintCard.suit) {
                elem.classList.add('hinted');
                break; // Found the card, move to next hintCard
            }
        }
    });
}
function clearHintsAndSelection(resetHintCycleAndSelection = true) {
    if (resetHintCycleAndSelection) {
        currentHint = null;
        currentHintCycleIndex = 0;
        selectedCards = []; // Also clear actual selected cards
        if(playSelectedCardsButton) playSelectedCardsButton.disabled = true;
    }
    // Clear visual hint class
    if (myHandArea) {
        const hintedElements = myHandArea.querySelectorAll('.card.hinted');
        hintedElements.forEach(el => el.classList.remove('hinted'));
        if(resetHintCycleAndSelection){ // Also clear visual selection class
             const selectedElements = myHandArea.querySelectorAll('.card.selected');
             selectedElements.forEach(el => el.classList.remove('selected'));
        }
    }
}
function handleReturnToLobby() {
    console.log("Returning to lobby.");
    currentRoomId = null; currentGameState = null; previousGameState = null; isReadyForGame = false;
    selectedCards = []; currentHint = null; currentHintCycleIndex = 0;

    if (gameOverOverlay && !gameOverOverlay.classList.contains('hidden-view')) {
        gameOverOverlay.classList.add('hidden-view');
        gameOverOverlay.classList.remove('view-flex');
    }
    showView('lobbyView');
    // Request fresh room list when returning to lobby
    socket.emit('listRooms', (rooms) => {
        // console.log("CLIENT: Fetched room list for lobby:", rooms); // Verbose
        renderRoomList(rooms);
    });
}
function showGameOver(scoreResultData) {
    if (!scoreResultData) {
        console.warn("showGameOver called with no data. Using last known game state if available.");
        gameOverTitle.textContent = "游戏结束!";
        gameOverReason.textContent = currentGameState?.gameResult?.reason || "无法获取详细结果。";
        gameOverScores.innerHTML = '';
         const playersToDisplay = currentGameState?.players || [];
         playersToDisplay.forEach(playerData => {
             const p = document.createElement('p');
             p.textContent = `${playerData.name} (${playerData.role || '?'}) 总分: ${playerData.score}`;
             gameOverScores.appendChild(p);
         });

    } else {
        gameOverTitle.textContent = scoreResultData.result || "游戏结束!";
        gameOverReason.textContent = scoreResultData.reason || (scoreResultData.result ? '' : "游戏正常结束。"); // Add a default if no reason/result
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

// --- Socket Event Handlers ---
socket.on('connect', () => {
    console.log('Connected to server! Socket ID:', socket.id);
    if (gameOverOverlay && !gameOverOverlay.classList.contains('hidden-view')) { // If reconnected while game over was shown
        // Decide if we should return to lobby or try to rejoin if game is somehow still active.
        // For simplicity now, just hide it and let reauth handle it.
        gameOverOverlay.classList.add('hidden-view');
        gameOverOverlay.classList.remove('view-flex');
    }
    initClientSession(); // Attempt to reauthenticate or show login
});
socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    if (currentView !== 'loginRegisterView' && currentView !== 'loadingView') { // Avoid flicker if already on loading/login
        showView('loadingView');
        displayMessage(loadingView.querySelector('p'), `与服务器断开连接: ${reason}. 正在尝试重连...`, true);
    }
    // Don't nullify currentRoomId here, reauthentication might need it.
    // currentGameState will be updated or cleared by reauth/join logic.
});
socket.on('connect_error', (err) => {
    console.error('Connection Error:', err.message);
    if (currentView !== 'loginRegisterView' && currentView !== 'loadingView') {
        showView('loadingView');
        displayMessage(loadingView.querySelector('p'), `连接错误: ${err.message}. 请检查网络并刷新。`, true);
    }
});
socket.on('roomListUpdate', (rooms) => {
    // console.log('CLIENT: roomListUpdate event received with rooms:', rooms); // Verbose
    if (currentView === 'lobbyView') {
        renderRoomList(rooms);
    }
});
socket.on('playerReadyUpdate', ({ userId, isReady }) => {
    if (currentGameState && currentView === 'roomView') {
        const player = currentGameState.players.find(p => p.userId === userId);
        if (player) {
            player.isReady = isReady;
            if (userId === myUserId) isReadyForGame = isReady; // Update local flag

            // Re-render the specific player area that changed
            const myPlayer = currentGameState.players.find(p => p.userId === myUserId);
            if (myPlayer) {
                const mySlot = myPlayer.slot;
                const targetPlayerToUpdate = currentGameState.players.find(p => p.userId === userId);
                if (targetPlayerToUpdate) {
                    let relativeSlot = (targetPlayerToUpdate.slot - mySlot + currentGameState.players.length) % currentGameState.players.length;
                    const targetArea = playerAreas[relativeSlot];
                    if (targetArea) renderPlayerArea(targetArea, targetPlayerToUpdate, targetPlayerToUpdate.userId === myUserId, currentGameState, targetPlayerToUpdate.slot);
                }
            }
             updateRoomControls(currentGameState); // Update ready button text for self
        }
    }
});
socket.on('playerJoined', (newPlayerInfo) => { // Server sends info of the player who joined
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (currentView === 'roomView' && currentGameState) {
        console.log('Player joined:', newPlayerInfo.username);
        previousGameState = JSON.parse(JSON.stringify(currentGameState)); // Snapshot

        const existingPlayer = currentGameState.players.find(p => p.userId === newPlayerInfo.userId);
        if (existingPlayer) { // Player might be rejoining a slot they previously occupied
            Object.assign(existingPlayer, newPlayerInfo, {connected: true});
        } else { // New player taking an empty slot
            // Find the first empty slot or a slot matching newPlayerInfo.slot if provided
            let slotToFill = newPlayerInfo.slot;
            if (slotToFill === undefined || currentGameState.players.some(p=>p.slot === slotToFill && p.userId !== newPlayerInfo.userId)){
                // Fallback if slot is bad or taken by someone else (shouldn't happen with good server logic)
                for(let i=0; i<4; i++){ if(!currentGameState.players.some(p=>p.slot === i)){ slotToFill = i; break;}}
            }
            currentGameState.players.push({
                ...newPlayerInfo,
                slot: slotToFill, // Ensure slot is assigned
                score:0, hand:undefined, handCount:0, role:null, finished:false, connected:true
            });
        }
        currentGameState.players.sort((a,b) => a.slot - b.slot); // Keep sorted by slot
        renderRoomView(currentGameState);
        if (gameStatusDisp) displayMessage(gameStatusDisp, `${newPlayerInfo.username} 加入了房间。`, false, true);
    } else if (currentView === 'roomView' && !currentGameState) { // Edge case: joined a room but client has no state yet
        socket.emit('requestGameState', (state) => {
            if(state) {
                currentGameState = state;
                previousGameState = null;
                renderRoomView(currentGameState);
                if (gameStatusDisp) displayMessage(gameStatusDisp, `${newPlayerInfo.username} 加入了房间。`, false, true);
            }
        });
    }
});
socket.on('playerLeft', ({ userId, username, reason }) => { // Server sends who left and why
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (currentGameState && currentView === 'roomView') {
        console.log('Player left:', username, reason);
        previousGameState = JSON.parse(JSON.stringify(currentGameState)); // Snapshot
        const playerIdx = currentGameState.players.findIndex(p => p.userId === userId);
        if (playerIdx > -1) {
            // Instead of removing, mark as disconnected to keep slot but show as inactive
            currentGameState.players[playerIdx].connected = false;
            currentGameState.players[playerIdx].isReady = false; // Disconnected players are not ready
            // Server's gameStateUpdate after this should reflect the true state of game (e.g., turn advanced)
        }
        renderRoomView(currentGameState); // Re-render to show disconnected status
        if (gameStatusDisp) displayMessage(gameStatusDisp, `${username} ${reason === 'disconnected' ? '断线了' : '离开了房间'}。`, true);
    }
});
socket.on('playerReconnected', (reconnectedPlayerInfo) => {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
     if (currentView === 'roomView' && currentGameState) {
        console.log('Player reconnected:', reconnectedPlayerInfo.username);
        previousGameState = JSON.parse(JSON.stringify(currentGameState));
        const player = currentGameState.players.find(p => p.userId === reconnectedPlayerInfo.userId);
        if (player) {
            Object.assign(player, reconnectedPlayerInfo, {connected: true}); // Update existing player
        } else { // Should not happen if player was already in game state
            console.warn("Reconnected player not found in current game state, adding fresh.");
            currentGameState.players.push({ ...reconnectedPlayerInfo, score:0, hand:undefined, handCount:0, role:null, finished:false, connected:true });
            currentGameState.players.sort((a,b) => a.slot - b.slot);
        }
        renderRoomView(currentGameState);
        if (gameStatusDisp) displayMessage(gameStatusDisp, `${reconnectedPlayerInfo.username} 重新连接。`, false, true);
    } else if (currentView === 'roomView' && !currentGameState) { // Reconnected but client has no state
         socket.emit('requestGameState', (state) => { // Request full state
            if(state) {
                currentGameState = state;
                previousGameState = null;
                renderRoomView(currentGameState);
                if (gameStatusDisp) displayMessage(gameStatusDisp, `${reconnectedPlayerInfo.username} 重新连接。`, false, true);
            }
        });
    }
});
socket.on('gameStarted', (initialGameState) => {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (currentView === 'roomView' && currentRoomId === initialGameState.roomId) {
        console.log('Game started event received!', initialGameState);
        previousGameState = currentGameState; // Store old state if any
        currentGameState = initialGameState;
        // console.log("CLIENT: gameStarted - Initial Game State before render:", JSON.parse(JSON.stringify(currentGameState))); // Verbose
        if (gameStatusDisp) displayMessage(gameStatusDisp, '游戏开始！祝你好运！', false, true);
        selectedCards = []; clearHintsAndSelection(true); // Reset selections and hints
        renderRoomView(initialGameState);
    } else {
        console.warn("Received gameStarted for a room I'm not in or not viewing:", initialGameState.roomId, "My current room:", currentRoomId);
    }
});

socket.on('gameStateUpdate', (newState) => {
    if (currentView === 'roomView' && currentRoomId === newState.roomId) {
        // console.log('CLIENT: gameStateUpdate received'); // Verbose

        let myCurrentHand = null;
        if (currentGameState && currentGameState.players) {
            const myPlayerInOldState = currentGameState.players.find(p => p.userId === myUserId);
            if (myPlayerInOldState && myPlayerInOldState.hand && Array.isArray(myPlayerInOldState.hand)) {
                myCurrentHand = JSON.parse(JSON.stringify(myPlayerInOldState.hand));
            }
        }

        previousGameState = currentGameState ? JSON.parse(JSON.stringify(currentGameState)) : null;
        currentGameState = newState; // Overwrite with new state from server

        if (myCurrentHand && myCurrentHand.length > 0) {
            const myPlayerInNewState = currentGameState.players.find(p => p.userId === myUserId);
            if (myPlayerInNewState && !myPlayerInNewState.finished && myPlayerInNewState.hand === undefined) {
                // console.log("CLIENT: Restoring my hand locally as broadcast didn't include it for gameStateUpdate."); // Verbose
                myPlayerInNewState.hand = myCurrentHand;
            }
        }
        // If my turn ended or a new round started, clear my selections/hints
        if (previousGameState &&
           ( (previousGameState.currentPlayerId === myUserId && currentGameState.currentPlayerId !== myUserId) || // My turn just ended
             (!currentGameState.lastHandInfo && previousGameState.lastHandInfo && currentGameState.currentPlayerId === myUserId) ) // New round, I am leading
           ) {
            selectedCards = [];
            clearHintsAndSelection(true);
        }
        // console.log("CLIENT: gameStateUpdate - Current Game State before render:", JSON.parse(JSON.stringify(currentGameState))); // Verbose
        renderRoomView(currentGameState);
        updateGameStatusDisplayDOM(currentGameState); // Also update status message
    } else if (currentRoomId && currentRoomId !== newState.roomId) {
        console.warn("Received gameStateUpdate for a different room. Ignoring.");
    }
});
socket.on('invalidPlay', ({ message }) => {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (gameStatusDisp) displayMessage(gameStatusDisp, `操作无效: ${message}`, true);
    // Re-enable buttons if it's still my turn (state might not have changed on server for this)
    if (currentGameState && currentGameState.status === 'playing' && currentGameState.currentPlayerId === myUserId) {
        updateRoomControls(currentGameState); // This will re-evaluate button states
    }
});
socket.on('gameOver', (results) => { // results should contain roomId
    if (currentView === 'roomView' && results && currentRoomId === results.roomId) {
        console.log('Game Over event received:', results);
        if (currentGameState) {
            currentGameState.status = 'finished'; // Mark local state as finished
            // Merge results into currentGameState if it helps showGameOver
            if(results.finalScores) currentGameState.finalScores = results.finalScores;
            if(results.scoreChanges) currentGameState.scoreChanges = results.scoreChanges;
            if(results.result) currentGameState.gameResultText = results.result; // Use a distinct field
        }
        showGameOver(results);
    } else if (currentView === 'roomView' && !results && currentGameState && currentGameState.roomId === currentRoomId) {
        // Game over but no specific results from server (e.g. server just ended it)
        console.log('Game Over event received (no detailed results). Using current state.');
        showGameOver(currentGameState); // Try to show with what we have
    } else {
        console.warn("Received gameOver for a room I'm not in/viewing, or results are missing roomId. My room:", currentRoomId, "Results:", results);
    }
});
socket.on('gameStartFailed', ({ message }) => {
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (currentView === 'roomView' && gameStatusDisp) {
        displayMessage(gameStatusDisp, `游戏开始失败: ${message}`, true);
        if (currentGameState) { // Reset ready states locally if game failed to start
            currentGameState.players.forEach(p => p.isReady = false);
            isReadyForGame = false;
            renderRoomView(currentGameState); // Re-render to show players as not ready
        }
    }
});
socket.on('allPlayersResetReady', () => { // Server requests all players to re-ready
    const gameStatusDisp = document.getElementById('gameStatusDisplay');
    if (currentGameState && currentView === 'roomView' && currentGameState.status === 'waiting') {
        currentGameState.players.forEach(p => p.isReady = false);
        isReadyForGame = false; // My ready state is also reset
        renderRoomView(currentGameState);
        if (gameStatusDisp) displayMessage(gameStatusDisp, '部分玩家状态变更，请重新准备。', true);
    }
});

// --- Initialization ---
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

                if (response.roomState) { // Server sent back a room state (was in a room)
                    currentRoomId = response.roomState.roomId;
                    previousGameState = null;
                    currentGameState = response.roomState;
                    if (response.roomState.status === 'finished' && response.roomState.gameResult) { // If game finished and result provided
                        console.log("Reconnected to a finished game room, showing game over.");
                        showView('roomView'); // Show room briefly then overlay
                        renderRoomView(response.roomState);
                        showGameOver(response.roomState.gameResult); // Assuming gameResult is the score data
                    } else if (response.roomState.status === 'finished') {
                         console.log("Reconnected to a finished game room (no specific result in reauth). Returning to lobby.");
                         handleReturnToLobby();
                    }
                    else { // Game is waiting or playing
                        showView('roomView');
                        renderRoomView(response.roomState);
                    }
                } else { // Not in a room, go to lobby
                    showView('lobbyView');
                    socket.emit('listRooms', (rooms) => {
                        // console.log("CLIENT: Received room list after reauth (no room state):", rooms); // Verbose
                        renderRoomList(rooms);
                    });
                }
            } else { // Reauthentication failed
                try { localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); } catch (e) {}
                displayMessage(authMessage, response.message || "重新认证失败，请重新登录。", true);
                showView('loginRegisterView');
            }
        });
    } else { // No stored user ID
         console.log('No stored user ID found. Showing login/register.');
         showView('loginRegisterView');
    }
}
function setupEventListeners() {
    if(registerButton) registerButton.addEventListener('click', handleRegister);
    if(loginButton) loginButton.addEventListener('click', handleLogin);
    const lobbyLogoutBtnInstance = document.getElementById('logoutButton'); // Ensure it's correctly named
    if(lobbyLogoutBtnInstance) lobbyLogoutBtnInstance.addEventListener('click', handleLogout);

    if(createRoomButton) createRoomButton.addEventListener('click', handleCreateRoom);

    // More robust event delegation for room view buttons
    if (roomView) {
        roomView.addEventListener('click', function(event) {
            const buttonElement = event.target.closest('button');
            if (!buttonElement) return;
            const buttonId = buttonElement.id;

            // Check if currentView is indeed roomView to prevent actions from other views
            if (currentView !== 'roomView' && buttonId !== 'backToLobbyButton' && buttonId !== 'leaveRoomButton') { // backToLobby can be from overlay
                 if (currentView === 'gameOverOverlay' && buttonId === 'backToLobbyButton') {
                     // allow this specific case
                 } else if (currentView === 'roomView' && buttonId === 'leaveRoomButton') {
                     // allow this
                 }
                 else {
                    console.warn(`Button click for ${buttonId} ignored, current view is ${currentView}`);
                    return;
                 }
            }


            switch (buttonId) {
                case 'readyButton': handleReadyClick(); break;
                case 'leaveRoomButton': handleGameLeave(); break;
                case 'sortHandButton': handleSortHand(); break;
                case 'playSelectedCardsButton': handlePlaySelectedCards(); break;
                case 'passTurnButton': handlePassTurn(); break;
                case 'hintButton': handleHint(); break;
                case 'backToLobbyButton': handleReturnToLobby(); break;
            }
        });
    }


    regPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !registerButton.disabled) handleRegister(); });
    loginPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !loginButton.disabled) handleLogin(); });
    createRoomNameInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !createRoomButton.disabled) handleCreateRoom(); });
    createRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !createRoomButton.disabled) handleCreateRoom(); });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Setting up client...");
    // Ensure body/html overflow is managed based on view
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    setupEventListeners();

    if (socket.connected) { // If socket is already connected when DOM loads
         initClientSession();
    } else { // Socket not yet connected, wait for 'connect' event (handled by socket.on('connect',...))
        showView('loadingView');
        displayMessage(loadingView.querySelector('p'), "正在连接服务器...", false);
    }
    console.log('Client setup complete.');
});
