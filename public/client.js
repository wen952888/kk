// public/client.js
const socket = io({
    reconnectionAttempts: 5,
    reconnectionDelay: 3000
});

// State Variables
let currentView = 'loading';
let myUserId = null;
let myUsername = null;
let currentRoomId = null;
let currentGameState = null;
let previousGameState = null;
let isReadyForGame = false;
let selectedCards = [];
let currentSortMode = 'rank';
let currentHint = null;
let currentHintCycleIndex = 0;

// DOM Elements
const loadingView = document.getElementById('loadingView');
const loginRegisterView = document.getElementById('loginRegisterView');
const lobbyView = document.getElementById('lobbyView');
const roomView = document.getElementById('roomView');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const views = { loadingView, loginRegisterView, lobbyView, roomView, gameOverOverlay };

// ... (其他DOM元素定义保持不变)...

// 新增优化函数开始
function calculateCardOverlap() {
    const screenWidth = window.innerWidth;
    if (screenWidth >= 1400) return { margin: '-15vw', width: 150, height: 210 };
    if (screenWidth >= 1000) return { margin: '-18vw', width: 130, height: 182 };
    if (screenWidth >= 800) return { margin: '-22vw', width: 120, height: 168 };
    if (screenWidth >= 600) return { margin: '-25vw', width: 110, height: 154 };
    if (screenWidth >= 400) return { margin: '-28vw', width: 90, height: 126 };
    return { margin: '-30vw', width: 80, height: 112 };
}

function dynamicCardLayout() {
    const cards = document.querySelectorAll('#myHand.myHand .card');
    if (!cards.length) return;

    const { margin, width, height } = calculateCardOverlap();
    
    cards.forEach(card => {
        card.style.marginLeft = margin;
        card.style.width = `${width}px`;
        card.style.height = `${height}px`;
    });
}
// 新增优化函数结束

// renderPlayerCards函数
function renderPlayerCards(containerParam, playerData, isMe, isMyTurnAndPlaying) {
    let targetContainer;
    
    if (isMe) {
        targetContainer = document.getElementById('myHand');
        if (!targetContainer) {
            console.error("[DEBUG] renderPlayerCards: #myHand NOT FOUND!");
            return;
        }
        targetContainer.innerHTML = '';
        
        if (playerData.finished) {
            targetContainer.innerHTML = '<span style="color:#888; font-style:italic;">已出完</span>';
            return;
        }

        if (!Array.isArray(playerData.hand) {
            console.warn("[DEBUG] Invalid hand data:", playerData.hand);
            return;
        }

        // 动态布局核心逻辑开始
        const { margin, width, height } = calculateCardOverlap();
        let sortedHand = [...playerData.hand];
        
        if (currentSortMode === 'rank') {
            sortedHand.sort(compareSingleCardsClient);
        } else {
            sortedHand.sort(compareBySuitThenRank);
        }

        sortedHand.forEach((cardData, index) => {
            const cardElement = renderCard(cardData, false, false);
            cardElement.style.marginLeft = margin;
            cardElement.style.width = `${width}px`;
            cardElement.style.height = `${height}px`;
            
            const isSelected = selectedCards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);
            const isHinted = currentHint?.cards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);
            
            if (isSelected) cardElement.classList.add('selected');
            if (isHinted) cardElement.classList.add('hinted');
            
            if (isMyTurnAndPlaying) {
                cardElement.onclick = () => toggleCardSelection(cardData, cardElement);
            } else {
                cardElement.classList.add('disabled');
            }
            
            targetContainer.appendChild(cardElement);
        });
        // 动态布局核心逻辑结束

    } else {
        // ... (对手牌渲染逻辑保持不变) ...
    }
}

// 窗口调整监听
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (currentView === 'roomView' && currentGameState) {
            dynamicCardLayout();
            const myPlayer = currentGameState.players.find(p => p.userId === myUserId);
            if (myPlayer) {
                const cardsEl = document.getElementById('myHand');
                renderPlayerCards(cardsEl, myPlayer, true, 
                    currentGameState.status === 'playing' && 
                    currentGameState.currentPlayerId === myUserId
                );
            }
        }
    }, 200);
});

// ... (其他事件监听和函数保持不变)...

// 初始化代码
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Setting up client...");
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    setupEventListeners();
    
    if (socket.connected) {
        console.log("[INIT] Socket already connected on DOMContentLoaded.");
        initClientSession();
    } else {
        console.log("[INIT] Socket not connected on DOMContentLoaded. Waiting for 'connect' event.");
        showView('loadingView');
    }
    
    console.log('Client setup complete.');
});
