// public/js/client.js
const socket = io({
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
});

const myHandDiv = document.getElementById('my-hand');
const lastPlayedHandDiv = document.getElementById('last-played-hand');
const lastPlayedInfoP = document.getElementById('last-played-info');
const playersDisplayDiv = document.getElementById('players-display');

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
    console.log('[CLIENT] Socket connected to server with ID:', socket.id);
});

socket.on('disconnect', (reason) => {
    connectionStatusP.textContent = `已断开 (Disconnected): ${reason}`;
    connectionStatusP.style.color = '#cd5c5c';
    errorMessageDiv.textContent = '与服务器断开连接，尝试重连中...';
    console.warn('[CLIENT] Socket disconnected. Reason:', reason);
    playButton.disabled = true;
    passButton.disabled = true;
    startGameButton.disabled = true;
    newGameButton.disabled = true;
});

socket.on('connect_error', (err) => {
    connectionStatusP.textContent = '连接错误 (Connection Error)';
    connectionStatusP.style.color = '#cd5c5c';
    errorMessageDiv.textContent = `连接错误: ${err.message}. 请刷新页面。`;
    console.error('[CLIENT] Socket connection error:', err);
});

socket.on('connection_ack', (data) => {
    myLocalPlayerId = data.playerId;
    myPlayerInfoP.textContent = `你的ID (Your ID): ${myLocalPlayerId ? myLocalPlayerId.substring(0,5) : 'N/A'}`;
    console.log('[CLIENT] Connection ACK:', data.message, "My assigned game ID:", myLocalPlayerId);
});

socket.on('game_error', (error) => {
    console.error("[CLIENT] Received Game Error:", error.message);
    errorMessageDiv.textContent = `错误: ${error.message}`;
    setTimeout(() => { if (errorMessageDiv.textContent === `错误: ${error.message}`) errorMessageDiv.textContent = ''; }, 7000);
});

socket.on('gameState', (state) => {
    console.log("[CLIENT] Received gameState:", JSON.parse(JSON.stringify(state))); // Deep copy for logging
    errorMessageDiv.textContent = '';

    if (state.myPlayerId) {
        myLocalPlayerId = state.myPlayerId;
        myPlayerInfoP.textContent = `玩家 (Player): ${state.myDisplayName || state.myPlayerId.substring(0,5)}`;
        renderHand(state.myHand || []);
        playButton.disabled = !state.myIsTurn || state.isRoundOver;
        passButton.disabled = !state.myIsTurn || state.isRoundOver || !state.lastPlayedHand || state.lastPlayedHand.length === 0;
    } else {
        myPlayerInfoP.textContent = state.statusMessage || "观察者 (Observer)"; // Use statusMessage if available
        renderHand([]);
        playButton.disabled = true;
        passButton.disabled = true;
    }

    renderPlayerSlots(state.playerSlots || [], myLocalPlayerId);
    renderLastPlayedHand(state.lastPlayedHand || [], state.lastPlayedHandType);
    updateGameLog(state.gameLog || []);

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
    } else {
        gameStatusP.textContent = `等待玩家加入... (${state.connectedPlayersCount}/${state.maxPlayers})`;
        startGameButton.style.display = 'block';
        startGameButton.disabled = !state.canStartGame;
        startGameButton.textContent = `开始游戏 (${state.connectedPlayersCount}/${state.maxPlayers})`;
        newGameButton.style.display = 'none';
        playButton.disabled = true;
        passButton.disabled = true;
    }
    if (state.statusMessage && !state.myPlayerId) { // Show status message for observers
        gameStatusP.textContent = state.statusMessage;
    }
});

socket.on('player_list_update', (playerSlots) => {
    console.log("[CLIENT] Player list update:", playerSlots);
    // Potentially update player display if needed, though full gameState usually covers it
});

socket.on('game_started', (data) => {
    console.log("[CLIENT] Game started event:", data);
    // gameStatusP.textContent = data.message; // Often covered by gameState
});

socket.on('round_over', (data) => {
    console.log("[CLIENT] Round over event:", data);
});

socket.on('game_reset_for_new', (data) => {
    console.log("[CLIENT] Game reset for new:", data);
});

socket.on('game_ended_disconnect', (data) => {
    console.log("[CLIENT] Game ended due to disconnections:", data);
    gameStatusP.textContent = data.message;
    newGameButton.style.display = 'block';
    newGameButton.disabled = false;
    startGameButton.style.display = 'none';
    playButton.disabled = true;
    passButton.disabled = true;
});


// --- Rendering Functions (with more logging and error handling) ---
function renderCard(cardData, isSelectable = false) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    try {
        if (!cardData || typeof cardData.image !== 'string' || typeof cardData.id !== 'string') {
            console.error("[CLIENT] Invalid cardData in renderCard: image or id missing/invalid.", cardData);
            cardDiv.textContent = '卡牌错误';
            cardDiv.style.cssText = 'color:red; border:1px solid red; width:75px; height:110px; display:flex; align-items:center; justify-content:center;';
            return cardDiv;
        }
        if (!cardData.image.trim()) {
             console.error("[CLIENT] Invalid cardData in renderCard: image string is empty.", cardData);
             cardDiv.textContent = '图片错误';
             cardDiv.style.cssText = 'color:red; border:1px solid red; width:75px; height:110px; display:flex; align-items:center; justify-content:center;';
             return cardDiv;
        }

        cardDiv.style.backgroundImage = `url('/images/cards/${cardData.image}')`;
        cardDiv.dataset.cardId = cardData.id;

        if (isSelectable) {
            cardDiv.addEventListener('click', () => {
                if (playButton.disabled && passButton.disabled) return; // Not player's turn or game over
                cardDiv.classList.toggle('selected');
                if (cardDiv.classList.contains('selected')) {
                    selectedCards.push(cardData.id);
                } else {
                    selectedCards = selectedCards.filter(id => id !== cardData.id);
                }
            });
        }
    } catch (e) {
        console.error("[CLIENT] EXCEPTION in renderCard with data:", cardData, "Error:", e);
        cardDiv.textContent = `渲染异常: ${e.message.substring(0,20)}`;
        cardDiv.style.color = 'orange';
    }
    return cardDiv;
}

function renderHand(handArray) {
    myHandDiv.innerHTML = '';
    selectedCards = [];
    if (Array.isArray(handArray)) {
        // console.log("[CLIENT] Rendering hand with array:", JSON.parse(JSON.stringify(handArray)));
        handArray.forEach((card, index) => {
            if (card) {
                myHandDiv.appendChild(renderCard(card, true));
            } else {
                console.warn(`[CLIENT] Undefined card object at index ${index} in handArray.`);
            }
        });
    } else {
        console.warn("[CLIENT] renderHand received non-array:", handArray);
    }
}

function renderLastPlayedHand(cardsArray, type) {
    lastPlayedHandDiv.innerHTML = '';
    if (Array.isArray(cardsArray) && cardsArray.length > 0) {
        // console.log("[CLIENT] Rendering last played hand:", JSON.parse(JSON.stringify(cardsArray)));
        cardsArray.forEach(card => {
            if (card) {
                lastPlayedHandDiv.appendChild(renderCard(card, false));
            } else {
                console.warn("[CLIENT] Undefined card object in lastPlayedHand array.");
            }
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
            try {
                if (slot.connected) slotDiv.classList.add('connected');
                else slotDiv.classList.add('disconnected');

                if (slot.isTurn) slotDiv.classList.add('is-turn');
                if (slot.hasPassed) slotDiv.classList.add('has-passed');
                if (slot.playerId === myId) slotDiv.classList.add('is-me');

                let displayName = slot.displayName || (slot.playerId ? `玩家 ${index + 1}` : `空位 ${index + 1}`);
                if (!slot.connected && slot.playerId) displayName += " (已断开)";
                if (slot.playerId === myId && slot.connected) displayName += " (你)";

                let miniCardsHTML = '<div class="mini-cards">';
                if (slot.connected && slot.playerId !== myId) {
                    for (let i = 0; i < slot.cardCount; i++) {
                        miniCardsHTML += '<div class="mini-card-back"></div>';
                    }
                } else if (!slot.connected && slot.playerId) {
                     miniCardsHTML += `<span>...</span>`;
                } else if (!slot.playerId) {
                     miniCardsHTML += `<span>等待...</span>`;
                }
                miniCardsHTML += '</div>';

                slotDiv.innerHTML = `
                    <h3>${displayName}</h3>
                    <p>牌数: ${slot.connected && slot.playerId ? slot.cardCount : 'N/A'}</p>
                    <p>分数: ${slot.score !== undefined ? slot.score : 'N/A'}</p>
                    ${slot.playerId !== myId || !slot.connected ? miniCardsHTML : ''}
                    ${slot.hasPassed ? '<p style="color: #ffcc00;">PASS</p>' : ''}
                `;
            } catch (e) {
                console.error(`[CLIENT] EXCEPTION rendering player slot ${index} with data:`, slot, "Error:", e);
                slotDiv.textContent = `Slot Error ${index}`;
                slotDiv.style.color = 'orange';
            }
            playersDisplayDiv.appendChild(slotDiv);
        });
    } else {
         console.warn("[CLIENT] renderPlayerSlots received non-array:", playerSlotsArray);
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
    } else {
        errorMessageDiv.textContent = "请选择要出的牌 (Please select cards to play).";
        setTimeout(() => { if (errorMessageDiv.textContent.includes("请选择")) errorMessageDiv.textContent = ''; }, 3000);
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

console.log("[CLIENT] client.js loaded and event listeners attached.");
