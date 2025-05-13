const fs = require('fs');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const USERS_FILE = './users.json';
const saltRounds = 10; // bcrypt complexity
let users = {}; // In-memory user store

function loadUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            users = JSON.parse(data);
            console.log(`[AUTH] Loaded ${Object.keys(users).length} users from ${USERS_FILE}`);
        } else {
            console.log(`[AUTH] ${USERS_FILE} not found. Starting with empty user list.`);
            users = {};
        }
    } catch (e) {
        console.error('[AUTH] Error loading users:', e);
        users = {}; // Start fresh on error
    }
}

function saveUsers() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        // console.log(`[AUTH] Saved users to ${USERS_FILE}`); // Can be noisy
    } catch (e) {
        console.error('[AUTH] Error saving users:', e);
    }
}

function init(socket) {
    socket.on('register', async (data, callback) => {
        const { phoneNumber, password } = data;
        // Basic validation
        if (!phoneNumber || !password || typeof phoneNumber !== 'string' || typeof password !== 'string' || password.length < 4) {
            return callback({ success: false, message: '需要有效的手机号和至少4位密码。' });
        }
        if (users[phoneNumber]) {
            return callback({ success: false, message: '该手机号已被注册。' });
        }

        try {
            const passwordHash = await bcrypt.hash(password, saltRounds);
            const userId = uuidv4();
            const username = `用户${phoneNumber.slice(-4)}`; // Simple default username
            users[phoneNumber] = { userId, passwordHash, username };
            saveUsers(); // Save after successful registration
            console.log(`[AUTH] User registered: ${username} (${phoneNumber}), ID: ${userId}`);
            callback({ success: true, message: '注册成功！' }); // Don't auto-login, let user login explicitly
        } catch (error) {
            console.error('[AUTH] Registration error:', error);
            callback({ success: false, message: '注册过程中发生服务器错误。' });
        }
    });

    socket.on('login', async (data, callback) => {
        const { phoneNumber, password } = data;
        if (!phoneNumber || !password) {
            return callback({ success: false, message: '需要手机号和密码。' });
        }

        const userData = users[phoneNumber];
        if (!userData) {
            return callback({ success: false, message: '用户不存在或手机号错误。' });
        }

        try {
            const match = await bcrypt.compare(password, userData.passwordHash);
            if (match) {
                // Login successful - Associate user data with the socket
                socket.userId = userData.userId;
                socket.username = userData.username;
                console.log(`[AUTH] User logged in: ${socket.username} (ID: ${socket.userId}), Socket: ${socket.id}`);
                callback({ success: true, message: '登录成功！', userId: userData.userId, username: userData.username });
                // After login, maybe send room list again or trigger lobby view on client
                 // Let roomManager know the user is authenticated
                 const roomManager = require('./roomManager'); // Avoid circular dependency issues if possible
                 roomManager.handleAuthentication(socket);


            } else {
                callback({ success: false, message: '密码错误。' });
            }
        } catch (error) {
            console.error('[AUTH] Login error:', error);
            callback({ success: false, message: '登录过程中发生服务器错误。' });
        }
    });
}

module.exports = {
    init,
    loadUsers,
    saveUsers, // Export if needed elsewhere, e.g., for graceful shutdown
    // getUserById: (userId) => Object.values(users).find(u => u.userId === userId) // Helper if needed
};
