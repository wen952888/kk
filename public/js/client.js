// public/js/client.js
const socket = io();

const myHandDiv = document.getElementById('my-hand');
const lastPlayedHandDiv = document.getElementById('last-played-hand');
const lastPlayedInfoP = document.getElementById('last-played-info');
const opponentHandsDiv = document.getElementById('opponent-hands');
const playButton = document.getElementById('play-button');
const passButton = document.getElementById('pass-button');
const myIdSpan = document.getElementById('my-id');
const gameStatusP = document.getElementById('game-status');
const logListUl = document.getElementById('log-list');
const startGameButton = document.getElementById('start-game-button');
const errorMessageDiv = document.getElementById('error-message');

let selectedCards = [];
let myPlayerId = null;

function renderCard(card, isSelectable = false) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card');
    cardDiv.style.backgroundImage = `url('/images/cards/${card.image}')`;
    cardDiv.dataset.cardId = card.id;

    if (isSelectable) {
        cardDiv.addEventListener('click', () => {
            cardDiv.classList.toggle('selected');
            if (cardDiv.classList.contains('selected')) {
                selectedCards.push(card.id);
            } else {
                selectedCards = selectedCards.filter(id => id !== card.id);
            }
            // console.log("Selected:", selectedCards);
        });
    }
    return cardDiv;
}

function renderHand(hand) {
    myHandDiv.innerHTML = '';
    selectedCards = []; // Clear selection on re-render
    hand.forEach(card => {
        myHandDiv.appendChild(renderCard(card, true));
    });
}

function renderLastPlayedHand(cards, type) {
    lastPlayedHandDiv.innerHTML = '';
    if (cards && cards.length > 0) {
        cards.forEach(card => {
            lastPlayedHandDiv.appendChild(renderCard(card, false));
        });
        lastPlayedInfoP.textContent = `Type: ${type || 'N/A'}`;
    } else {
        lastPlayedInfoP.textContent = 'Table is clear.';
    }
}

function renderOpponents(players, myId, currentPlayerId, lastPlayerId) {
    opponentHandsDiv.innerHTML = '';
    players.forEach(player => {
        if (player.id === myId) return;

        const opponentDiv = document.createElement('div');
        opponentDiv.classList.add('opponent-player');
        if (player.isTurn) {
            opponentDiv.classList.add('current-turn');
        }
        if(player.hasPassed) {
            opponentDiv.classList.add('passed');
        }
        if (!player.isConnected) {
            opponentDiv.style.opacity = '0.5';
            opponentDiv.innerHTML = `<h3>Player ${player.id.substring(0,5)} (Disconnected)</h3>`;
        } else {
            opponentDiv.innerHTML = `
                <h3>Player ${player.id.substring(0,5)} ${player.isTurn ? ' (Turn)' : ''} ${player.id === lastPlayerId ? ' (Last Play)' : ''}</h3>
                <p>Cards: ${player.cardCount}</p>
                <div class="card-area opponent-card-display">
                    ${Array(player.cardCount).fill(0).map(() => `<div class="card" style="background-image: url('/images/cards/back.png');"></div>`).join('')}
                </div>
            `;
        }
        opponentHandsDiv.appendChild(opponentDiv);
    });
}

function updateGameLog(logs) {
    logListUl.innerHTML = '';
    logs.forEach(log => {
        const li = document.createElement('li');
        li.textContent = log;
        logListUl.appendChild(li);
    });
}


socket.on('gameState', (state) => {
    // console.log("Received game state:", state);
    myPlayerId = state.myId;
    myIdSpan.textContent = `Your ID: ${myPlayerId.substring(0,5)}`;

    renderHand(state.myHand);
    renderLastPlayedHand(state.lastPlayedHand, state.lastPlayedHandType);
    renderOpponents(state.players, state.myId, state.players.find(p=>p.isTurn)?.id, state.lastPlayerWhoPlayed);
    updateGameLog(state.gameLog);

    playButton.disabled = !state.isMyTurn;
    passButton.disabled = !state.isMyTurn || !state.lastPlayedHand || state.lastPlayedHand.length === 0;

    if (state.isRoundOver) {
        gameStatusP.textContent = `Round Over! Winner: ${state.winner.substring(0,5)}`;
        playButton.disabled = true;
        passButton.disabled = true;
        startGameButton.style.display = 'block'; // Allow starting a new game
        startGameButton.disabled = false;
        startGameButton.textContent = "Start New Game";

    } else if (state.isGameStarted) {
        const currentPlayer = state.players.find(p => p.isTurn);
        gameStatusP.textContent = currentPlayer ? `Current Turn: Player ${currentPlayer.id.substring(0,5)}` : "Waiting...";
        startGameButton.style.display = 'none';
    } else {
        gameStatusP.textContent = `Waiting for players... (${state.players.filter(p=>p.connected).length}/4)`;
        startGameButton.style.display = 'block';
        startGameButton.disabled = !state.canStartGame;
        startGameButton.textContent = `Start Game (${state.players.filter(p=>p.connected).length}/4)`;
    }
     errorMessageDiv.textContent = ''; // Clear previous errors
});

socket.on('game_error', (error) => {
    console.error("Game Error:", error.message);
    errorMessageDiv.textContent = `Error: ${error.message}`;
    // Optionally re-enable buttons if error was like "not your turn" but state didn't change
    // This depends on the specific error and game flow.
});


playButton.addEventListener('click', () => {
    if (selectedCards.length > 0) {
        socket.emit('playCards', selectedCards);
        // Client-side selection should be cleared after attempting to play,
        // or upon receiving new game state. It's cleared in renderHand.
    } else {
        errorMessageDiv.textContent = "Please select cards to play.";
    }
});

passButton.addEventListener('click', () => {
    socket.emit('passTurn');
});

startGameButton.addEventListener('click', () => {
    socket.emit('startGame');
    startGameButton.disabled = true; // Prevent multiple clicks
});

// Initial message
gameStatusP.textContent = "Connecting to server...";
