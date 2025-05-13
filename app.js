// app.js

// 首先加载 .env 文件中的环境变量
// 这样 process.env 就会被 .env 文件中的值填充（如果存在）
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
// const path = require('path'); // 如果您确实需要 path 模块，请取消注释
const { Game } = require('./server/game'); // 确保路径正确

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 确定监听端口的逻辑：
// 1. 优先使用 serv00 (或类似PaaS平台) 通过环境变量注入的 PORT。
// 2. 如果平台没有注入 PORT，则尝试使用 .env 文件中定义的 PORT (通过 dotenv 加载)。
// 3. 如果以上两者都没有，则使用一个备用端口 (例如 3001，避免与常见的 3000 冲突，但仍需注意权限)。
//    对于在 serv00 SSH 中直接运行，如果 .env 不存在或未配置 PORT，
//    并且平台 PORT 环境变量在此 SSH 会话中不可用，则备用端口可能仍会导致 EPERM。
//    最佳实践是在 .env 中为本地/SSH 测试明确指定一个高位端口。
constFALLBACK_PORT = 3001; // 一个备用端口
const ENV_PORT = process.env.PORT; // 从环境或 .env 文件获取

let portToUse;
if (ENV_PORT) {
    portToUse = parseInt(ENV_PORT, 10);
    if (isNaN(portToUse)) {
        console.warn(`Warning: Environment PORT "${ENV_PORT}" is not a valid number. Falling back to ${FALLBACK_PORT}.`);
        portToUse = FALLBACK_PORT;
    }
} else {
    console.log(`Info: process.env.PORT not set. Falling back to default port ${FALLBACK_PORT}. Ensure .env is configured for local/SSH or platform provides PORT.`);
    portToUse = FALLBACK_PORT;
}

const PORT = portToUse;


// --- 日志记录环境变量和端口 ---
console.log("--- Startup Configuration ---");
console.log("Initial process.env.PORT (from env or .env):", process.env.PORT); // dotenv 会修改 process.env
console.log("NODE_ENV (from env or .env):", process.env.NODE_ENV);
console.log(`Effective port chosen for listening: ${PORT}`);
console.log("-----------------------------");
// --- 结束日志记录 ---


app.use(express.static('public')); // 确保 'public' 目录存在且包含静态文件

let game = new Game([]); // 初始化游戏实例

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    const added = game.addPlayer(socket.id);
    if (!added) {
        socket.emit('game_error', { message: "Game is full or error joining." });
        socket.disconnect();
        return;
    }

    broadcastGameState(); // 广播给所有玩家，包括新加入的

    socket.on('startGame', () => {
        if (!game.isGameStarted) {
            // 简化：允许任何已连接的玩家尝试启动（在真实游戏中可能需要更严格的控制）
            // if (game.players[0] && game.players[0].id === socket.id) { // 原来的逻辑：只允许第一个玩家启动
            if (game.players.length >= 2 && game.players.length <= 4) { //  锄大地通常是4人，但为了测试方便，允许2-4人
                 const started = game.startGame();
                if (started) {
                    broadcastGameState();
                } else {
                    socket.emit('game_error', { message: "Failed to start game. (Not enough players or already started)" });
                }
            } else {
                 socket.emit('game_error', { message: "Need 2-4 connected players to start." });
            }
        } else {
             socket.emit('game_error', { message: "Game has already started." });
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
        broadcastGameState(); // 更新其他玩家关于断开连接的信息

        if (game.players.every(p => !p.connected) && game.players.length > 0) { // 检查是否所有“曾经加入”的玩家都断开了
            console.log("All players disconnected, resetting game instance.");
            game = new Game([]); // 为新玩家重置游戏实例
        }
    });
});

function broadcastGameState() {
    if (!game || !game.players) return;
    game.players.forEach(player => {
        if (player.connected) {
            const Ksocket = io.sockets.sockets.get(player.id);
            if (Ksocket) {
                Ksocket.emit('gameState', game.getGameStateForPlayer(player.id));
            }
        }
    });
}

server.listen(PORT, '0.0.0.0', () => { // 明确监听所有接口
    console.log(`Server running and listening on 0.0.0.0:${PORT}`);
    if (process.env.NODE_ENV !== 'production') {
        // 对于本地开发，您可以通过 localhost 或 127.0.0.1 访问
        console.log(`For local development, access via http://localhost:${PORT} or http://127.0.0.1:${PORT}`);
    }
    // 在 serv00 上，实际访问 URL 将由平台反向代理提供
    console.log("On serv00, access the game via your assigned domain/URL.");
});

// 优雅地处理服务器关闭（可选，但良好实践）
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    // 在这里可以添加其他清理逻辑，比如关闭数据库连接等
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
