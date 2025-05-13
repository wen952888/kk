// public/js/client.js
const socket = io({
    reconnectionAttempts: 5, // Try to reconnect 5 times
    reconnectionDelay: 2000, // Wait 2 seconds before trying to reconnect
});

const myHandDiv = document.getElementById('my-hand');
const lastPlayedHandDiv = document.getElementById('last-played-hand');
const lastPlayedInfoP = document.getElementById('last-played-info');
const playersDisplayDiv = document.getElementById('players-display'); // Changed ID

const playButton = document.getElementById('play-button');
const passButton = document.getElementById('pass-button');
const startGameButton = document.getElementById('start-game-button');
const newGameButton = document.getElementById('new-game-button');

const myPlayerInfoP = document.getElementById('my-player-info');
const gameStatusP = document.getElementById('game-status');
const logListUl = document.getElementById('log-list');
const errorMessageDiv = document.getElementById('error-message');
const connectionStatusP = document.getElementById('connection-status');

let selectedCards = [];
let myLocalPlayerId = null;

// --- Socket Event Handlers ---
socket.on('connect', () => {
    connectionStatusP.textContent = '已连接 (Connected)';
    connectionStatusP.style.color = '#8fbc8f';
    errorMessageDiv.textContent = '';
    console.log('Socket connected to server with ID:', socket.id);
    // Server will send 'connection_ack' with actual player ID from game logic
});

socket.on('disconnect', (reason) => {
    connectionStatusP.textContent = `已断开 (Disconnected): ${reason}`;
    connectionStatusP.style.color = '#cd5c5c';
    errorMessageDiv.textContent = '与服务器断开连接，尝试重连中...';
    console.warn('Socket disconnected. Reason:', reason);
    // Disable buttons on disconnect
    playButton.disabled = true;
    passButton.disabled = true;
    startGameButton.disabled = true;
    newGameButton.disabled = true;
});

socket.on('connect_error', (err) => {
    connectionStatusP.textContent = '连接错误 (Connection Error)';
    connectionStatusP.style.color = '#cd5c5c';
    errorMessageDiv.textContent = `连接错误: ${err.message}. 请刷新页面。`;
    console.error('Socket connection error:', err);
});

socket.on('connection_ack', (data) => {
    myLocalPlayerId = data.playerId; // This is the ID assigned by the game logic
    myPlayerInfoP.textContent = `你的ID (Your ID): ${myLocalPlayerId ? myLocalPlayerId.substring(0,5) : 'N/A'}`;
    console.log(data.message, "My assigned game ID:", myLocalPlayerId);
});

socket.on('game_error', (error) => {
    console.error("Game Error:", error.message);
    errorMessageDiv.textContent = `错误: ${error.message}`;
    setTimeout(() => { errorMessageDiv.textContent = ''; }, 5000); // Clear error after 5s
});

socket.on('gameState', (state) => {
    console.log("Received gameState:", state);
    errorMessageDiv.textContent = ''; // Clear previous errors on new state

    if (state.myPlayerId) { // If this client is recognized as a player in a slot
        myLocalPlayerId = state.myPlayerId; // Update if changed (e.g. reconnected to different slot)
        myPlayerInfoP.textContent = `玩家 (Player): ${state.myDisplayName || state.myPlayerId.substring(0,5)}`;
        renderHand(state.myHand || []);
        playButton.disabled = !state.myIsTurn || state.isRoundOver;
        passButton.disabled = !state.myIsTurn || state.isRoundOver || !state.lastPlayedHand || state.lastPlayedHand.length === 0;
    } else { // Observer or not yet fully joined
        myPlayerInfoP.textContent = "观察者 (Observer)";
        renderHand([]);
        playButton.disabled = true;
        passButton.disabled = true;
    }

    renderPlayerSlots(state.playerSlots || [], myLocalPlayerId);
    renderLastPlayedHand(state.lastPlayedHand || [], state.lastPlayedHandType);
    updateGameLog(state.gameLog || []);

    // Game status and button visibility
    if (state.isRoundOver) {
        gameStatusP.textContent = state.roundWinner ? `本局结束! 赢家: ${state.roundWinner}` : "本局结束!";
        playButton.disabled = true;
        passButton.disabled = true;
        startGameButton.style.display = 'none';
        newGameButton.style.display = 'block';
        newGameButton.disabled = false;
    } else if (state.isGameStarted) {
        const currentPlayerSlot = state.playerSlots.find(p => p.isTurn);
        gameStatusP.textContent = currentPlayerSlot ? `轮到 (Turn): ${currentPlayerSlot.displayName}` : "等待中...";
        startGameButton.style.display = 'none';
        newGameButton.style.display = 'none';
    } else { // Game not started (lobby)
        gameStatusP.textContent = `等待玩家加入... (${state.connectedPlayersCount}/${state.maxPlayers})`;
        startGameButton.style.display = 'block';
        startGameButton.disabled = !state.canStartGame;
        startGameButton.textContent = `开始游戏 (${state.connectedPlayersCount}/${state.maxPlayers})`;
        newGameButton.style.display = 'none';
        playButton.disabled = true;
        passButton.disabled = true;
    }
    if (state.statusMessage) { // For observers etc.
        gameStatusP.textContent = state.statusMessage;
    }
});

socket.on('player_list_update', (playerSlots) => { // Listen for quick player list updates
    console.log("Player list update:", playerSlots);
    if (document.hidden) return; // Only update if tab is visible to avoid re-rendering over full gameState
    // This is a lighter update, if full gameState isn't immediately following,
    // you might want to update just the player display part here.
    // For now, we assume full gameState will follow major changes.
    // renderPlayerSlots(playerSlots, myLocalPlayerId);
});

socket.on('game_started', (data) => {
    console.log("Game started event:", data);
    gameStatusP.textContent = data.message;
    // Full gameState update should follow
});

socket.on('round_over', (data) => {
    console.log("Round over event:", data);
    // UI updated by subsequent gameState
});

socket.on('game_reset_for_new', (data) => {
    console.log("Game reset for new:", data);
    // UI updated by subsequent gameState
});

socket.on('game_ended_disconnect', (data) => {
    console.log("Game ended due to disconnections:", data);
    gameStatusP.textContent = data.message;
    newGameButton.style.display = 'block';
    newGameButton.disabled = false;
    startGameButton.style.display = 'none';
     playButton.disabled = true;
    passButton.disabled = true;
});


// --- Rendering Functions ---
function renderCard(cardData, isSelectable = false) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    if (!cardData || !cardData.image) {
        console.warn("Card data or image missing for render:", cardData);
        cardDiv.textContent = "Error"; // Fallback for bad card data
        return cardDiv;
    }
    cardDiv.style.backgroundImage = `url('/images/cards/${cardData.image}')`;
    cardDiv.dataset.cardId = cardData.id;

    if (isSelectable) {
        cardDiv.addEventListener('click', () => {
            if (playButton.disabled) return; // Don't allow selection if not player's turn
            cardDiv.classList.toggle('selected');
            if (cardDiv.classList.contains('selected')) {
                selectedCards.push(cardData.id);
            } else {
                selectedCards = selectedCards.filter(id => id !== cardData.id);
            }
        });
    }
    return cardDiv;
}

function renderHand(handArray) {
    myHandDiv.innerHTML = '';
    selectedCards = []; // Clear selection on re-render
    if (Array.isArray(handArray)) {
        handArray.forEach(card => {
            myHandDiv.appendChild(renderCard(card, true));
        });
    }
}

function renderLastPlayedHand(cardsArray, type) {
    lastPlayedHandDiv.innerHTML = '';
    if (Array.isArray(cardsArray) && cardsArray.length > 0) {
        cardsArray.forEach(card => {
            lastPlayedHandDiv.appendChild(renderCard(card, false));
        });
        lastPlayedInfoP.textContent = `上一手 (Last Play): ${type || 'N/A'} (${cardsArray.length} 张)`;
    } else {
        lastPlayedInfoP.textContent = '牌桌已清空 (Table is clear)';
    }
}

function renderPlayerSlots(playerSlotsArray, myId) {
    playersDisplayDiv.innerHTML = '';
    if (Array.isArray(playerSlotsArray)) {
        playerSlotsArray.forEach((slot, index) => {
            const slotDiv = document.createElement('div');
            slotDiv.classList.add('player-slot');
            if (slot.connected) slotDiv.classList.add('connected');
            else slotDiv.classList.add('disconnected');

            if (slot.isTurn) slotDiv.classList.add('is-turn');
            if (slot.hasPassed) slotDiv.classList.add('has-passed');
            if (slot.playerId === myId) slotDiv.classList.add('is-me');

            let displayName = slot.displayName || (slot.playerId ? `玩家 ${index + 1}` : `空位 ${index + 1}`);
            if (!slot.connected && slot.playerId) displayName += " (已断开)";
            if (slot.playerId === myId) displayName += " (你)";


            let miniCardsHTML = '<div class="mini-cards">';
            if (slot.connected && slot.playerId !== myId) { // Don't show mini cards for self
                for (let i = 0; i < slot.cardCount; i++) {
                    miniCardsHTML += '<div class="mini-card-back"></div>';
                }
            } else if (!slot.connected && slot.playerId) {
                 miniCardsHTML += `<span>已断开</span>`;
            } else if (!slot.playerId) {
                 miniCardsHTML += `<span>等待加入...</span>`;
            }
            miniCardsHTML += '</div>';


            slotDiv.innerHTML = `
                <h3>${displayName}</h3>
                <p>牌数: ${slot.connected ? slot.cardCount : 'N/A'}</p>
                <p>分数: ${slot.score !== undefined ? slot.score : 'N/A'}</p>
                ${slot.playerId !== myId ? miniCardsHTML : ''}
                ${slot.hasPassed ? '<p style="color: #ffcc00;">PASS</p>' : ''}
            `;
            playersDisplayDiv.appendChild(slotDiv);
        });
    }
}

function updateGameLog(logsArray) {
    logListUl.innerHTML = '';
    if (Array.isArray(logsArray)) {
        logsArray.forEach(logMsg => {
            const li = document.createElement('li');
            li.textContent = logMsg;
            logListUl.appendChild(li);
        });
    }
}

// --- Button Event Listeners ---
playButton.addEventListener('click', () => {
    if (selectedCards.length > 0) {
        socket.emit('playCards', selectedCards);
        // Selection cleared in renderHand on next gameState
    } else {
        errorMessageDiv.textContent = "请选择要出的牌 (Please select cards to play).";
        setTimeout(() => { errorMessageDiv.textContent = ''; }, 3000);
    }
});

passButton.addEventListener('click', () => {
    socket.emit('passTurn');
});

startGameButton.addEventListener('click', () => {
    socket.emit('startGame');
});

newGameButton.addEventListener('click', () => {
    socket.emit('requestNewGame');
});
