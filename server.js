const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const authManager = require('./authManager');
const roomManager = require('./roomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 34709; // Use environment variable or default

console.log("--- [SERVER] Startup Configuration ---");
console.log(`Initial process.env.PORT: ${process.env.PORT}`);
const nodeEnv = process.env.NODE_ENV || 'development';
console.log(`NODE_ENV: ${nodeEnv}`);
console.log(`Effective port chosen for listening: ${PORT}`);
console.log("------------------------------------");


// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Load user data on startup
authManager.loadUsers();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`[SERVER] Client connected: ${socket.id}`);

    // Initialize managers for this socket connection
    authManager.init(socket);
    roomManager.init(socket, io); // Pass io to roomManager for broadcasting

    // Handle disconnection
    socket.on('disconnect', (reason) => {
        console.log(`[SERVER] Client disconnected: ${socket.id}. Reason: ${reason}`);
        roomManager.handleDisconnect(socket); // Let roomManager handle cleanup
    });

     socket.emit('roomListUpdate', roomManager.getPublicRoomList());
});

// Start the server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Server running and listening on 0.0.0.0:${PORT}`);
    if (nodeEnv === 'production') {
         console.log(`[SERVER] On production, access via your assigned domain/URL.`);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('[SERVER] Shutting down...');
    server.close(() => {
        console.log('[SERVER] Server closed.');
        process.exit(0);
    });
});
