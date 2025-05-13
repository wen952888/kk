const { Game } = require('./game');
const crypto = require('crypto');

let activeGames = {}; // Stores active rooms: { roomId: roomData }
let ioInstance; // To store the io object for broadcasting

function generateRoomId() {
    return crypto.randomBytes(3).toString('hex'); // Shorter 6-char ID
}

function init(socket, io) {
    if (!ioInstance) ioInstance = io; // Store io instance

    socket.on('createRoom', (data, callback) => {
        if (!socket.userId) return callback({ success: false, message: '请先登录。' });

        const { roomName, password } = data;
        if (!roomName || typeof roomName !== 'string' || roomName.trim().length === 0) {
            return callback({ success: false, message: '需要有效的房间名称。' });
        }
        // Basic password validation (optional)
        if (password && (typeof password !== 'string' || password.length > 20)) {
            return callback({ success: false, message: '密码格式无效 (最多20字符)。' });
        }


        const roomId = generateRoomId();
        // Ensure unique ID (highly unlikely collision with 6 hex chars, but good practice)
        if (activeGames[roomId]) {
            console.warn("[ROOM] Room ID collision, generating again.");
            return createRoom(data, callback); // Recursive call (use with caution or implement loop)
        }

        const game = new Game(roomId, 4); // Max 4 players
        const newRoom = {
            roomId: roomId,
            roomName: roomName.trim(),
            password: password || null, // Store null if no password
            creatorId: socket.userId,
            players: [], // Player list: { userId, username, socketId, isReady, slot }
            game: game,
            status: 'waiting' // 'waiting', 'playing', 'finished'
        };

        activeGames[roomId] = newRoom;
        console.log(`[ROOM] Room created: "${newRoom.roomName}" (${roomId}) by ${socket.username}`);

        // Automatically add creator to the room
        const joinResult = addPlayerToRoom(newRoom, socket);
        if (joinResult.success) {
            socket.join(roomId);
            socket.roomId = roomId; // Store room ID on socket for quick lookup
            callback({ success: true, roomId: roomId, gameState: getRoomStateForPlayer(newRoom, socket.userId) });
            broadcastRoomList(); // Update lobby for everyone
        } else {
            // Should not fail here unless addPlayerToRoom logic is flawed
            delete activeGames[roomId]; // Clean up failed room
            callback({ success: false, message: '创建房间后加入失败。' });
        }
    });

    socket.on('joinRoom', (data, callback) => {
        if (!socket.userId) return callback({ success: false, message: '请先登录。' });

        const { roomId, password } = data;
        const room = activeGames[roomId];

        if (!room) return callback({ success: false, message: '房间不存在。' });

        // Check if user is already in THIS room (e.g., reconnect)
        const existingPlayer = room.players.find(p => p.userId === socket.userId);
        if (existingPlayer) {
            // Reconnect logic
            console.log(`[ROOM] Player ${socket.username} rejoining room ${roomId}`);
            existingPlayer.socketId = socket.id; // Update socket ID
             existingPlayer.connected = true; // Mark as connected again
            if (room.game && room.status === 'playing') {
                room.game.markPlayerConnected(socket.userId, true);
            }
            socket.join(roomId);
            socket.roomId = roomId;
            callback({ success: true, roomId: roomId, gameState: getRoomStateForPlayer(room, socket.userId) });
             // Notify others of reconnect? Optional.
             socket.to(roomId).emit('playerReconnected', { userId: socket.userId, username: socket.username });
            return;
        }

        // New join checks
        if (room.status !== 'waiting') return callback({ success: false, message: '游戏已开始或已结束，无法加入。' });
        if (room.players.length >= 4) return callback({ success: false, message: '房间已满。' });
        if (room.password && room.password !== password) return callback({ success: false, message: '房间密码错误。' });

        // Add player to room
        const joinResult = addPlayerToRoom(room, socket);
        if (joinResult.success) {
            socket.join(roomId);
            socket.roomId = roomId;
            console.log(`[ROOM] Player ${socket.username} joined room "${room.roomName}" (${roomId})`);
            // Notify everyone in the room (including sender for consistency? No, use callback)
             socket.to(roomId).emit('playerJoined', joinResult.player); // Send new player info
             // Send full state to the joining player via callback
            callback({ success: true, roomId: roomId, gameState: getRoomStateForPlayer(room, socket.userId) });
            broadcastRoomList(); // Update lobby
        } else {
            callback({ success: false, message: joinResult.message });
        }
    });

     socket.on('listRooms', (callback) => {
         // Allow listing rooms even if not logged in, but filter sensitive data
         if (typeof callback === 'function') {
            callback(getPublicRoomList());
         }
     });


    socket.on('playerReady', (isReady, callback) => {
        if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。' });
        const room = activeGames[socket.roomId];
        if (!room || room.status !== 'waiting') return callback({ success: false, message: '不在等待中的房间内。' });

        const player = room.players.find(p => p.userId === socket.userId);
        if (!player) return callback({ success: false, message: '玩家数据异常。' });

        player.isReady = !!isReady; // Ensure boolean
        console.log(`[ROOM ${socket.roomId}] Player ${player.username} readiness updated: ${player.isReady}`);

        // Broadcast the change to everyone in the room
        ioInstance.to(socket.roomId).emit('playerReadyUpdate', { userId: player.userId, isReady: player.isReady });

        // Check if game should start
        checkAndStartGame(room);

        callback({ success: true });
    });

    socket.on('playCard', (cardData, callback) => {
        if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。'});
        const room = activeGames[socket.roomId];

        if (!room || room.status !== 'playing' || !room.game) {
            return callback({ success: false, message: '不在游戏中或游戏未开始。' });
        }
        if (!cardData || typeof cardData.suit !== 'string' || typeof cardData.rank !== 'string') {
             return callback({ success: false, message: '无效的卡牌数据。'});
        }


        const game = room.game;
        const playResult = game.playCard(socket.userId, cardData);

        if (playResult.success) {
            console.log(`[GAME ${room.roomId}] Player ${socket.username} played ${cardData.rank}${cardData.suit}`);
            // Broadcast updated game state to everyone in the room
             const newState = getRoomStateForPlayer(room, null, true); // Get full state for broadcast
            ioInstance.to(room.roomId).emit('gameStateUpdate', newState);

            // Check for win condition immediately after successful play
            if (playResult.winnerId) {
                 console.log(`[GAME ${room.roomId}] Player ${playResult.winnerId} won!`);
                 room.status = 'finished'; // Mark room as finished
                 // TODO: Implement scoring and proper game over sequence
                 ioInstance.to(room.roomId).emit('gameOver', { winnerId: playResult.winnerId, /* scores: ... */ });
                 broadcastRoomList(); // Update lobby status
                 // Consider adding a "new game" button or auto-cleanup
            }

             callback({success: true}); // Acknowledge successful play

        } else {
            console.log(`[GAME ${room.roomId}] Invalid play by ${socket.username}: ${playResult.message}`);
            // Send error message *only* to the player who made the invalid move
            socket.emit('invalidPlay', { message: playResult.message });
            callback({success: false, message: playResult.message});
        }
    });

     socket.on('requestGameState', (callback) => {
         if (!socket.userId || !socket.roomId) return;
         const room = activeGames[socket.roomId];
         if (room) {
            if (typeof callback === 'function') {
                 callback(getRoomStateForPlayer(room, socket.userId));
            }
         }
     });
}

// Called after user successfully logs in
function handleAuthentication(socket) {
    // Send the current room list now that the user is authenticated
    socket.emit('roomListUpdate', getPublicRoomList());
}


function addPlayerToRoom(room, socket) {
    if (room.players.length >= 4) {
        return { success: false, message: "房间已满。" };
    }
    // Find the first empty slot (0-3)
    const existingSlots = room.players.map(p => p.slot);
    let assignedSlot = -1;
    for (let i = 0; i < 4; i++) {
        if (!existingSlots.includes(i)) {
            assignedSlot = i;
            break;
        }
    }

    if (assignedSlot === -1) {
        // This should theoretically not happen if length < 4
        console.error(`[ROOM ${room.roomId}] No available slot found, but player count is ${room.players.length}`);
        return { success: false, message: "无法找到可用位置。" };
    }

    const playerInfo = {
        userId: socket.userId,
        username: socket.username,
        socketId: socket.id,
        isReady: false, // Default to not ready
        slot: assignedSlot,
         connected: true // Mark as connected
    };
    room.players.push(playerInfo);

    // Also add player to the game instance if it exists
    if (room.game) {
        room.game.addPlayer(playerInfo.userId, playerInfo.username, playerInfo.slot);
    }


    console.log(`[ROOM ${room.roomId}] Player ${playerInfo.username} assigned to slot ${assignedSlot}`);
    return { success: true, player: playerInfo };
}

function checkAndStartGame(room) {
    if (room.status !== 'waiting') return;

    const connectedPlayers = room.players.filter(p => p.connected); // Only consider connected players for starting
    const readyPlayers = connectedPlayers.filter(p => p.isReady);

    // Game starts if exactly 4 *connected* players are present and *all* of them are ready
    if (connectedPlayers.length === 4 && readyPlayers.length === 4) {
        console.log(`[ROOM ${room.roomId}] All 4 connected players ready. Starting game...`);
        room.status = 'playing';

        // Get player info needed by the game instance
        const playerStartInfo = connectedPlayers.map(p => ({
             id: p.userId,
             name: p.username,
             slot: p.slot
         }));

        // Start the actual game logic
        const startResult = room.game.startGame(playerStartInfo);

        if (startResult.success) {
            // Broadcast game started event with initial state
             const initialState = getRoomStateForPlayer(room, null, true); // Get full initial state
            ioInstance.to(room.roomId).emit('gameStarted', initialState);
            console.log(`[GAME ${room.roomId}] Game started. First player: ${room.game.players[room.game.currentPlayerIndex]?.name}`);
            broadcastRoomList(); // Update lobby status
        } else {
            // Handle game start failure (e.g., internal error)
            console.error(`[ROOM ${room.roomId}] Failed to start game internally: ${startResult.message}`);
            room.status = 'waiting'; // Revert status
            // Notify players
            ioInstance.to(room.roomId).emit('gameStartFailed', { message: startResult.message || "服务器内部错误导致游戏启动失败。" });
            // Optionally reset ready status
            room.players.forEach(p => p.isReady = false);
             ioInstance.to(room.roomId).emit('allPlayersResetReady');
        }
    } else {
         // Optional: Log why game didn't start
         // console.log(`[ROOM ${room.roomId}] Game not starting. Connected: ${connectedPlayers.length}, Ready: ${readyPlayers.length}`);
    }
}

// Generates the state of a room/game from the perspective of a specific player
// If requestingUserId is null, generates a public/broadcast state (hiding all hands)
// If isGameUpdate is true, it means the game state itself changed (card played, turn changed)
function getRoomStateForPlayer(room, requestingUserId, isGameUpdate = false) {
    const gameState = room.game ? room.game.getStateForPlayer(requestingUserId) : null;

    // Combine room player info (like readiness) with game player info (like hand count/cards)
    const combinedPlayers = room.players.map(roomPlayer => {
        const gamePlayer = gameState ? gameState.players.find(gp => gp.id === roomPlayer.userId) : null;
        return {
            userId: roomPlayer.userId,
            username: roomPlayer.username,
            slot: roomPlayer.slot,
            isReady: roomPlayer.isReady, // From room data
            connected: roomPlayer.connected, // From room data (updated on disconnect)
            // Game data (if available)
            score: gamePlayer ? gamePlayer.score : 0,
            hand: gamePlayer ? gamePlayer.hand : (requestingUserId === roomPlayer.userId ? [] : undefined), // Use gamePlayer's hand logic
            handCount: gamePlayer ? gamePlayer.handCount : 0, // Use gamePlayer's hand logic
            isCurrentPlayer: gameState ? gameState.currentPlayerId === roomPlayer.userId : false
        };
    });


    return {
        roomId: room.roomId,
        roomName: room.roomName,
        status: room.status,
        players: combinedPlayers,
        // Include game-specific state only if game is running or just started/ended
        centerPile: (gameState && room.status !== 'waiting') ? gameState.centerPile : [],
        currentPlayerId: (gameState && room.status === 'playing') ? gameState.currentPlayerId : null,
        myUserId: requestingUserId // Tell client who they are in the list
    };
}


function handleDisconnect(socket) {
    const roomId = socket.roomId;
    if (!roomId || !activeGames[roomId]) {
        // console.log(`[DISCO] Socket ${socket.id} was not in an active room.`);
        return;
    }

    const room = activeGames[roomId];
    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);

    if (playerIndex === -1) {
        // console.log(`[DISCO] Socket ${socket.id} was in room ${roomId} but player data not found?`);
        return;
    }

    const player = room.players[playerIndex];
    console.log(`[ROOM ${roomId}] Player ${player.username} (ID: ${player.userId}) disconnected.`);

     // Mark player as disconnected in the room list
     player.connected = false;
     player.isReady = false; // Disconnected players are not ready

    // Notify others in the room
     // Use userId so client can find the player regardless of socketId change on reconnect
    socket.to(roomId).emit('playerLeft', { userId: player.userId, username: player.username });


    // If game was in progress, update the game instance
    if (room.status === 'playing' && room.game) {
        room.game.markPlayerConnected(player.userId, false);

         // Check if game needs to end due to disconnection
         const remainingConnected = room.players.filter(p => p.connected).length;
         console.log(`[GAME ${roomId}] Remaining connected players: ${remainingConnected}`);
         if (remainingConnected < 2) { // Or your game's minimum player rule
             console.log(`[GAME ${roomId}] Not enough players remaining. Ending game.`);
             room.status = 'finished'; // Or 'aborted'
             room.game.endGame('Not enough players'); // Implement endGame in Game class
             ioInstance.to(roomId).emit('gameOver', { reason: 'Not enough players connected.' });
             // Optional: Clean up room after a delay?
         } else {
             // If the disconnected player was the current player, advance the turn
             if (room.game.currentPlayerId === player.userId) {
                 room.game.nextTurn(true); // Force advance turn, skipping the disconnected player
                 // Broadcast the updated state because the current player changed
                 const newState = getRoomStateForPlayer(room, null, true);
                 ioInstance.to(room.roomId).emit('gameStateUpdate', newState);
             }
         }
    }


    // Clean up player slot? No, keep slot for potential reconnect. Mark as disconnected.
    // Instead of removing: room.players.splice(playerIndex, 1);


    // Check if room is now effectively empty (all players disconnected)
     const allDisconnected = room.players.every(p => !p.connected);
    if (allDisconnected && room.players.length > 0) { // Don't delete instantly if someone might rejoin
        console.log(`[ROOM ${roomId}] All players disconnected. Room "${room.roomName}" marked for potential cleanup.`);
        // Optionally add a timer to delete the room if no one reconnects
        // setTimeout(() => cleanupEmptyRoom(roomId), 60000); // Example: 1 minute timer
    } else if (room.players.filter(p=>p.connected).length === 0) {
         console.log(`[ROOM ${roomId}] Room is truly empty. Deleting room "${room.roomName}".`);
         delete activeGames[roomId];
         broadcastRoomList(); // Update lobby since a room was removed
    } else {
         // Room still has connected players, just update the lobby count/status potentially
         broadcastRoomList();
    }
}

// Function to generate a public list of rooms for the lobby
function getPublicRoomList() {
    return Object.values(activeGames).map(room => ({
        roomId: room.roomId,
        roomName: room.roomName,
        playerCount: room.players.filter(p => p.connected).length, // Count only connected
        maxPlayers: 4, // Assuming always 4 for this game
        status: room.status,
        hasPassword: !!room.password // True if password is not null/empty
    }));
}

// Broadcasts the updated public room list to all connected sockets
// NOTE: This sends to *everyone*. In a larger app, you might only send to sockets in the 'lobby' state.
function broadcastRoomList() {
    if (ioInstance) {
        ioInstance.emit('roomListUpdate', getPublicRoomList());
         // console.log("[SERVER] Broadcasted room list update.");
    }
}

module.exports = {
    init,
    handleDisconnect,
    handleAuthentication,
    getPublicRoomList // Export for initial sending if needed
};
