// app.js
require('dotenv').config(); // Load .env file first

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Game } = require('./server/game');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    pingInterval: 10000, // Send a ping every 10 seconds
    pingTimeout: 5000,   // Wait 5 seconds for a pong, then disconnect
    // cors: { origin: "*" } // 如果客户端和服务器不同源，可能需要配置 CORS
});

const PORT = process.env.PORT || 3001; // Fallback port

console.log("--- Startup Configuration ---");
console.log("Initial process.env.PORT:", process.env.PORT);
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log(`Effective port chosen for listening: ${PORT}`);
console.log("-----------------------------");

app.use(express.static('public'));

let game = new Game(); // Initialize a single game instance

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    const joinResult = game.addPlayer(socket.id);

    if (!joinResult.success) {
        socket.emit('game_error', { message: joinResult.message });
        // Consider not disconnecting immediately, let client decide or show message
        // socket.disconnect(true);
        return;
    }
    // Announce new player or reconnected player
    io.emit('player_list_update', game.getPlayerListInfo()); // Send updated player list to all
    broadcastGameState(socket.id); // Send full state to new player, partial to others if needed

    socket.emit('connection_ack', { playerId: socket.id, message: "Successfully connected to game server." });


    socket.on('startGame', () => {
        if (!game.isGameStarted) {
            // Simplification: let any connected player try to start
            // More robust: check if socket.id is a current player, and if enough players
            const player = game.players.find(p => p.id === socket.id && p.connected);
            if (!player) {
                socket.emit('game_error', {message: "You are not part of this game to start it."});
                return;
            }

            const startResult = game.startGame();
            if (startResult.success) {
                console.log("Game started by", socket.id);
                io.emit('game_started', game.getGameStartInfo()); // Announce game start
                broadcastFullGameStateToAll();
            } else {
                socket.emit('game_error', { message: startResult.message });
            }
        } else {
            socket.emit('game_error', { message: "Game has already started." });
        }
    });

    socket.on('playCards', (cardIds) => {
        if (!game.isGameStarted) {
            socket.emit('game_error', { message: "Game has not started yet." });
            return;
        }
        const result = game.playTurn(socket.id, cardIds);
        if (result.success) {
            broadcastFullGameStateToAll();
            if (result.roundOver) {
                io.emit('round_over', { winner: result.winner, message: `Player ${result.winner} won the round!`});
                // Here you could reset for a new round or end game. For now, it just announces.
                // game.resetForNewRound(); // Example
                // broadcastFullGameStateToAll();
            }
        } else {
            socket.emit('game_error', { message: result.message });
        }
    });

    socket.on('passTurn', () => {
        if (!game.isGameStarted) {
            socket.emit('game_error', { message: "Game has not started yet." });
            return;
        }
        const result = game.passTurn(socket.id);
        if (result.success) {
            broadcastFullGameStateToAll();
        } else {
            socket.emit('game_error', { message: result.message });
        }
    });

    socket.on('requestNewGame', () => { // Client wants to start a new game after one finished
        if (game.isRoundOver || !game.isGameStarted) { // Allow new game if round is over or not started
            console.log(`Player ${socket.id} requested a new game.`);
            game = new Game(); // Reset to a fresh game instance
            // Re-add all currently connected sockets as players to the new game
            const connectedSocketIds = Array.from(io.sockets.sockets.keys());
            connectedSocketIds.forEach(id => {
                if (io.sockets.sockets.get(id)) { // Check if socket still exists
                     game.addPlayer(id); // Add them to the new game
                }
            });
            io.emit('game_reset_for_new', { message: "A new game is being set up." });
            broadcastFullGameStateToAll();
        } else {
            socket.emit('game_error', {message: "Cannot start a new game while current round is active."});
        }
    });


    socket.on('disconnect', (reason) => {
        console.log(`Player disconnected: ${socket.id}. Reason: ${reason}`);
        const playerWhoLeft = game.getPlayerById(socket.id);
        game.removePlayer(socket.id);

        io.emit('player_list_update', game.getPlayerListInfo()); // Update player list for all

        if (playerWhoLeft && game.isGameStarted) {
            // If game was started and a player leaves, broadcast updated state
            broadcastFullGameStateToAll();
            // Check if game can continue
            if (game.players.filter(p => p.connected && p.hand.length > 0).length < 2 && game.players.length > 0) { // Assuming min 2 players
                game.endGameDueToDisconnection();
                io.emit('game_ended_disconnect', { message: "Game ended due to too many disconnections." });
                broadcastFullGameStateToAll(); // Send final state
            }
        } else if (!game.isGameStarted && game.players.length === 0 && game.playerSlots.every(s => s.playerId === null)) {
            // If game wasn't started and all player slots are now empty (everyone left before start)
            // This state is fine, game instance is ready for new players.
            // No need to create `new Game()` here unless specific reset logic is needed.
            console.log("All players left before game start. Game instance ready for new players.");
        }
    });
});

// Broadcasts the full game state to each player, tailored for them
function broadcastFullGameStateToAll() {
    if (!game || !game.playerSlots) return;
    game.playerSlots.forEach(slot => {
        if (slot.playerId && slot.connected) {
            const Ksocket = io.sockets.sockets.get(slot.playerId);
            if (Ksocket) {
                Ksocket.emit('gameState', game.getGameStateForPlayer(slot.playerId));
            }
        }
    });
     // If there are spectators, you might send a generic state to them
}

// Broadcasts tailored game state, can be specific to one or all
function broadcastGameState(targetSocketId = null) {
    if (!game || !game.playerSlots) return;
    if (targetSocketId) {
        const Ksocket = io.sockets.sockets.get(targetSocketId);
        if (Ksocket) {
            Ksocket.emit('gameState', game.getGameStateForPlayer(targetSocketId));
        }
    } else {
        broadcastFullGameStateToAll();
    }
}


server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running and listening on 0.0.0.0:${PORT}`);
    console.log(`On production, access via your assigned domain/URL.`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server (Ctrl+C)');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
