const { Game } = require('./game');
const crypto = require('crypto');

let activeGames = {};
let ioInstance;

function generateRoomId() {
    return crypto.randomBytes(3).toString('hex');
}

function init(socket, io) {
    if (!ioInstance) ioInstance = io;

    // --- Create Room ---
    socket.on('createRoom', (data, callback) => {
        if (!socket.userId) return callback({ success: false, message: '请先登录。' });
        // ... (rest of createRoom logic from previous version) ...
        const { roomName, password } = data;
        if (!roomName || typeof roomName !== 'string' || roomName.trim().length === 0) {
            return callback({ success: false, message: '需要有效的房间名称。' });
        }
        if (password && (typeof password !== 'string' || password.length > 20)) {
            return callback({ success: false, message: '密码格式无效 (最多20字符)。' });
        }

        let roomId = generateRoomId();
        let attempts = 0;
        while(activeGames[roomId] && attempts < 5) { // Handle rare collisions
            roomId = generateRoomId();
            attempts++;
        }
        if (activeGames[roomId]) {
             console.error("[ROOM] Failed to generate unique Room ID after multiple attempts.");
             return callback({success: false, message: "创建房间失败，请稍后再试。"});
        }


        const game = new Game(roomId, 4);
        const newRoom = {
            roomId: roomId,
            roomName: roomName.trim(),
            password: password || null,
            creatorId: socket.userId,
            players: [],
            game: game,
            status: 'waiting'
        };

        activeGames[roomId] = newRoom;
        console.log(`[ROOM] Room created: "${newRoom.roomName}" (${roomId}) by ${socket.username}`);

        const joinResult = addPlayerToRoom(newRoom, socket);
        if (joinResult.success) {
            socket.join(roomId);
            socket.roomId = roomId;
            callback({ success: true, roomId: roomId, roomState: getRoomStateForPlayer(newRoom, socket.userId) }); // Send roomState
            broadcastRoomList();
        } else {
            delete activeGames[roomId];
            callback({ success: false, message: '创建房间后加入失败。' });
        }
    });

    // --- Join Room ---
    socket.on('joinRoom', (data, callback) => {
        if (!socket.userId) return callback({ success: false, message: '请先登录。' });
        // ... (rest of joinRoom logic from previous version, including reconnect check) ...
         const { roomId, password } = data;
         const room = activeGames[roomId];

         if (!room) return callback({ success: false, message: '房间不存在。' });

         // Reconnect check
         const existingPlayer = room.players.find(p => p.userId === socket.userId);
         if (existingPlayer) {
            if (!existingPlayer.connected) { // Only allow reconnect if marked disconnected
                console.log(`[ROOM] Player ${socket.username} rejoining room ${roomId}`);
                const reconnectResult = handleReconnect(socket, roomId); // Use the dedicated function
                if (reconnectResult.success) {
                    callback({ success: true, roomId: roomId, roomState: reconnectResult.roomState });
                } else {
                    callback({ success: false, message: reconnectResult.message });
                }
            } else {
                // Already connected in this room, maybe send current state?
                 console.log(`[ROOM] Player ${socket.username} already connected in room ${roomId}`);
                 callback({ success: true, roomId: roomId, roomState: getRoomStateForPlayer(room, socket.userId), message: "您已在此房间中。" });
            }
            return; // Stop further processing
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
             socket.to(roomId).emit('playerJoined', { ...joinResult.player, socketId: undefined }); // Don't broadcast socketId
             callback({ success: true, roomId: roomId, roomState: getRoomStateForPlayer(room, socket.userId) }); // Send roomState
             broadcastRoomList();
         } else {
             callback({ success: false, message: joinResult.message });
         }

    });

    // --- List Rooms ---
    socket.on('listRooms', (callback) => {
         if (typeof callback === 'function') {
            callback(getPublicRoomList());
         }
     });

    // --- Player Ready ---
    socket.on('playerReady', (isReady, callback) => {
        // ... (playerReady logic remains largely the same) ...
         if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。' });
         const room = activeGames[socket.roomId];
         if (!room) return callback({success: false, message: "房间信息丢失。"}); // Added check
         if (room.status !== 'waiting') return callback({ success: false, message: '不在等待中的房间内。' });

         const player = room.players.find(p => p.userId === socket.userId);
         if (!player) return callback({ success: false, message: '玩家数据异常。' });

         player.isReady = !!isReady;
         console.log(`[ROOM ${socket.roomId}] Player ${player.username} readiness updated: ${player.isReady}`);

         ioInstance.to(socket.roomId).emit('playerReadyUpdate', { userId: player.userId, isReady: player.isReady });
         checkAndStartGame(room);
         callback({ success: true });
    });

    // --- Play Card ---
    socket.on('playCard', (cards, callback) => {
        if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。'});
        const room = activeGames[socket.roomId];

        if (!room || room.status !== 'playing' || !room.game) {
            return callback({ success: false, message: '不在游戏中或游戏未开始。' });
        }
        // Basic validation of input structure
        if (!Array.isArray(cards)) {
             return callback({success: false, message: '无效的卡牌数据格式。'});
        }

        const game = room.game;
        const playResult = game.playCard(socket.userId, cards); // Pass cards array

        if (playResult.success) {
             console.log(`[GAME ${room.roomId}] Player ${socket.username} played cards. Type: ${playResult.handInfo?.type || 'N/A'}`);
             // Broadcast updated game state
             const newState = getRoomStateForPlayer(room, null, true); // Get full state for broadcast
             ioInstance.to(room.roomId).emit('gameStateUpdate', newState);

             // Check for game over condition signaled by playResult
             if (playResult.gameOver) {
                 console.log(`[GAME ${room.roomId}] Game over signaled by playCard.`);
                 room.status = 'finished';
                 // Send final result details
                 ioInstance.to(room.roomId).emit('gameOver', playResult.scoreResult);
                 broadcastRoomList();
             }

             callback({success: true});

        } else {
            console.log(`[GAME ${room.roomId}] Invalid play by ${socket.username}: ${playResult.message}`);
            socket.emit('invalidPlay', { message: playResult.message }); // Send error only to sender
            callback({success: false, message: playResult.message});
        }
    });

    // --- Pass Turn ---
    socket.on('passTurn', (callback) => {
        if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。'});
        const room = activeGames[socket.roomId];

        if (!room || room.status !== 'playing' || !room.game) {
            return callback({ success: false, message: '不在游戏中或游戏未开始。' });
        }

        const game = room.game;
        const passResult = game.handlePass(socket.userId); // Call game logic for pass

        if (passResult.success) {
            console.log(`[GAME ${room.roomId}] Player ${socket.username} passed.`);
            // Broadcast updated game state
            const newState = getRoomStateForPlayer(room, null, true);
            ioInstance.to(room.roomId).emit('gameStateUpdate', newState);
            callback({success: true});
        } else {
            console.log(`[GAME ${room.roomId}] Invalid pass by ${socket.username}: ${passResult.message}`);
            socket.emit('invalidPlay', { message: passResult.message }); // Use same event for feedback
            callback({success: false, message: passResult.message});
        }
    });

    // --- Request Hint ---
    socket.on('requestHint', (currentHintIndex, callback) => {
        if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。'});
        const room = activeGames[socket.roomId];

        if (!room || room.status !== 'playing' || !room.game) {
            return callback({ success: false, message: '不在游戏中或游戏未开始。' });
        }

        const game = room.game;
        const hintResult = game.findHint(socket.userId, currentHintIndex || 0); // Pass current index

        if (hintResult.success) {
            callback({ success: true, hint: hintResult.hint, nextHintIndex: hintResult.nextHintIndex });
        } else {
            callback({ success: false, message: hintResult.message });
        }
    });


    // --- Request Game State (e.g., after reconnect) ---
     socket.on('requestGameState', (callback) => {
         if (!socket.userId || !socket.roomId) return;
         const room = activeGames[socket.roomId];
         if (room && typeof callback === 'function') {
             callback(getRoomStateForPlayer(room, socket.userId));
         }
     });
}

// --- Helper Functions (addPlayerToRoom, checkAndStartGame etc.) ---

function addPlayerToRoom(room, socket) {
    if (room.players.length >= 4) return { success: false, message: "房间已满。" };
    const existingSlots = room.players.map(p => p.slot);
    let assignedSlot = -1;
    for (let i = 0; i < 4; i++) { if (!existingSlots.includes(i)) { assignedSlot = i; break; } }
    if (assignedSlot === -1) return { success: false, message: "无法找到可用位置。" };

    const playerInfo = {
        userId: socket.userId, username: socket.username, socketId: socket.id,
        isReady: false, slot: assignedSlot, connected: true
    };
    room.players.push(playerInfo);
    if (room.game) room.game.addPlayer(playerInfo.userId, playerInfo.username, playerInfo.slot);
    console.log(`[ROOM ${room.roomId}] Player ${playerInfo.username} assigned to slot ${assignedSlot}`);
    return { success: true, player: playerInfo };
}

function checkAndStartGame(room) {
    // ... (logic to check 4 connected & ready players remains the same) ...
     if (room.status !== 'waiting') return;
     const connectedPlayers = room.players.filter(p => p.connected);
     const readyPlayers = connectedPlayers.filter(p => p.isReady);

     if (connectedPlayers.length === 4 && readyPlayers.length === 4) {
         console.log(`[ROOM ${room.roomId}] All 4 connected players ready. Starting game...`);
         room.status = 'playing';
         const playerStartInfo = connectedPlayers.map(p => ({ id: p.userId, name: p.username, slot: p.slot }));
         const startResult = room.game.startGame(playerStartInfo); // Start game logic

         if (startResult.success) {
             const initialState = getRoomStateForPlayer(room, null, true);
             ioInstance.to(room.roomId).emit('gameStarted', initialState);
             console.log(`[GAME ${room.roomId}] Game started. First player determined by game rules.`);
             broadcastRoomList();
         } else {
             console.error(`[ROOM ${room.roomId}] Failed to start game internally: ${startResult.message}`);
             room.status = 'waiting';
             ioInstance.to(room.roomId).emit('gameStartFailed', { message: startResult.message || "服务器内部错误导致游戏启动失败。" });
             room.players.forEach(p => p.isReady = false);
             ioInstance.to(room.roomId).emit('allPlayersResetReady');
         }
     }
}

function getRoomStateForPlayer(room, requestingUserId, isGameUpdate = false) {
    // ... (logic to get combined room/game state remains the same) ...
     const gameState = room.game ? room.game.getStateForPlayer(requestingUserId) : null;
     const combinedPlayers = room.players.map(roomPlayer => {
         const gamePlayer = gameState ? gameState.players.find(gp => gp.id === roomPlayer.userId) : null;
         return {
             userId: roomPlayer.userId, username: roomPlayer.username, slot: roomPlayer.slot,
             isReady: roomPlayer.isReady, connected: roomPlayer.connected,
             // Game data
             score: gamePlayer ? gamePlayer.score : 0, // Use internal accumulated score
             hand: gamePlayer ? gamePlayer.hand : (requestingUserId === roomPlayer.userId ? [] : undefined),
             handCount: gamePlayer ? gamePlayer.handCount : 0,
             isCurrentPlayer: gameState ? gameState.currentPlayerId === roomPlayer.userId : false,
             role: gamePlayer ? gamePlayer.role : null, // Add role if available in gamePlayer state
             finished: gamePlayer ? gamePlayer.finished : false // Add finished status
         };
     });

     return {
         roomId: room.roomId, roomName: room.roomName, status: room.status,
         players: combinedPlayers,
         // Game state specifics
         centerPile: gameState?.centerPile ?? [],
         lastHandType: gameState?.lastHandType ?? null,
         currentPlayerId: gameState?.currentPlayerId ?? null,
         isFirstTurn: gameState?.isFirstTurn ?? false, // Include if game sends it
         myUserId: requestingUserId,
         gameMode: room.game ? room.game.gameMode : null // Include game mode
     };
}

// --- Disconnect and Reconnect Handling ---
function handleDisconnect(socket) {
    // ... (disconnect logic remains largely the same, marks player disconnected) ...
     const roomId = socket.roomId;
     if (!roomId || !activeGames[roomId]) return;
     const room = activeGames[roomId];
     const player = room.players.find(p => p.socketId === socket.id); // Find by current socketId

     if (!player) return;

     console.log(`[ROOM ${roomId}] Player ${player.username} (ID: ${player.userId}) disconnected.`);
     player.connected = false;
     player.isReady = false;

     socket.to(roomId).emit('playerLeft', { userId: player.userId, username: player.username });

     if (room.status === 'playing' && room.game) {
         room.game.markPlayerConnected(player.userId, false); // Inform game logic
         const remainingConnected = room.players.filter(p => p.connected).length;
         if (remainingConnected < 2 && room.game.gameStarted && !room.game.gameFinished) { // Ensure game started but not finished
             console.log(`[GAME ${roomId}] Not enough players remaining. Ending game due to disconnect.`);
             room.status = 'finished';
             const scoreResult = room.game.endGame('Not enough players'); // Trigger end game
             ioInstance.to(roomId).emit('gameOver', scoreResult || { reason: 'Not enough players connected.' }); // Send results or reason
             broadcastRoomList(); // Update lobby
             // Consider cleanup timer here
         } else {
             // Check if disconnected player was current player
             if (room.game.currentPlayerId === player.userId && !room.game.gameFinished) {
                 room.game.nextTurn(true); // Force advance turn
                 const newState = getRoomStateForPlayer(room, null, true);
                 ioInstance.to(room.roomId).emit('gameStateUpdate', newState);
             }
         }
     }

     // Check if room needs cleanup (optional timer logic)
     const allDisconnected = room.players.every(p => !p.connected);
     if (allDisconnected && room.players.length > 0) {
          console.log(`[ROOM ${roomId}] All players disconnected. Room "${room.roomName}" marked for potential cleanup.`);
          // setTimeout(() => cleanupEmptyRoom(roomId), 60000);
     } else {
          broadcastRoomList(); // Update player count in lobby
     }
}

function findRoomByUserId(userId) {
    // ... (logic remains the same) ...
     for (const roomId in activeGames) {
         const room = activeGames[roomId];
         // Look for players previously connected or currently connected (for safety)
         if (room.players.some(p => p.userId === userId)) {
             return room;
         }
     }
     return null;
}

function handleReconnect(socket, roomId) {
    // ... (logic remains the same) ...
      const room = activeGames[roomId];
      if (!room) return { success: false, message: '尝试重连的房间已不存在。' };

      const player = room.players.find(p => p.userId === socket.userId);
      if (!player) return { success: false, message: '玩家数据异常。' };

      player.socketId = socket.id;
      player.connected = true;
      console.log(`[RECONNECT ${roomId}] Player ${player.username} reconnected with new socket ${socket.id}`);

      if (room.game && room.status === 'playing') {
          room.game.markPlayerConnected(socket.userId, true);
      }

      socket.join(roomId);
      socket.roomId = roomId;
      socket.to(roomId).emit('playerReconnected', { userId: player.userId, username: player.username });
      return { success: true, roomState: getRoomStateForPlayer(room, socket.userId) };
}


// --- Lobby Broadcasting ---
function getPublicRoomList() {
    // ... (logic remains the same) ...
      return Object.values(activeGames).map(room => ({
         roomId: room.roomId, roomName: room.roomName,
         playerCount: room.players.filter(p => p.connected).length,
         maxPlayers: 4, status: room.status, hasPassword: !!room.password
     }));
}
function broadcastRoomList() {
    if (ioInstance) {
        ioInstance.emit('roomListUpdate', getPublicRoomList());
    }
}
function handleAuthentication(socket) { // Called after login/reauth
    socket.emit('roomListUpdate', getPublicRoomList());
}


module.exports = {
    init,
    handleDisconnect,
    handleAuthentication,
    getPublicRoomList,
    findRoomByUserId,
    handleReconnect
};
