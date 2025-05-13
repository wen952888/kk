// app.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = 'path'; // Not actually used, can remove
const { Game } = require('./server/game');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let game = new Game([]); // Initialize with empty player list initially. Player IDs will be socket IDs.

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    const added = game.addPlayer(socket.id);
    if (!added) {
        socket.emit('game_error', { message: "Game is full or error joining." });
        socket.disconnect();
        return;
    }

    broadcastGameState();

    socket.on('startGame', () => {
        if (game.players.length === 4 && game.players.every(p=>p.connected) && !game.isGameStarted) { // Ensure 4 connected players
            if (game.players[0].id === socket.id) { // Only let the first connected player start (arbitrary)
                const started = game.startGame();
                if (started) {
                    broadcastGameState();
                } else {
                    socket.emit('game_error', { message: "Failed to start game." });
                }
            } else {
                socket.emit('game_error', { message: "Only the 'host' can start the game." });
            }
        } else {
            socket.emit('game_error', { message: "Need 4 connected players to start." });
        }
    });

    socket.on('playCards', (cardIds) => {
        if (!game.isGameStarted) {
            socket.emit('game_error', { message: "Game has not started yet."});
            return;
        }
        const result = game.playTurn(socket.id, cardIds);
        if (result.success) {
            broadcastGameState();
        } else {
            socket.emit('game_error', { message: result.message });
        }
    });

    socket.on('passTurn', () => {
         if (!game.isGameStarted) {
            socket.emit('game_error', { message: "Game has not started yet."});
            return;
        }
        const result = game.passTurn(socket.id);
        if (result.success) {
            broadcastGameState();
        } else {
            socket.emit('game_error', { message: result.message });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        game.removePlayer(socket.id);
        broadcastGameState(); // Update other players about disconnection

        // If all players disconnect, reset the game instance for new players
        if (game.players.every(p => !p.connected)) {
            console.log("All players disconnected, resetting game.");
            game = new Game([]);
        }
    });
});

function broadcastGameState() {
    if (!game || !game.players) return;
    game.players.forEach(player => {
        if (player.connected) { // Only send to connected players
            const Ksocket = io.sockets.sockets.get(player.id);
            if (Ksocket) {
                Ksocket.emit('gameState', game.getGameStateForPlayer(player.id));
            }
        }
    });
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
