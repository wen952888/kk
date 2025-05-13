// public/client.js
const socket = io();

// --- State Variables ---
let currentView = 'loading';
let myUserId = null;
let myUsername = null;
let currentRoomId = null;
let currentGameState = null;
let isReady = false;
let selectedCards = []; // Array to store selected card objects { suit, rank }
let currentSortMode = 'rank'; // 'rank' (default), 'suit'
let currentHint = null; // { cards: [...], index: number }
let currentHintIndex = 0; // Index for cycling through hints

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
const gameModeDisplay = document.getElementById('gameModeDisplay'); // Added
const roomStatusDisplay = document.getElementById('roomStatusDisplay');
const leaveRoomButton = document.getElementById('leaveRoomButton');
const gameArea = document.getElementById('gameArea');
const centerPileArea = document.getElementById('centerPileArea');
const lastHandTypeDisplay = document.getElementById('lastHandTypeDisplay'); // Added
const myHandArea = document.getElementById('myHand');
const myActionsArea = document.getElementById('myActions'); // Added
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
    if (views[viewName]) {
        views[viewName].style.display = (viewName === 'roomView') ? 'flex' : 'block'; // Show target
    } else {
         console.warn(`View element not found: ${viewName}`);
    }
    // Body scroll control
    const scroll = (viewName !== 'roomView');
    document.documentElement.style.overflow = scroll ? '' : 'hidden';
    document.body.style.overflow = scroll ? '' : 'hidden';
    clearMessages();
    // Reset game-specific UI states when leaving room view
    if (viewName !== 'roomView') {
        selectedCards = [];
        currentHint = null;
        currentHintIndex = 0;
        hideGameOver(); // Hide overlay if leaving room
    }
}
function displayMessage(element, message, isError = false) { if (element) { element.textContent = message; element.className = `message ${isError ? 'error' : 'success'}`; } }
function clearMessages() { [authMessage, lobbyMessage, gameMessage].forEach(el => { if (el) el.textContent = ''; }); }
function getSuitSymbol(suit) { switch (suit?.toUpperCase()) { case 'H': return '♥'; case 'D': return '♦'; case 'C': '♣'; case 'S': '♠'; default: return '?'; } }
function getSuitClass(suit) { switch (suit?.toUpperCase()) { case 'H': return 'hearts'; case 'D': return 'diamonds'; case 'C': 'clubs'; case 'S': 'spades'; default: ''; } }
// Card comparison functions (needed for client-side sort)
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
function renderRoomList(rooms) { /* ... unchanged ... */
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
    isReady = false; // Reset local ready state, rely on server

    // Clear previous player highlights/info first
    Object.values(playerAreas).forEach(clearPlayerArea);
    centerPileArea.innerHTML = '';
    lastHandTypeDisplay.textContent = state.lastHandInfo ? `类型: ${state.lastHandInfo.type}` : '-';

    // Determine own slot for relative positioning
    const myPlayer = state.players.find(p => p.userId === myUserId);
    if (!myPlayer) { console.error("Cannot find myself in player list!"); return; }
    const mySlot = myPlayer.slot;

    // Render each player
    state.players.forEach(player => {
        const isMe = player.userId === myUserId;
        if (isMe) isReady = player.isReady;

        let relativeSlot = (player.slot - mySlot + 4) % 4; // 0: bottom, 1: left, 2: top, 3: right
        const targetArea = playerAreas[relativeSlot];

        if (targetArea) {
            renderPlayerArea(targetArea, player, isMe, state);
        } else {
            console.warn(`No player area found for relative slot: ${relativeSlot}`);
        }
    });

    // Render center pile
    if (state.centerPile && state.centerPile.length > 0) {
        state.centerPile.forEach(cardData => centerPileArea.appendChild(renderCard(cardData, false)));
    } else {
        centerPileArea.innerHTML = '-';
    }

    // Update room controls visibility/state
    updateRoomControls(state);

    // Clear hints if turn changed or game not playing
    if (state.currentPlayerId !== myUserId || state.status !== 'playing') {
        clearHints();
    }
}

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
     // Remove action buttons if they exist (only in bottom area)
     const actions = area.querySelector('.my-actions');
     if(actions) actions.remove();
}

function renderPlayerArea(container, playerData, isMe, state) {
    const nameEl = container.querySelector('.playerName');
    const roleEl = container.querySelector('.playerRole'); // May not exist in opponent areas
    const infoEl = container.querySelector('.playerInfo');
    const cardsEl = container.querySelector('.playerCards');

    if (nameEl) nameEl.textContent = playerData.username + (isMe ? ' (你)' : '');
    if (roleEl) roleEl.textContent = `[${playerData.role || '?'}]`; // Show role D/F/DD
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
    container.innerHTML = ''; // Clear previous cards
    const hand = playerData.hand || []; // Use empty array if hand is undefined (for opponents)

    // Sort hand based on current mode if it's my hand
    let cardsToRender = [];
    if (isMe) {
        if (currentSortMode === 'rank') cardsToRender = [...hand].sort(compareSingleCardsClient);
        else if (currentSortMode === 'suit') cardsToRender = [...hand].sort(compareBySuitThenRank);
        else cardsToRender = [...hand]; // Fallback
    }
