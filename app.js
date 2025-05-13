// app.js
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Game } = require('./server/game');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    pingInterval: 10000,
    pingTimeout: 5000,
});

const PORT = process.env.PORT || 3001;

console.log("--- [SERVER] Startup Configuration ---");
console.log("Initial process.env.PORT:", process.env.PORT);
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log(`Effective port chosen for listening: ${PORT}`);
console.log("------------------------------------");

app.use(express.static('public'));

let game = new Game();

io.on('connection', (socket) => {
    console.log(`[SERVER] Player connected: ${socket.id}`);

    const joinResult = game.addPlayer(socket.id);
    console.log(`[SERVER] Join result for ${socket.id}:`, joinResult);


    if (!joinResult.success) {
        socket.emit('game_error', { message: joinResult.message });
        // Consider if disconnecting here is always right, or if client should see "game full"
        // socket.disconnect(true); 
        return;
    }
    
    io.emit('player_list_update', game.getPlayerListInfo());
    broadcastGameState(socket.id); // Send full state to new player

    socket.emit('connection_ack', { playerId: socket.id, message: "Successfully connected to game server." });


    socket.on('startGame', () => {
        console.log(`[SERVER] startGame request from ${socket.id}`);
        // Use game's method to find player in slots
        const playerSlot = game.getPlayerById(socket.id); 
        
        if (!playerSlot || !playerSlot.connected) {
            socket.emit('game_error', {message: "You are not recognized as an active player in this game to start it."});
            console.log(`[SERVER] startGame denied for ${socket.id}: not found or not connected.`);
            return;
        }

        if (!game.isGameStarted) {
            const startResult = game.startGame();
            if (startResult.success) {
                console.log(`[SERVER] Game started by ${playerSlot.displayName} (${socket.id})`);
                io.emit('game_started', game.getGameStartInfo());
                broadcastFullGameStateToAll();
            } else {
                socket.emit('game_error', { message: startResult.message });
                 console.log(`[SERVER] startGame failed for ${socket.id}: ${startResult.message}`);
            }
        } else {
            socket.emit('game_error', { message: "Game has already started." });
            console.log(`[SERVER] startGame denied for ${socket.id}: game already started.`);
        }
    });

    socket.on('playCards', (cardIds) => {
        console.log(`[SERVER] playCards request from ${socket.id} with cards:`, cardIds);
        if (!game.isGameStarted) {
            socket.emit('game_error', { message: "Game has not started yet." });
            return;
        }
        const result = game.playTurn(socket.id, cardIds);
        if (result.success) {
            broadcastFullGameStateToAll();
            if (result.roundOver) {
                io.emit('round_over', { winner: result.winner, message: `Player ${result.winner} won the round!`});
                console.log(`[SERVER] Round over. Winner: ${result.winner}`);
            }
        } else {
            socket.emit('game_error', { message: result.message });
            console.log(`[SERVER] playCards failed for ${socket.id}: ${result.message}`);
        }
    });

    socket.on('passTurn', () => {
        console.log(`[SERVER] passTurn request from ${socket.id}`);
        if (!game.isGameStarted) {
            socket.emit('game_error', { message: "Game has not started yet." });
            return;
        }
        const result = game.passTurn(socket.id);
        if (result.success) {
            broadcastFullGameStateToAll();
        } else {
            socket.emit('game_error', { message: result.message });
            console.log(`[SERVER] passTurn failed for ${socket.id}: ${result.message}`);
        }
    });

    socket.on('requestNewGame', () => {
        console.log(`[SERVER] requestNewGame from ${socket.id}`);
        const playerSlot = game.getPlayerById(socket.id);
        if (!playerSlot || !playerSlot.connected) {
             socket.emit('game_error', {message: "Only active players can request a new game."});
             return;
        }

        if (game.isRoundOver || !game.isGameStarted) {
            console.log(`[SERVER] Player ${playerSlot.displayName} requested a new game. Resetting.`);
            game = new Game(); 
            const connectedSocketIds = Array.from(io.sockets.sockets.keys());
            connectedSocketIds.forEach(id => {
                const sock = io.sockets.sockets.get(id);
                if (sock && sock.connected) { // Check if socket still exists and is connected
                     game.addPlayer(id);
                }
            });
            io.emit('game_reset_for_new', { message: "A new game is being set up." });
            broadcastFullGameStateToAll();
        } else {
            socket.emit('game_error', {message: "Cannot start a new game while current round is active."});
        }
    });


    socket.on('disconnect', (reason) => {
        console.log(`[SERVER] Player disconnected: ${socket.id}. Reason: ${reason}`);
        const playerWhoLeft = game.getPlayerById(socket.id); // Get details before removing
        game.removePlayer(socket.id);

        io.emit('player_list_update', game.getPlayerListInfo());

        if (playerWhoLeft && playerWhoLeft.connected === false && game.isGameStarted) { // Check if player was marked disconnected by game.removePlayer
            broadcastFullGameStateToAll();
            if (game.players.filter(p => p.connected && p.hand.length > 0).length < 2 && game.playerSlots.some(s => s.playerId !== null)) {
                game.endGameDueToDisconnection();
                io.emit('game_ended_disconnect', { message: "Game ended: not enough players." });
                broadcastFullGameStateToAll();
                console.log(`[SERVER] Game ended due to disconnections after ${playerWhoLeft.displayName} left.`);
            }
        } else if (!game.isGameStarted && game.playerSlots.every(s => s.playerId === null || !s.connected)) {
            console.log("[SERVER] All players left or slots are empty before game start. Game instance is ready.");
            // If you want to fully reset to a "pristine" state if all players leave before start:
            // if (game.playerSlots.every(s => !s.connected)) {
            //     console.log("[SERVER] All players disconnected before start, creating fresh Game instance.");
            //     game = new Game();
            // }
        }
    });
});

function broadcastFullGameStateToAll() {
    if (!game || !game.playerSlots) {
        console.warn("[SERVER] broadcastFullGameStateToAll called but game or playerSlots is undefined.");
        return;
    }
    game.playerSlots.forEach(slot => {
        if (slot.playerId && slot.connected) {
            const Ksocket = io.sockets.sockets.get(slot.playerId);
            if (Ksocket) {
                Ksocket.emit('gameState', game.getGameStateForPlayer(slot.playerId));
            }
        }
    });
}

function broadcastGameState(targetSocketId = null) {
    if (!game || !game.playerSlots) {
         console.warn("[SERVER] broadcastGameState called but game or playerSlots is undefined.");
        return;
    }
    if (targetSocketId) {
        const Ksocket = io.sockets.sockets.get(targetSocketId);
        if (Ksocket) {
            Ksocket.emit('gameState', game.getGameStateForPlayer(targetSocketId));
        } else {
            // If target socket not found but we have a slot for them (e.g. they just disconnected)
            const slot = game.getPlayerById(targetSocketId);
            if (slot && !slot.connected) {
                console.log(`[SERVER] broadcastGameState: Target ${targetSocketId} (Player ${slot.displayName}) not found/disconnected. Not sending gameState.`);
            }
        }
    } else {
        broadcastFullGameStateToAll();
    }
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Server running and listening on 0.0.0.0:${PORT}`);
    console.log(`[SERVER] On production, access via your assigned domain/URL.`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM signal received: closing HTTP server');
  io.close(() => { // Close socket.io connections first
    console.log('[SERVER] Socket.IO connections closed.');
    server.close(() => {
        console.log('[SERVER] HTTP server closed');
        process.exit(0);
    });
  });
});
process.on('SIGINT', () => {
  console.log('[SERVER] SIGINT signal received (Ctrl+C): closing HTTP server');
  io.close(() => {
    console.log('[SERVER] Socket.IO connections closed.');
    server.close(() => {
        console.log('[SERVER] HTTP server closed');
        process.exit(0);
    });
  });
});
