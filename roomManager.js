// roomManager.js
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
        const { roomName, password } = data;
        if (!roomName || typeof roomName !== 'string' || roomName.trim().length === 0) {
            return callback({ success: false, message: '需要有效的房间名称。' });
        }
        if (password && (typeof password !== 'string' || password.length > 20)) {
            return callback({ success: false, message: '密码格式无效 (最多20字符)。' });
        }

        let roomId = generateRoomId();
        let attempts = 0;
        while(activeGames[roomId] && attempts < 5) {
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
            callback({ success: true, roomId: roomId, roomState: getRoomStateForPlayer(newRoom, socket.userId) });
            broadcastRoomList();
        } else {
            delete activeGames[roomId];
            callback({ success: false, message: '创建房间后加入失败。' });
        }
    });

    // --- Join Room ---
    socket.on('joinRoom', (data, callback) => {
        if (!socket.userId) return callback({ success: false, message: '请先登录。' });
         const { roomId, password } = data;
         const room = activeGames[roomId];

         if (!room) return callback({ success: false, message: '房间不存在。' });

         const existingPlayer = room.players.find(p => p.userId === socket.userId);
         if (existingPlayer) {
            if (!existingPlayer.connected) {
                console.log(`[ROOM] Player ${socket.username} rejoining room ${roomId}`);
                const reconnectResult = handleReconnect(socket, roomId);
                if (reconnectResult.success) {
                    callback({ success: true, roomId: roomId, roomState: reconnectResult.roomState });
                } else {
                    callback({ success: false, message: reconnectResult.message });
                }
            } else {
                 console.log(`[ROOM] Player ${socket.username} already connected in room ${roomId}`);
                 callback({ success: true, roomId: roomId, roomState: getRoomStateForPlayer(room, socket.userId), message: "您已在此房间中。" });
            }
            return;
         }

         if (room.status !== 'waiting') return callback({ success: false, message: '游戏已开始或已结束，无法加入。' });
         if (room.players.length >= 4) return callback({ success: false, message: '房间已满。' });
         if (room.password && room.password !== password) return callback({ success: false, message: '房间密码错误。' });

         const joinResult = addPlayerToRoom(room, socket);
         if (joinResult.success) {
             socket.join(roomId);
             socket.roomId = roomId;
             console.log(`[ROOM] Player ${socket.username} joined room "${room.roomName}" (${roomId})`);
             socket.to(roomId).emit('playerJoined', { ...joinResult.player, socketId: undefined });
             callback({ success: true, roomId: roomId, roomState: getRoomStateForPlayer(room, socket.userId) });
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
         if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。' });
         const room = activeGames[socket.roomId];
         if (!room) return callback({success: false, message: "房间信息丢失。"});
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
        if (!room || room.status !== 'playing' || !room.game) return callback({ success: false, message: '不在游戏中或游戏未开始。' });
        if (!Array.isArray(cards)) return callback({success: false, message: '无效的卡牌数据格式。'});

        const game = room.game;
        const playResult = game.playCard(socket.userId, cards);

        if (playResult.success) {
             console.log(`[GAME ${room.roomId}] Player ${socket.username} played cards. Type: ${playResult.handInfo?.type || 'N/A'}`);
             const newState = getRoomStateForPlayer(room, null, true);
             ioInstance.to(room.roomId).emit('gameStateUpdate', newState);
             if (playResult.gameOver) {
                 console.log(`[GAME ${room.roomId}] Game over signaled by playCard.`);
                 room.status = 'finished';
                 ioInstance.to(room.roomId).emit('gameOver', playResult.scoreResult);
                 broadcastRoomList();
             }
             callback({success: true});
        } else {
            console.log(`[GAME ${room.roomId}] Invalid play by ${socket.username}: ${playResult.message}`);
            socket.emit('invalidPlay', { message: playResult.message });
            callback({success: false, message: playResult.message});
        }
    });

    // --- Pass Turn ---
    socket.on('passTurn', (callback) => {
        if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。'});
        const room = activeGames[socket.roomId];
        if (!room || room.status !== 'playing' || !room.game) return callback({ success: false, message: '不在游戏中或游戏未开始。' });

        const game = room.game;
        const passResult = game.handlePass(socket.userId);

        if (passResult.success) {
            console.log(`[GAME ${room.roomId}] Player ${socket.username} passed.`);
            const newState = getRoomStateForPlayer(room, null, true);
            ioInstance.to(room.roomId).emit('gameStateUpdate', newState);
            callback({success: true});
        } else {
            console.log(`[GAME ${room.roomId}] Invalid pass by ${socket.username}: ${passResult.message}`);
            socket.emit('invalidPlay', { message: passResult.message });
            callback({success: false, message: passResult.message});
        }
    });

    // --- Request Hint ---
    socket.on('requestHint', (currentHintIndex, callback) => {
        if (!socket.userId || !socket.roomId) return callback({ success: false, message: '无效操作。'});
        const room = activeGames[socket.roomId];
        if (!room || room.status !== 'playing' || !room.game) return callback({ success: false, message: '不在游戏中或游戏未开始。' });

        const game = room.game;
        const hintResult = game.findHint(socket.userId, currentHintIndex || 0);

        if (hintResult.success) {
            callback({ success: true, hint: hintResult.hint, nextHintIndex: hintResult.nextHintIndex });
        } else {
            callback({ success: false, message: hintResult.message });
        }
    });

    // --- Leave Room ---
    socket.on('leaveRoom', (callback) => {
        if (!socket.userId || !socket.roomId) {
            console.log(`[LEAVE ROOM] Invalid attempt: No userId or roomId for socket ${socket.id}`);
            // If socket.roomId was somehow cleared but user thinks they are in a room
            if (typeof callback === 'function') callback({ success: true, message: '您已不在房间中。' });
            return;
        }

        const roomId = socket.roomId;
        const room = activeGames[roomId];

        if (!room) {
            console.log(`[LEAVE ROOM] Room ${roomId} not found for user ${socket.username} (socket ${socket.id}).`);
            delete socket.roomId; // Clean up stale roomId on socket
            if (typeof callback === 'function') callback({ success: true, message: '房间已不存在或您已离开。' });
            return;
        }

        const playerIndex = room.players.findIndex(p => p.userId === socket.userId);

        if (playerIndex === -1) {
            console.log(`[LEAVE ROOM] User ${socket.username} not found in room ${roomId} player list.`);
            delete socket.roomId; // Clean up
            if (typeof callback === 'function') callback({ success: true, message: '您当前不在此房间的玩家列表中。' });
            return;
        }

        const player = room.players[playerIndex];
        console.log(`[ROOM ${roomId}] Player ${player.username} (ID: ${player.userId}) is leaving room "${room.roomName}".`);

        // Remove player from room.players array
        room.players.splice(playerIndex, 1);

        // If game was in progress, inform game instance
        if (room.game && (room.status === 'playing' || room.status === 'waiting' && room.game.gameStarted)) { // Also handle if game started but room is waiting for some reason
            room.game.removePlayer(player.userId); // This should mark player as disconnected in game

            // Check if game needs to end
            const activePlayersInGame = room.game.players.filter(p => p.connected && !p.finished).length;
            if (activePlayersInGame < 2 && room.game.gameStarted && !room.game.gameFinished) {
                console.log(`[GAME ${roomId}] Game ending due to player leaving. Remaining active: ${activePlayersInGame}`);
                room.status = 'finished';
                const scoreResult = room.game.endGame('有玩家离开，游戏结束');
                ioInstance.to(roomId).emit('gameOver', scoreResult || { reason: '有玩家离开，游戏结束。' });
            } else if (!room.game.gameFinished) {
                if (room.game.currentPlayerId === player.userId) { // If leaving player was current
                    room.game.nextTurn(true); // Force next turn
                }
                 // Always broadcast state update as player list changed
                 // or current player might have changed
                const newState = getRoomStateForPlayer(room, null, true);
                ioInstance.to(roomId).emit('gameStateUpdate', newState);
            }
        }

        // Notify other players in the room
        socket.to(roomId).emit('playerLeft', { userId: player.userId, username: player.username });

        // Make socket leave the Socket.IO room
        socket.leave(roomId);
        console.log(`[SOCKET] Socket ${socket.id} left Socket.IO room ${roomId}`);
        delete socket.roomId; // Clear roomId from socket

        // If room is empty, delete it
        if (room.players.length === 0) {
            console.log(`[ROOM ${roomId}] Room "${room.roomName}" is empty. Deleting.`);
            delete activeGames[roomId];
        }

        broadcastRoomList(); // Update lobby for everyone

        if (typeof callback === 'function') callback({ success: true, message: '已成功离开房间。' });
    });


    // --- Request Game State ---
     socket.on('requestGameState', (callback) => {
         if (!socket.userId || !socket.roomId) return;
         const room = activeGames[socket.roomId];
         if (room && typeof callback === 'function') {
             callback(getRoomStateForPlayer(room, socket.userId));
         }
     });
}

// --- Helper Functions ---
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

// --- MODIFICATION START ---
function checkAndStartGame(room) {
     if (room.status !== 'waiting') return;
     const connectedPlayers = room.players.filter(p => p.connected);
     const readyPlayers = connectedPlayers.filter(p => p.isReady);

     if (connectedPlayers.length === 4 && readyPlayers.length === 4) {
         console.log(`[ROOM ${room.roomId}] All 4 connected players ready. Starting game...`);
         room.status = 'playing';
         const playerStartInfo = connectedPlayers.map(p => ({ id: p.userId, name: p.username, slot: p.slot }));
         const startResult = room.game.startGame(playerStartInfo);

         if (startResult.success) {
             console.log(`[GAME ${room.roomId}] Game started successfully. Broadcasting personalized gameStarted events.`);
             // Send personalized game state to each player
             room.players.forEach(playerInRoom => {
                 if (playerInRoom.connected && playerInRoom.socketId) { // Ensure player is still connected and has a socketId
                     const playerSocket = ioInstance.sockets.sockets.get(playerInRoom.socketId);
                     if (playerSocket) {
                         const initialStateForPlayer = getRoomStateForPlayer(room, playerInRoom.userId, true);
                         playerSocket.emit('gameStarted', initialStateForPlayer);
                         console.log(`[GAME ${room.roomId}] Sent gameStarted to ${playerInRoom.username} (ID: ${playerInRoom.userId})`);
                     } else {
                         console.warn(`[GAME ${room.roomId}] Could not find socket for player ${playerInRoom.username} (ID: ${playerInRoom.userId}, SocketID: ${playerInRoom.socketId}) to send gameStarted event.`);
                     }
                 } else {
                      console.log(`[GAME ${room.roomId}] Player ${playerInRoom.username} (ID: ${playerInRoom.userId}) is not connected or has no socketId, skipping gameStarted event.`);
                 }
             });
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
// --- MODIFICATION END ---

function getRoomStateForPlayer(room, requestingUserId, isGameUpdate = false) {
     const gameState = room.game ? room.game.getStateForPlayer(requestingUserId) : null;
     const combinedPlayers = room.players.map(roomPlayer => {
         const gamePlayer = gameState ? gameState.players.find(gp => gp.id === roomPlayer.userId) : null;
         return {
             userId: roomPlayer.userId, username: roomPlayer.username, slot: roomPlayer.slot,
             isReady: roomPlayer.isReady, connected: roomPlayer.connected,
             score: gamePlayer ? gamePlayer.score : 0,
             hand: gamePlayer ? gamePlayer.hand : (requestingUserId === roomPlayer.userId ? [] : undefined),
             handCount: gamePlayer ? gamePlayer.handCount : (roomPlayer.connected ? (gamePlayer?.handCount ?? 0) : 0), // Show 0 if disconnected for non-self
             isCurrentPlayer: gameState ? gameState.currentPlayerId === roomPlayer.userId : false,
             role: gamePlayer ? gamePlayer.role : null,
             finished: gamePlayer ? gamePlayer.finished : false
         };
     });

     return {
         roomId: room.roomId, roomName: room.roomName, status: room.status,
         players: combinedPlayers,
         centerPile: gameState?.centerPile ?? [],
         lastHandInfo: gameState?.lastHandInfo ?? null, // Changed from lastHandType to full info
         currentPlayerId: gameState?.currentPlayerId ?? null,
         isFirstTurn: gameState?.isFirstTurn ?? false,
         myUserId: requestingUserId,
         gameMode: room.game ? room.game.gameMode : null
     };
}

// --- Disconnect and Reconnect Handling ---
function handleDisconnect(socket) {
     const roomId = socket.roomId; // Get roomId stored on socket during join/create
     if (!roomId) {
        //  console.log(`[DISCO] Socket ${socket.id} disconnected, was not in a room.`);
         return;
     }

     const room = activeGames[roomId];
     if (!room) {
         console.log(`[DISCO] Socket ${socket.id} disconnected, room ${roomId} no longer active.`);
         delete socket.roomId; // Clean up stale roomId
         return;
     }

     const player = room.players.find(p => p.socketId === socket.id);
     if (!player) {
         console.log(`[DISCO] Socket ${socket.id} was in room ${roomId} but player not found by socketId.`);
         // This can happen if player reconnected with a new socket already
         // Or if player was removed due to leaving
         delete socket.roomId;
         return;
     }

     console.log(`[ROOM ${roomId}] Player ${player.username} (ID: ${player.userId}) disconnected via socket ${socket.id}.`);
     player.connected = false;
     player.isReady = false;

     ioInstance.to(roomId).emit('playerLeft', { userId: player.userId, username: player.username });

     if (room.game && (room.status === 'playing' || (room.status === 'waiting' && room.game.gameStarted))) {
         room.game.markPlayerConnected(player.userId, false);
         const activePlayersInGame = room.game.players.filter(p => p.connected && !p.finished).length;

         if (activePlayersInGame < 2 && room.game.gameStarted && !room.game.gameFinished) {
             console.log(`[GAME ${roomId}] Game ending due to disconnect. Remaining active: ${activePlayersInGame}`);
             room.status = 'finished';
             const scoreResult = room.game.endGame('有玩家断线，游戏结束');
             ioInstance.to(roomId).emit('gameOver', scoreResult || { reason: '有玩家断线，游戏结束。' });
         } else if (!room.game.gameFinished) {
             if (room.game.currentPlayerId === player.userId) {
                 room.game.nextTurn(true);
             }
             // Broadcast updated state (player disconnected, turn might have changed)
             const newState = getRoomStateForPlayer(room, null, true);
             ioInstance.to(room.roomId).emit('gameStateUpdate', newState);
         }
     }

     // Check if room should be deleted
     const stillConnectedPlayersInRoom = room.players.filter(p => p.connected).length;
     if (stillConnectedPlayersInRoom === 0 && room.players.length > 0) { // Check if room had players and all are now disconnected
         console.log(`[ROOM ${roomId}] All players in room "${room.roomName}" are disconnected. Deleting room.`);
         delete activeGames[roomId];
     } else if (room.players.length === 0) { // Or if the player list is truly empty after a leave
          console.log(`[ROOM ${roomId}] Room "${room.roomName}" is empty. Deleting.`);
          delete activeGames[roomId];
     }


     broadcastRoomList();
     delete socket.roomId; // Clean up after processing
}

function findRoomByUserId(userId) {
     for (const roomId in activeGames) {
         const room = activeGames[roomId];
         if (room.players.some(p => p.userId === userId)) {
             return room;
         }
     }
     return null;
}

function handleReconnect(socket, roomId) {
      const room = activeGames[roomId];
      if (!room) return { success: false, message: '尝试重连的房间已不存在。' };

      const player = room.players.find(p => p.userId === socket.userId);
      if (!player) return { success: false, message: '玩家数据异常。' };

      // If player was already marked as connected with a different socket, log it
      if (player.connected && player.socketId !== socket.id) {
          console.warn(`[RECONNECT ${roomId}] Player ${player.username} already connected with socket ${player.socketId}. Updating to ${socket.id}.`);
          // Optionally, disconnect the old socket if it's still somehow alive
          // const oldSocket = ioInstance.sockets.sockets.get(player.socketId);
          // if (oldSocket) oldSocket.disconnect(true);
      }

      player.socketId = socket.id;
      player.connected = true;
      // Player's ready status should persist if they were ready before disconnect.
      // If a game was in progress, their hand also persists.
      console.log(`[RECONNECT ${roomId}] Player ${player.username} reconnected with new socket ${socket.id}`);

      if (room.game && room.status === 'playing') {
          room.game.markPlayerConnected(socket.userId, true);
      }

      socket.join(roomId);
      socket.roomId = roomId;
      // Send a specific event for reconnected player so client can update UI without full re-render if desired
      socket.to(roomId).emit('playerReconnected', { userId: player.userId, username: player.username, slot: player.slot, isReady: player.isReady });
      return { success: true, roomState: getRoomStateForPlayer(room, socket.userId) };
}

function getPublicRoomList() {
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
function handleAuthentication(socket) {
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
