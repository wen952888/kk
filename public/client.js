const socket = io();

// --- State Variables ---
let currentView = 'loading'; // 'loading', 'login', 'lobby', 'room'
let myUserId = null;
let myUsername = null;
let currentRoomId = null;
let currentGameState = null; // Stores the latest received game state
let isReady = false; // Player's ready state in room

// --- DOM Elements ---
const loadingView = document.getElementById('loadingView');
const loginRegisterView = document.getElementById('loginRegisterView');
const lobbyView = document.getElementById('lobbyView');
const roomView = document.getElementById('roomView');
const views = { loadingView, loginRegisterView, lobbyView, roomView };

// Auth elements
const regPhoneInput = document.getElementById('regPhone');
const regPasswordInput = document.getElementById('regPassword');
const registerButton = document.getElementById('registerButton');
const loginPhoneInput = document.getElementById('loginPhone');
const loginPasswordInput = document.getElementById('loginPassword');
const loginButton = document.getElementById('loginButton');
const authMessage = document.getElementById('authMessage');

// Lobby elements
const lobbyUsername = document.getElementById('lobbyUsername');
const createRoomNameInput = document.getElementById('createRoomName');
const createRoomPasswordInput = document.getElementById('createRoomPassword');
const createRoomButton = document.getElementById('createRoomButton');
const roomList = document.getElementById('roomList');
const lobbyMessage = document.getElementById('lobbyMessage');

// Room/Game elements
const roomNameDisplay = document.getElementById('roomNameDisplay');
const roomStatusDisplay = document.getElementById('roomStatusDisplay');
const leaveRoomButton = document.getElementById('leaveRoomButton');
const gameArea = document.getElementById('gameArea');
const centerPileArea = document.getElementById('centerPileArea');
const myHandArea = document.getElementById('myHand');
const playerAreas = { // Map slot to area ID
    0: document.getElementById('playerAreaBottom'), // Assuming slot 0 is self, adjust if needed
    1: document.getElementById('playerAreaLeft'),   // Slot 1 is left
    2: document.getElementById('playerAreaTop'),    // Slot 2 is top
    3: document.getElementById('playerAreaRight')   // Slot 3 is right
};
const readyButton = document.getElementById('readyButton');
const gameMessage = document.getElementById('gameMessage');


// --- Utility Functions ---

function showView(viewName) {
    console.log(`Switching view to: ${viewName}`);
    currentView = viewName;
    for (const key in views) {
        if (views[key]) { // Check if element exists
            views[key].style.display = (key === viewName) ? 'block' : 'none';
        } else {
             console.warn(`View element not found: ${key}`);
        }
    }
    // Clear messages on view switch
    clearMessages();
}

function displayMessage(element, message, isError = false) {
    if (element) {
        element.textContent = message;
        element.className = isError ? 'message error' : 'message success'; // Keep 'message' base class
    }
}

function clearMessages() {
    if (authMessage) authMessage.textContent = '';
    if (lobbyMessage) lobbyMessage.textContent = '';
    if (gameMessage) gameMessage.textContent = '';
}

function getSuitSymbol(suit) {
    switch (suit.toUpperCase()) {
        case 'H': return '♥'; // Hearts
        case 'D': return '♦'; // Diamonds
        case 'C': return '♣'; // Clubs
        case 'S': return '♠'; // Spades
        case 'J': return 'J'; // Joker (if used)
        default: return '?';
    }
}
function getSuitClass(suit) {
     switch (suit.toUpperCase()) {
        case 'H': return 'hearts';
        case 'D': return 'diamonds';
        case 'C': return 'clubs';
        case 'S': return 'spades';
        // case 'J': return 'joker';
        default: return '';
    }
}


// --- Rendering Functions ---

function renderRoomList(rooms) {
    if (!roomList) return;
    roomList.innerHTML = ''; // Clear previous list
    if (!rooms || rooms.length === 0) {
        roomList.innerHTML = '<p>当前没有房间。</p>';
        return;
    }

    rooms.forEach(room => {
        const item = document.createElement('div');
        item.classList.add('room-item');

        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${room.roomName} (${room.playerCount}/${room.maxPlayers})`;
        item.appendChild(nameSpan);

         const statusSpan = document.createElement('span');
         statusSpan.textContent = `状态: ${room.status}`;
         statusSpan.classList.add(`status-${room.status}`); // Add class for styling
         item.appendChild(statusSpan);


        const passwordSpan = document.createElement('span');
        passwordSpan.textContent = room.hasPassword ? '🔒' : ''; // Lock icon if password
        item.appendChild(passwordSpan);

        const joinButton = document.createElement('button');
        joinButton.textContent = '加入';
        joinButton.disabled = room.status !== 'waiting' || room.playerCount >= room.maxPlayers;
        joinButton.onclick = () => joinRoom(room.roomId, room.hasPassword);
        item.appendChild(joinButton);

        roomList.appendChild(item);
    });
}

function renderRoomView(state) {
    currentGameState = state; // Store the latest state
    if (!state || !roomView) return;

    roomNameDisplay.textContent = state.roomName || '房间';
    roomStatusDisplay.textContent = `状态: ${state.status}`;
     isReady = false; // Reset local ready state on receiving new full state, rely on server truth


     // Clear previous player highlights and hands/info
     Object.values(playerAreas).forEach(area => {
         if(area){
            area.classList.remove('current-turn');
            const nameEl = area.querySelector('.playerName');
            const infoEl = area.querySelector('.playerInfo');
            const cardsEl = area.querySelector('.playerCards');
            if (nameEl) nameEl.textContent = '空位';
            if (infoEl) infoEl.textContent = '';
            if (cardsEl) cardsEl.innerHTML = '';
         }
     });
      centerPileArea.innerHTML = '';


    state.players.forEach(player => {
         const isMe = player.userId === myUserId;
         if (isMe) {
             isReady = player.isReady; // Update local ready state
         }
         // Find the correct player area based on the player's slot relative to self (assuming self is always bottom/slot 0 logic in CSS/HTML structure)
         // We need to know our own slot to map others correctly. Find self first.
         const myPlayer = state.players.find(p => p.userId === myUserId);
         if (!myPlayer) { console.error("Cannot find myself in player list!"); return; }
         const mySlot = myPlayer.slot;


         // Calculate relative slot difference
         let relativeSlot = (player.slot - mySlot + 4) % 4; // 0: bottom(self), 1: left, 2: top, 3: right

         // Map relative slot to area object key (assuming playerAreas keys match relative slots)
          // 0 -> 0 (Bottom - Self), 1 -> 1 (Left), 2 -> 2 (Top), 3 -> 3 (Right)
          // THIS MAPPING DEPENDS ON YOUR HTML/CSS playerAreas definition
         const targetArea = playerAreas[relativeSlot];


        if (targetArea) {
            const nameEl = targetArea.querySelector('.playerName');
            const infoEl = targetArea.querySelector('.playerInfo');
            const cardsEl = targetArea.querySelector('.playerCards');

            if (nameEl) nameEl.textContent = player.username + (isMe ? ' (你)' : '');
            if (infoEl) {
                 let infoText = `分数: ${player.score || 0}`;
                 if (state.status === 'waiting') {
                     infoText += player.connected ? (player.isReady ? ' <span class="ready">[已准备]</span>' : ' <span class="not-ready">[未准备]</span>') : ' <span class="disconnected">[已断线]</span>';
                 } else if (!player.connected) {
                      infoText += ' <span class="disconnected">[已断线]</span>';
                 }
                 infoEl.innerHTML = infoText;
            }

            if (cardsEl) {
                renderPlayerCards(cardsEl, player, isMe, state.status === 'playing' && state.currentPlayerId === myUserId);
            }

            // Highlight current player
            if (state.status === 'playing' && player.userId === state.currentPlayerId) {
                targetArea.classList.add('current-turn');
            } else {
                targetArea.classList.remove('current-turn');
            }

        } else {
            console.warn(`No player area found for relative slot: ${relativeSlot} (Player slot: ${player.slot}, My slot: ${mySlot})`);
        }
    });

     // Render center pile
     if (state.centerPile && state.centerPile.length > 0) {
         state.centerPile.forEach(cardData => {
             centerPileArea.appendChild(renderCard(cardData, false)); // Render center cards as visible
         });
     } else {
         centerPileArea.innerHTML = '-';
     }


    // Update room controls visibility/state
     if (state.status === 'waiting') {
         readyButton.style.display = 'inline-block';
         readyButton.textContent = isReady ? '取消准备' : '准备';
         readyButton.classList.toggle('ready', isReady); // Add 'ready' class if player is ready
         gameMessage.textContent = '等待所有玩家准备 (4人)...';
     } else if (state.status === 'playing') {
         readyButton.style.display = 'none';
         const currentPlayer = state.players.find(p => p.userId === state.currentPlayerId);
         gameMessage.textContent = currentPlayer
             ? (currentPlayer.userId === myUserId ? '轮到你出牌！' : `等待 ${currentPlayer.username} 出牌...`)
             : '游戏进行中...';
     } else if (state.status === 'finished') {
         readyButton.style.display = 'none';
         const winner = state.players.find(p => p.userId === currentGameState.winnerId); // Assuming winnerId is added to state
         gameMessage.textContent = `游戏结束！ ${winner ? winner.username + ' 获胜！' : ''}`;
         // TODO: Add 'New Game' button maybe?
     }

}


function renderPlayerCards(container, playerData, isMe, isMyTurn) {
    container.innerHTML = ''; // Clear previous cards

    if (isMe) {
        // Render own hand (visible cards)
        if (playerData.hand && playerData.hand.length > 0) {
            playerData.hand.forEach(cardData => {
                const cardElement = renderCard(cardData, false); // false = not hidden
                // Add click listener only if it's my turn and game is playing
                if (currentGameState.status === 'playing' && isMyTurn) {
                    cardElement.onclick = () => handleCardClick(cardData);
                } else {
                    cardElement.classList.add('disabled'); // Add class to style non-clickable cards
                }
                container.appendChild(cardElement);
            });
        } else {
             container.innerHTML = '- 空 -'; // Show if hand is empty
        }
    } else {
        // Render opponent's hand (hidden cards)
        if (playerData.handCount > 0) {
             // Show number of cards as text (optional)
             const countSpan = document.createElement('span');
             countSpan.textContent = `(${playerData.handCount} 张) `;
             container.appendChild(countSpan);
             // Render card backs
            for (let i = 0; i < playerData.handCount; i++) {
                container.appendChild(renderCard(null, true)); // true = hidden
            }
        } else {
             container.innerHTML = '- 空 -'; // Show if hand is empty
        }
    }
}

// Renders a single card element
function renderCard(cardData, isHidden) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');

    if (isHidden || !cardData) {
        cardDiv.classList.add('hidden');
    } else {
        // Visible card
        cardDiv.classList.add('visible');
        cardDiv.classList.add(getSuitClass(cardData.suit));

        const rankSpan = document.createElement('span');
        rankSpan.classList.add('rank');
        rankSpan.textContent = cardData.rank === 'T' ? '10' : cardData.rank; // Handle Ten
        cardDiv.appendChild(rankSpan);

        const suitSpan = document.createElement('span');
        suitSpan.classList.add('suit');
        suitSpan.textContent = getSuitSymbol(cardData.suit);
        cardDiv.appendChild(suitSpan);

        // Store card data on the element for click handler
        cardDiv.dataset.suit = cardData.suit;
        cardDiv.dataset.rank = cardData.rank;
    }
    return cardDiv;
}


// --- Event Handlers ---

function handleRegister() {
    const phone = regPhoneInput.value;
    const password = regPasswordInput.value;
    if (!phone || !password) {
        displayMessage(authMessage, '请输入手机号和密码。', true);
        return;
    }
    registerButton.disabled = true;
    socket.emit('register', { phoneNumber: phone, password }, (response) => {
        registerButton.disabled = false;
        displayMessage(authMessage, response.message, !response.success);
        if (response.success) {
            regPhoneInput.value = ''; // Clear form on success
            regPasswordInput.value = '';
        }
    });
}

function handleLogin() {
    const phone = loginPhoneInput.value;
    const password = loginPasswordInput.value;
    if (!phone || !password) {
        displayMessage(authMessage, '请输入手机号和密码。', true);
        return;
    }
    loginButton.disabled = true;
    socket.emit('login', { phoneNumber: phone, password }, (response) => {
        loginButton.disabled = false;
        displayMessage(authMessage, response.message, !response.success);
        if (response.success) {
            myUserId = response.userId;
            myUsername = response.username;
             if(lobbyUsername) lobbyUsername.textContent = myUsername;
            showView('lobbyView');
             // Request initial room list after login (server might also push it)
             socket.emit('listRooms', (rooms) => renderRoomList(rooms));

        }
    });
}

function handleCreateRoom() {
    const roomName = createRoomNameInput.value;
    const password = createRoomPasswordInput.value; // Empty string if not entered
     if (!roomName) {
          displayMessage(lobbyMessage, '请输入房间名称。', true);
          return;
     }

    createRoomButton.disabled = true;
    socket.emit('createRoom', { roomName, password: password || null }, (response) => {
        createRoomButton.disabled = false;
        displayMessage(lobbyMessage, response.message, !response.success);
        if (response.success) {
            currentRoomId = response.roomId;
            showView('roomView');
            renderRoomView(response.gameState); // Render initial room state
            createRoomNameInput.value = ''; // Clear form
            createRoomPasswordInput.value = '';
        }
    });
}

function joinRoom(roomId, needsPassword) {
    let password = null;
    if (needsPassword) {
        password = prompt(`房间 "${roomId}" 需要密码:` , ''); // Simple prompt
        if (password === null) return; // User cancelled
    }

    // Disable buttons while joining? Add loading indicator?
    displayMessage(lobbyMessage, `正在加入房间 ${roomId}...`);

    socket.emit('joinRoom', { roomId, password }, (response) => {
        displayMessage(lobbyMessage, response.message, !response.success);
        if (response.success) {
            currentRoomId = response.roomId;
            showView('roomView');
            renderRoomView(response.gameState);
        }
    });
}

function handleReadyClick() {
     if (!currentRoomId) return;
     const desiredReadyState = !isReady; // Toggle current state
     readyButton.disabled = true; // Prevent spamming

     socket.emit('playerReady', desiredReadyState, (response) => {
          readyButton.disabled = false; // Re-enable button
          if (response.success) {
               // The server will broadcast 'playerReadyUpdate', which triggers re-render
               // We don't need to manually update the button text here IF the broadcast is reliable
               // isReady = desiredReadyState; // Optimistic update (optional)
               // readyButton.textContent = isReady ? '取消准备' : '准备';
               // readyButton.classList.toggle('ready', isReady);
               console.log("Ready state change request sent.");
          } else {
               displayMessage(gameMessage, response.message || "无法改变准备状态。", true);
          }
     });
}

function handleCardClick(cardData) {
     if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing') return;
     if (currentGameState.currentPlayerId !== myUserId) {
          displayMessage(gameMessage, '现在不是你的回合。', true);
          return;
     }

     console.log('Clicked card:', cardData);
     // Disable UI temporarily? Show "playing..."?
     displayMessage(gameMessage, '正在出牌...');

     socket.emit('playCard', cardData, (response) => {
          // Callback indicates if the *request* was received and initially processed
          // The actual game state update comes via 'gameStateUpdate' broadcast
          if (!response.success) {
               displayMessage(gameMessage, response.message || '出牌失败。', true);
          } else {
               // Clear message, wait for gameStateUpdate
               displayMessage(gameMessage, '');
          }
     });
}

function handleLeaveRoom() {
    if (currentRoomId) {
        // TODO: Need a 'leaveRoom' event on server to handle this gracefully
        // For now, just disconnect and reconnect, or reload page?
        // A proper implementation would emit 'leaveRoom'
        // socket.emit('leaveRoom', currentRoomId, (response) => { ... });
        console.log("Leaving room (reloading page for simplicity)...");
        window.location.reload(); // Simplest way for now
        // After implementing 'leaveRoom' on server:
        // showView('lobbyView');
        // currentRoomId = null;
        // currentGameState = null;
        // socket.emit('listRooms', (rooms) => renderRoomList(rooms)); // Refresh lobby
    } else {
        // If somehow clicked while not in room, go to lobby
        showView('lobbyView');
    }
}


// --- Socket Event Listeners ---

socket.on('connect', () => {
    console.log('Connected to server! Socket ID:', socket.id);
    showView('loginRegisterView'); // Show login first
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    showView('loadingView'); // Show loading/disconnected message
    alert('与服务器断开连接: ' + reason + '\n请刷新页面重试。');
    // Reset state
    myUserId = null;
    myUsername = null;
    currentRoomId = null;
    currentGameState = null;
});

socket.on('roomListUpdate', (rooms) => {
    console.log('Received room list update:', rooms);
    if (currentView === 'lobby') {
        renderRoomList(rooms);
    }
});

// Server broadcasts when ANY player's ready state changes IN YOUR ROOM
socket.on('playerReadyUpdate', ({ userId, isReady }) => {
    console.log(`Player ${userId} ready status: ${isReady}`);
    if (currentGameState && currentView === 'room') {
        // Find player in current state and update their readiness
        const player = currentGameState.players.find(p => p.userId === userId);
        if (player) {
            player.isReady = isReady;
            // Re-render the specific player's info area or the whole view
            renderRoomView(currentGameState); // Re-rendering whole view is easier
        }
    }
});

 // Server broadcasts when a player joins YOUR room
 socket.on('playerJoined', (newPlayer) => {
     console.log('Player joined:', newPlayer);
     if (currentGameState && currentView === 'room') {
         // Add or update the player in the state and re-render
         const existingIndex = currentGameState.players.findIndex(p => p.userId === newPlayer.userId);
         if (existingIndex === -1) {
             currentGameState.players.push(newPlayer); // Add if truly new
         } else {
             currentGameState.players[existingIndex] = newPlayer; // Update if rejoining?
         }
         renderRoomView(currentGameState);
     }
 });

 // Server broadcasts when a player leaves/disconnects from YOUR room
 socket.on('playerLeft', ({ userId, username }) => {
     console.log(`Player left/disconnected: ${username} (${userId})`);
     if (currentGameState && currentView === 'room') {
         // Find player, mark as disconnected, and re-render
         const player = currentGameState.players.find(p => p.userId === userId);
         if (player) {
             player.connected = false;
             player.isReady = false; // Cannot be ready if disconnected
             renderRoomView(currentGameState);
         }
     }
 });

 socket.on('playerReconnected', ({ userId, username }) => {
     console.log(`Player reconnected: ${username} (${userId})`);
      if (currentGameState && currentView === 'room') {
         const player = currentGameState.players.find(p => p.userId === userId);
         if (player) {
             player.connected = true;
             // Re-request full state to ensure consistency? Or just re-render?
              socket.emit('requestGameState', (state) => {
                 if (state) renderRoomView(state);
             });
             // renderRoomView(currentGameState); // Re-render with connected status
         }
     }
 });


// Server broadcasts when the game starts IN YOUR ROOM
socket.on('gameStarted', (initialGameState) => {
    console.log('Game started!', initialGameState);
    if (currentView === 'room') {
        displayMessage(gameMessage, '游戏开始！');
        renderRoomView(initialGameState);
    }
});

// Server broadcasts game state updates (card played, turn change, etc.)
socket.on('gameStateUpdate', (newState) => {
    console.log('Received game state update.');//, newState); // Logging full state can be verbose
    if (currentView === 'room' && currentRoomId === newState.roomId) { // Ensure update is for current room
        renderRoomView(newState);
    }
});

// Server tells only YOU if your play was invalid
socket.on('invalidPlay', ({ message }) => {
    console.log('Invalid play:', message);
    displayMessage(gameMessage, `出牌无效: ${message}`, true);
    // Re-render the view to potentially re-enable the clicked card if needed?
    if(currentGameState) renderRoomView(currentGameState);
});

// Server broadcasts when the game ends IN YOUR ROOM
socket.on('gameOver', (results) => {
    console.log('Game over:', results);
     if (currentGameState && currentView === 'room') {
         currentGameState.status = 'finished'; // Update local status representation
         currentGameState.winnerId = results.winnerId; // Store winner if provided
         // You might receive final scores in results too
         renderRoomView(currentGameState); // Re-render to show final state/winner message
         displayMessage(gameMessage, results.reason || `游戏结束！ ${results.winnerId ? 'Winner: ' + results.winnerId : ''}`, false);
     }
});

socket.on('gameStartFailed', ({ message }) => {
     console.error('Game start failed:', message);
     if (currentView === 'room') {
          displayMessage(gameMessage, `游戏开始失败: ${message}`, true);
          // Players might need to re-ready, server should handle state reset
     }
});

socket.on('allPlayersResetReady', () => {
     console.log("Server requested reset of ready states.");
      if (currentGameState && currentView === 'room' && currentGameState.status === 'waiting') {
         currentGameState.players.forEach(p => p.isReady = false);
         renderRoomView(currentGameState);
     }
});


// --- Initial Setup ---

function initClient() {
    showView('loadingView'); // Start with loading

    // Attach event listeners to buttons etc.
    registerButton.addEventListener('click', handleRegister);
    loginButton.addEventListener('click', handleLogin);
    createRoomButton.addEventListener('click', handleCreateRoom);
    readyButton.addEventListener('click', handleReadyClick);
    leaveRoomButton.addEventListener('click', handleLeaveRoom);

    // Request initial room list when client loads (before login)
    // Server might deny or send limited info if not logged in
     // socket.emit('listRooms', (rooms) => renderRoomList(rooms)); // Moved to after login


    console.log('Client initialized.');
}

// Run init when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initClient);
