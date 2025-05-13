// server/game.js

const SUITS = ['diamonds', 'clubs', 'hearts', 'spades'];
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const RANK_VALUES = {
    '3': 0, '4': 1, '5': 2, '6': 3, '7': 4, '8': 5, '9': 6, '10': 7,
    'J': 8, 'Q': 9, 'K': 10, 'A': 11, '2': 12
};
const SUIT_VALUES = { 'diamonds': 0, 'clubs': 1, 'hearts': 2, 'spades': 3 };
const RANK_TO_FILENAME_PART = {
    '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
    'J': 'jack', 'Q': 'queen', 'K': 'king', 'A': 'ace', '2': '2'
};
const MAX_PLAYERS = 4;

class Card {
    constructor(suit, rank) {
        if (!SUITS.includes(suit) || !RANKS.includes(rank)) {
            console.error(`[GAME_ERROR] Invalid card params: suit=${suit}, rank=${rank}`);
            // Fallback or throw error
            this.suit = SUITS[0];
            this.rank = RANKS[0];
        } else {
            this.suit = suit;
            this.rank = rank;
        }
        this.value = RANK_VALUES[this.rank];
        this.suitValue = SUIT_VALUES[this.suit];
        // Ensure id is always a string, even if Math.random fails (highly unlikely)
        this.id = `${this.rank}_of_${this.suit}_${(Math.random().toString(36) + '00000000000000000').slice(2, 7)}`;
        // Ensure image is always a string
        const rankFilePart = RANK_TO_FILENAME_PART[this.rank];
        const suitFilePart = this.suit;
        if (!rankFilePart || !suitFilePart) {
            console.error(`[GAME_ERROR] Failed to get file parts for card: rank=${this.rank}, suit=${this.suit}`);
            this.image = 'back.png'; // Fallback image
        } else {
            this.image = `${rankFilePart}_of_${suitFilePart}.png`;
        }
    }
    toString() { return `${this.rank}${this.suit.charAt(0).toUpperCase()}`; }
    compareTo(otherCard) {
        if (this.value !== otherCard.value) return this.value - otherCard.value;
        return this.suitValue - otherCard.suitValue;
    }
}

function createDeck() {
    return SUITS.flatMap(suit => RANKS.map(rank => new Card(suit, rank)));
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// --- Hand Evaluation (Simplified - NEEDS ROBUST IMPLEMENTATION for real game) ---
function getHandDetails(cards) {
    if (!cards || cards.length === 0) return { type: 'invalid', cards, sortKey: -1, message: "No cards selected." };
    // Ensure all items in cards are valid Card objects (basic check)
    if (!cards.every(c => c && typeof c.rank === 'string' && typeof c.suit === 'string')) {
        console.error("[GAME] getHandDetails received invalid card objects:", cards);
        return { type: 'invalid', cards, sortKey: -1, message: "Invalid card data." };
    }
    try {
        cards.sort((a, b) => a.compareTo(b));
    } catch (e) {
        console.error("[GAME] Error sorting cards in getHandDetails:", cards, e);
        return { type: 'invalid', cards, sortKey: -1, message: "Card sorting error." };
    }

    const n = cards.length;
    const ranks = cards.map(c => c.rank);
    const suits = cards.map(c => c.suit);
    const values = cards.map(c => c.value);
    const highestCard = cards[n - 1];

    if (n === 1) return { type: 'single', cards, highestCard, sortKey: highestCard.value * 10 + highestCard.suitValue };
    if (n === 2 && ranks[0] === ranks[1]) return { type: 'pair', cards, highestCard, sortKey: 100 + highestCard.value * 10 + highestCard.suitValue };
    if (n === 3 && ranks[0] === ranks[1] && ranks[1] === ranks[2]) return { type: 'triple', cards, highestCard, sortKey: 200 + highestCard.value };

    if (n === 5) {
        const rankCounts = {};
        ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
        const counts = Object.values(rankCounts);

        const isFlush = suits.every(s => s === suits[0]);
        let isStraight = false;
        const uniqueSortedValues = [...new Set(values)].sort((a,b) => a-b);
        if (uniqueSortedValues.length === 5) {
            if (uniqueSortedValues.join(',') === '7,8,9,10,11') { // 10-J-Q-K-A
                 isStraight = true;
            } else if (uniqueSortedValues.join(',') === '0,1,2,11,12') { // A-2-3-4-5 (using values 3,4,5,A,2)
                isStraight = true;
            } else {
                isStraight = true; // Assume true initially for normal sequence
                for (let i = 0; i < 4; i++) {
                    if (uniqueSortedValues[i+1] - uniqueSortedValues[i] !== 1) {
                        isStraight = false; break;
                    }
                }
            }
        }

        if (isStraight && isFlush) {
            let sfRankCard = highestCard;
            if (uniqueSortedValues.join(',') === '0,1,2,11,12') sfRankCard = cards.find(c=>c.rank === '5') || highestCard;
            return { type: 'straight_flush', cards, highestCard: sfRankCard, sortKey: 800 + sfRankCard.value * 10 + sfRankCard.suitValue };
        }
        if (counts.includes(4)) {
            const fourRank = Object.keys(rankCounts).find(r => rankCounts[r] === 4);
            const fourRankCard = cards.find(c => c.rank === fourRank) || highestCard; // Ensure highestCard is sensible
            return { type: 'four_of_a_kind', cards, highestCard: fourRankCard, sortKey: 700 + RANK_VALUES[fourRank] };
        }
        if (counts.includes(3) && counts.includes(2)) {
            const tripleRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
            const tripleRankCard = cards.find(c => c.rank === tripleRank) || highestCard;
            return { type: 'full_house', cards, highestCard: tripleRankCard, sortKey: 600 + RANK_VALUES[tripleRank] };
        }
        if (isFlush) return { type: 'flush', cards, highestCard, sortKey: 500 + highestCard.value * 10 + highestCard.suitValue };
        if (isStraight) {
            let sRankCard = highestCard;
            if (uniqueSortedValues.join(',') === '0,1,2,11,12') sRankCard = cards.find(c=>c.rank === '5') || highestCard;
            return { type: 'straight', cards, highestCard: sRankCard, sortKey: 400 + sRankCard.value * 10 + sRankCard.suitValue };
        }
    }
    return { type: 'invalid', cards, sortKey: -1, message: "Not a recognized hand type." };
}

function canPlayOver(playedHandDetails, currentTableHandDetails) {
    // ... (This logic remains complex and game-specific, keep as is from previous version or implement fully) ...
    // For now, using the simplified logic from previous good version:
    if (!currentTableHandDetails) return true;
    const playType = playedHandDetails.type;
    const tableType = currentTableHandDetails.type;
    const isPlayBomb = playType === 'four_of_a_kind' || playType === 'straight_flush';
    const isTableBomb = tableType === 'four_of_a_kind' || tableType === 'straight_flush';

    if (isPlayBomb && !isTableBomb) {
        if (currentTableHandDetails.cards.length < 5) return true;
        if (currentTableHandDetails.cards.length === 5) return true;
    }
    if (playedHandDetails.cards.length !== currentTableHandDetails.cards.length) return false;
    if (playType !== tableType) {
        if (isPlayBomb && isTableBomb) {
            if (playType === 'straight_flush' && tableType === 'four_of_a_kind') return true;
            if (playType === 'four_of_a_kind' && tableType === 'straight_flush') return false;
        } else return false;
    }
    return playedHandDetails.sortKey > currentTableHandDetails.sortKey;
}

class Game {
    constructor() {
        this.playerSlots = Array(MAX_PLAYERS).fill(null).map((_, i) => ({
            slotId: i, // Internal slot ID
            playerId: null,
            displayName: `空位 ${i + 1}`,
            hand: [],
            isTurn: false,
            hasPassed: false,
            connected: false,
            score: 0
        }));
        this.deck = [];
        this.lastPlayedHandDetails = null;
        this.lastPlayerWhoPlayedSlotIndex = -1;
        this.currentPlayerSlotIndex = -1;
        this.passCount = 0;
        this.isGameStarted = false;
        this.isRoundOver = false;
        this.roundWinnerSlotIndex = -1;
        this.gameLog = [];
        this.currentTrickStarterSlotIndex = -1;

        this.addLog("游戏实例已创建，等待玩家加入...");
        console.log("[GAME] New Game instance created.");
    }

    addLog(message) {
        this.gameLog.unshift(message); // Add to beginning for newest first
        if (this.gameLog.length > 30) this.gameLog.pop(); // Keep log size manageable
        // console.log(`[GAME_LOG] ${message}`); // Optional: log to server console too
    }

    getPlayerById(playerId) {
        return this.playerSlots.find(s => s.playerId === playerId);
    }
    
    getPlayerSlotIndex(playerId) {
        return this.playerSlots.findIndex(s => s.playerId === playerId);
    }

    addPlayer(playerId) {
        console.log(`[GAME] addPlayer called for: ${playerId}`);
        const alreadyConnectedSlot = this.playerSlots.find(s => s.playerId === playerId && s.connected);
        if (alreadyConnectedSlot) {
            this.addLog(`玩家 ${alreadyConnectedSlot.displayName} 已连接.`);
            console.log(`[GAME] Player ${playerId} already connected in slot ${alreadyConnectedSlot.slotId}.`);
            return { success: true, message: "Already connected." };
        }

        // Try to reassign to a slot if this playerId was previously in a disconnected slot
        const disconnectedSlotForThisId = this.playerSlots.find(s => s.playerId === playerId && !s.connected);
        if (disconnectedSlotForThisId) {
            disconnectedSlotForThisId.connected = true;
            this.addLog(`玩家 ${disconnectedSlotForThisId.displayName} 重新连接.`);
            console.log(`[GAME] Player ${playerId} reconnected to slot ${disconnectedSlotForThisId.slotId}.`);
            return { success: true, message: "Reconnected successfully." };
        }
        
        // Try to find an empty slot (playerId is null)
        const emptySlot = this.playerSlots.find(s => s.playerId === null);
        if (emptySlot) {
            emptySlot.playerId = playerId;
            emptySlot.displayName = `玩家 ${emptySlot.slotId + 1} (${playerId.substring(0,3)})`;
            emptySlot.connected = true;
            emptySlot.hand = []; // Reset hand for new player in slot
            emptySlot.isTurn = false;
            emptySlot.hasPassed = false;
            // score might be kept or reset based on rules
            this.addLog(`玩家 ${emptySlot.displayName} 加入了游戏 (空位 ${emptySlot.slotId + 1}).`);
            console.log(`[GAME] Player ${playerId} joined empty slot ${emptySlot.slotId}.`);
            return { success: true, message: "Joined game." };
        }

        // If game has started, usually don't allow new players unless specific rules for late join
        if (this.isGameStarted) {
             this.addLog(`玩家 ${playerId.substring(0,5)} 尝试加入已开始的游戏，但已满.`);
             console.log(`[GAME] Player ${playerId} tried to join full started game.`);
             return { success: false, message: "Game in progress and no empty slots for you." };
        }

        // Optional: if no completely empty slots, try to take over a disconnected player's slot (if not game started)
        const disconnectedSlotToTakeOver = this.playerSlots.find(s => !s.connected && s.playerId !== null);
        if (disconnectedSlotToTakeOver) {
            this.addLog(`玩家 ${playerId.substring(0,5)} 接管了 ${disconnectedSlotToTakeOver.displayName} 的位置.`);
            console.log(`[GAME] Player ${playerId} took over disconnected slot ${disconnectedSlotToTakeOver.slotId} (was ${disconnectedSlotToTakeOver.playerId}).`);
            disconnectedSlotToTakeOver.playerId = playerId; // New player takes the slot
            disconnectedSlotToTakeOver.displayName = `玩家 ${disconnectedSlotToTakeOver.slotId + 1} (${playerId.substring(0,3)})`;
            disconnectedSlotToTakeOver.connected = true;
            disconnectedSlotToTakeOver.hand = [];
            disconnectedSlotToTakeOver.isTurn = false;
            disconnectedSlotToTakeOver.hasPassed = false;
            return { success: true, message: "Took over a disconnected player's slot."};
        }
        
        this.addLog(`玩家 ${playerId.substring(0,5)} 尝试加入，但游戏已满.`);
        console.log(`[GAME] Player ${playerId} couldn't join. No empty or fully disconnected slots.`);
        return { success: false, message: "Game is full. Cannot join at this time." };
    }

    removePlayer(playerId) {
        console.log(`[GAME] removePlayer called for: ${playerId}`);
        const slot = this.getPlayerById(playerId);
        if (slot) {
            this.addLog(`玩家 ${slot.displayName} 已断开连接.`);
            console.log(`[GAME] Marking player ${slot.displayName} (ID: ${playerId}, Slot: ${slot.slotId}) as disconnected.`);
            slot.connected = false;
            // If game is not started, we can free up the slot entirely
            if (!this.isGameStarted) {
                slot.playerId = null;
                slot.displayName = `空位 ${slot.slotId + 1}`;
                slot.hand = [];
                slot.isTurn = false;
                slot.hasPassed = false;
                slot.score = 0; // Reset score if player leaves before start
                console.log(`[GAME] Slot ${slot.slotId} freed as game not started.`);
            } else if (slot.isTurn && !this.isRoundOver) {
                // If it was their turn in an active game, auto-pass
                this.addLog(`${slot.displayName} 在其回合断开，自动 PASS.`);
                console.log(`[GAME] Player ${slot.displayName} disconnected on their turn. Auto-passing.`);
                this._handlePassLogic(slot); // Apply pass logic directly
            }
        } else {
            console.log(`[GAME] removePlayer: Could not find player with ID ${playerId} in any slot.`);
        }
    }

    startGame() {
        console.log("[GAME] startGame called.");
        const connectedPlayerSlots = this.playerSlots.filter(s => s.connected && s.playerId !== null);
        if (connectedPlayerSlots.length < 2) { // Min 2 players
            const msg = `需要至少 2 名已连接玩家才能开始游戏。当前: ${connectedPlayerSlots.length}.`;
            this.addLog(msg);
            console.log(`[GAME] Start game failed: ${msg}`);
            return { success: false, message: msg };
        }
        if (this.isGameStarted) {
            this.addLog("游戏已在进行中，无法重复开始.");
            console.log("[GAME] Start game failed: Already in progress.");
            return { success: false, message: "Game already in progress." };
        }

        this.isGameStarted = true;
        this.isRoundOver = false;
        this.deck = shuffleDeck(createDeck());
        this.lastPlayedHandDetails = null;
        this.lastPlayerWhoPlayedSlotIndex = -1;
        this.passCount = 0;
        this.gameLog = ["游戏开始！"]; // Reset log for new game

        this.playerSlots.forEach(s => {
            if (s.connected && s.playerId) {
                s.hand = []; // Clear hands for dealing
                s.isTurn = false;
                s.hasPassed = false;
            } else if (!s.connected && s.playerId) { // Disconnected player but slot occupied
                s.hand = []; // Clear their hand too
            }
        });
        
        // Deal cards
        const cardsPerPlayer = Math.floor(52 / connectedPlayerSlots.length); // e.g., 13 for 4p, 17 for 3p, 26 for 2p
        for (let i = 0; i < cardsPerPlayer; i++) {
            for (const slot of connectedPlayerSlots) {
                if (this.deck.length > 0) {
                    slot.hand.push(this.deck.pop());
                }
            }
        }
        // Deal remaining cards if any (for 3 players, 52/3 = 17 remainder 1) - Big Two usually only 13 cards
        // For Big Two, always 13 cards, so if not 4 players, some cards are not dealt.
        // Let's stick to 13 cards per player max, and it's better with 4 players.
        // The previous logic was fine for dealing 13 cards.

        connectedPlayerSlots.forEach(s => s.hand.sort((a, b) => a.compareTo(b)));

        let startingPlayerSlotIndex = -1;
        for (const slot of connectedPlayerSlots) {
            if (slot.hand.some(card => card.rank === '3' && card.suit === 'diamonds')) {
                startingPlayerSlotIndex = slot.slotId;
                break;
            }
        }
        if (startingPlayerSlotIndex === -1 && connectedPlayerSlots.length > 0) {
            startingPlayerSlotIndex = connectedPlayerSlots[0].slotId; // Fallback: first connected player
            this.addLog("未找到 方块3，由第一位玩家开始。");
        }
        
        if (startingPlayerSlotIndex === -1) {
             this.isGameStarted = false; // Failed to start
             const msg = "错误：无法确定起始玩家。";
             this.addLog(msg);
             console.log(`[GAME] Start game critical error: ${msg}`);
             return {success: false, message: msg};
        }

        this.currentPlayerSlotIndex = startingPlayerSlotIndex;
        this.playerSlots[startingPlayerSlotIndex].isTurn = true;
        this.currentTrickStarterSlotIndex = startingPlayerSlotIndex; // Player starting the very first trick
        this.addLog(`玩家 ${this.playerSlots[startingPlayerSlotIndex].displayName} 持有方块3 (或为首位)，开始出牌.`);
        console.log(`[GAME] Game started. Starting player: ${this.playerSlots[startingPlayerSlotIndex].displayName} (Slot ${startingPlayerSlotIndex})`);
        return { success: true };
    }

    _moveToNextPlayer() {
        if (this.isRoundOver) return;
        if (this.currentPlayerSlotIndex !== -1) {
             this.playerSlots[this.currentPlayerSlotIndex].isTurn = false;
        }

        let nextPlayerFound = false;
        let searchIndex = this.currentPlayerSlotIndex;
        const numSlots = this.playerSlots.length;

        for (let i = 0; i < numSlots; i++) {
            searchIndex = (searchIndex + 1) % numSlots;
            const candidateSlot = this.playerSlots[searchIndex];
            if (candidateSlot.connected && candidateSlot.playerId && candidateSlot.hand.length > 0 && !candidateSlot.hasPassed) {
                this.currentPlayerSlotIndex = searchIndex;
                candidateSlot.isTurn = true;
                nextPlayerFound = true;
                this.addLog(`轮到玩家 ${candidateSlot.displayName} 出牌.`);
                console.log(`[GAME] Next turn: ${candidateSlot.displayName} (Slot ${searchIndex})`);
                break;
            }
        }

        if (!nextPlayerFound) {
            // This implies everyone else has passed or is out of cards.
            // This case should be handled by the pass logic leading to a new trick,
            // or by win condition if only one player remains with cards.
            // For safety, if this is reached unexpectedly:
            console.warn("[GAME] _moveToNextPlayer: Could not find a valid next player. This might indicate an issue or end of trick/round.");
            // If lastPlayerWhoPlayedIndex is valid, they might have won the trick.
            if(this.lastPlayerWhoPlayedSlotIndex !== -1 && this.playerSlots[this.lastPlayerWhoPlayedSlotIndex].hand.length > 0) {
                this.addLog(`所有其他玩家已PASS或无牌可出，玩家 ${this.playerSlots[this.lastPlayerWhoPlayedSlotIndex].displayName} 开始新的一轮。`);
                this.currentPlayerSlotIndex = this.lastPlayerWhoPlayedSlotIndex;
                this.currentTrickStarterSlotIndex = this.lastPlayerWhoPlayedSlotIndex;
                this.lastPlayedHandDetails = null;
                this.passCount = 0;
                this.playerSlots.forEach(s => {
                    s.hasPassed = false;
                    s.isTurn = (s.slotId === this.currentPlayerSlotIndex);
                });
                if(this.playerSlots[this.currentPlayerSlotIndex].isTurn) {
                     this.addLog(`新一轮。请 ${this.playerSlots[this.currentPlayerSlotIndex].displayName} 出牌。`);
                }
            } else {
                // No one can play, this might be a stalemate or a bug.
                // Or the game ended. Check win conditions.
                 const activePlayersWithCards = this.playerSlots.filter(s => s.connected && s.playerId && s.hand.length > 0);
                 if(activePlayersWithCards.length === 1) { // Last player won
                    // This should be caught by playTurn's win check
                 } else if (activePlayersWithCards.length === 0 && this.isGameStarted) {
                    // All players out of cards simultaneously? Unlikely. Or game already ended.
                 } else {
                    this.addLog("错误: 无法找到下一个出牌的玩家。");
                    console.error("[GAME] CRITICAL: _moveToNextPlayer failed to find any valid next player.");
                 }
            }
        }
    }
    
    _handlePassLogic(playerSlot) { // Renamed from _handlePass to avoid conflict if called directly
        playerSlot.hasPassed = true;
        this.passCount++;
        this.addLog(`玩家 ${playerSlot.displayName} PASS.`);
        console.log(`[GAME] Player ${playerSlot.displayName} (Slot ${playerSlot.slotId}) passed. Pass count: ${this.passCount}`);

        // Count players who are still in the game (connected, have cards)
        const activePlayersInGame = this.playerSlots.filter(s => s.connected && s.playerId && s.hand.length > 0);
        
        // If (number of passes) equals (active players - 1), the last player who played cards wins the trick
        if (this.lastPlayerWhoPlayedSlotIndex !== -1 && this.passCount >= activePlayersInGame.length - 1) {
            const trickWinnerSlot = this.playerSlots[this.lastPlayerWhoPlayedSlotIndex];
            this.addLog(`所有其他玩家已PASS，玩家 ${trickWinnerSlot.displayName} 赢得此轮并开始新的一轮。`);
            console.log(`[GAME] Trick won by ${trickWinnerSlot.displayName} (Slot ${trickWinnerSlot.slotId}). Starting new trick.`);
            
            this.currentPlayerSlotIndex = this.lastPlayerWhoPlayedSlotIndex;
            this.currentTrickStarterSlotIndex = this.lastPlayerWhoPlayedSlotIndex;
            this.lastPlayedHandDetails = null; // Clear table
            this.passCount = 0;
            this.playerSlots.forEach(s => {
                s.hasPassed = false; // Reset pass status for new trick
                s.isTurn = (s.slotId === this.currentPlayerSlotIndex);
            });
            if (this.playerSlots[this.currentPlayerSlotIndex].isTurn) { // Check because player might have disconnected
                this.addLog(`新一轮。请 ${this.playerSlots[this.currentPlayerSlotIndex].displayName} 出牌。`);
                console.log(`[GAME] New trick. ${this.playerSlots[this.currentPlayerSlotIndex].displayName} to play.`);
            }
        } else {
            this._moveToNextPlayer();
        }
    }

    passTurn(playerId) {
        console.log(`[GAME] passTurn called by ${playerId}`);
        if (this.isRoundOver) return { success: false, message: "本局已结束。" };
        
        const playerSlotIndex = this.getPlayerSlotIndex(playerId);
        if (playerSlotIndex === -1 || playerSlotIndex !== this.currentPlayerSlotIndex) {
            console.log(`[GAME] passTurn failed: Not ${playerId}'s turn or player not found. Current turn: Slot ${this.currentPlayerSlotIndex}`);
            return { success: false, message: "不是你的回合或你不在游戏中。" };
        }
        if (!this.lastPlayedHandDetails) { // Cannot pass if you are leading the trick
            console.log(`[GAME] passTurn failed: ${playerId} cannot pass when leading a trick.`);
            return { success: false, message: "你是本轮第一个出牌，不能PASS。" };
        }
        
        const playerSlot = this.playerSlots[playerSlotIndex];
        if (!playerSlot.connected) { // Should not happen if it's their turn but good check
            console.log(`[GAME] passTurn failed: ${playerId} (Slot ${playerSlotIndex}) is disconnected.`);
            return {success: false, message: "你已断开连接。"};
        }

        this._handlePassLogic(playerSlot);
        return { success: true };
    }

    playTurn(playerId, playedCardIds) {
        console.log(`[GAME] playTurn called by ${playerId} with card IDs:`, playedCardIds);
        if (this.isRoundOver) return { success: false, message: "本局已结束。" };

        const playerSlotIndex = this.getPlayerSlotIndex(playerId);
        if (playerSlotIndex === -1 || playerSlotIndex !== this.currentPlayerSlotIndex) {
            console.log(`[GAME] playTurn failed: Not ${playerId}'s turn or player not found. Current turn: Slot ${this.currentPlayerSlotIndex}`);
            return { success: false, message: "不是你的回合或你不在游戏中。" };
        }

        const playerSlot = this.playerSlots[playerSlotIndex];
        if (!playerSlot.connected) {
            console.log(`[GAME] playTurn failed: ${playerId} (Slot ${playerSlotIndex}) is disconnected.`);
            return {success: false, message: "你已断开连接。"};
        }

        const playedCards = playedCardIds
            .map(id => playerSlot.hand.find(c => c.id === id))
            .filter(Boolean);

        if (playedCards.length !== playedCardIds.length || playedCards.length === 0) {
            console.log(`[GAME] playTurn failed for ${playerId}: Invalid card selection. Played:`, playedCardIds, "Found:", playedCards);
            return { success: false, message: "无效的选牌。" };
        }

        const playedHandDetails = getHandDetails(playedCards);
        if (playedHandDetails.type === 'invalid') {
            console.log(`[GAME] playTurn failed for ${playerId}: Invalid hand type. Details:`, playedHandDetails);
            return { success: false, message: playedHandDetails.message || "无效的牌型。" };
        }

        // First turn of the game by the player with 3 of Diamonds rule
        if (this.lastPlayerWhoPlayedSlotIndex === -1 && !this.lastPlayedHandDetails) { // Very first play of the game
            const starterSlot = this.playerSlots.find(s => s.hand.some(c => c.rank === '3' && c.suit === 'diamonds'));
            if (starterSlot && starterSlot.playerId === playerId) { // If current player IS the one with 3D
                 const played3D = playedCards.some(c => c.rank === '3' && c.suit === 'diamonds');
                 if (!played3D) {
                    const msg = "游戏首轮出牌必须包含方块3。";
                    console.log(`[GAME] playTurn failed for ${playerId}: ${msg}`);
                    return { success: false, message: msg };
                }
            }
        }

        if (!canPlayOver(playedHandDetails, this.lastPlayedHandDetails)) {
            console.log(`[GAME] playTurn failed for ${playerId}: Hand cannot play over table. Played:`, playedHandDetails, "Table:", this.lastPlayedHandDetails);
            return { success: false, message: "你的牌无法大过桌上的牌。" };
        }

        playerSlot.hand = playerSlot.hand.filter(card => !playedCardIds.includes(card.id));
        playerSlot.hand.sort((a, b) => a.compareTo(b)); // Keep hand sorted

        this.lastPlayedHandDetails = playedHandDetails;
        this.lastPlayerWhoPlayedSlotIndex = playerSlotIndex;
        this.passCount = 0;
        this.playerSlots.forEach(s => {
            if(s.slotId !== playerSlotIndex) s.hasPassed = false; // Reset pass for others for this new hand
        });
        // The current player is no longer "passed" if they just played
        playerSlot.hasPassed = false; 
        this.currentTrickStarterSlotIndex = playerSlotIndex; // This player is leading the current "trick"

        this.addLog(`玩家 ${playerSlot.displayName} 打出: ${playedCards.map(c => c.toString()).join(' ')} (${playedHandDetails.type})`);
        console.log(`[GAME] Player ${playerSlot.displayName} played. Hand:`, playedHandDetails.type);


        if (playerSlot.hand.length === 0) {
            this.isRoundOver = true;
            this.roundWinnerSlotIndex = playerSlotIndex;
            playerSlot.score++;
            this.addLog(`玩家 ${playerSlot.displayName} 获胜本局! 总分: ${playerSlot.score}`);
            console.log(`[GAME] Round Winner: ${playerSlot.displayName} (Slot ${playerSlotIndex}). Score: ${playerSlot.score}`);
            this.playerSlots.forEach(s => s.isTurn = false); // No one's turn after round ends
            return { success: true, roundOver: true, winner: playerSlot.displayName };
        }

        this._moveToNextPlayer();
        return { success: true, roundOver: false };
    }

    endGameDueToDisconnection() {
        this.addLog("由于玩家断线过多，游戏结束。");
        console.log("[GAME] Game ended due to disconnections.");
        this.isGameStarted = false;
        this.isRoundOver = true;
        this.roundWinnerSlotIndex = -1; // Or decide based on rules
    }

    getGameStateForPlayer(playerId) {
        // console.log(`[GAME] getGameStateForPlayer called for: ${playerId}`);
        const slot = this.getPlayerById(playerId);

        if (!slot) { // If playerId is not in any slot (e.g. a socket connected but not added to game yet, or game is full)
            console.log(`[GAME] Player ID ${playerId} not found in any slot. Returning lobby/observer state.`);
            return this.getLobbyState(playerId); // Pass playerId to see if it's a "known but not in slot" observer
        }

        return {
            myPlayerId: slot.playerId,
            myDisplayName: slot.displayName,
            myHand: slot.hand.map(c => ({ ...c })),
            myIsTurn: slot.isTurn,
            myHasPassed: slot.hasPassed,
            playerSlots: this.playerSlots.map(s => ({
                slotId: s.slotId,
                playerId: s.playerId,
                displayName: s.displayName,
                cardCount: (s.connected && s.playerId) ? s.hand.length : 0,
                isTurn: s.isTurn,
                hasPassed: s.hasPassed,
                connected: s.connected,
                score: s.score,
                isMe: s.playerId === playerId
            })),
            lastPlayedHand: this.lastPlayedHandDetails ? this.lastPlayedHandDetails.cards.map(c => ({ ...c })) : [],
            lastPlayedHandType: this.lastPlayedHandDetails ? this.lastPlayedHandDetails.type : null,
            lastPlayerWhoPlayed: this.lastPlayerWhoPlayedSlotIndex !== -1 ? this.playerSlots[this.lastPlayerWhoPlayedSlotIndex].displayName : null,
            isGameStarted: this.isGameStarted,
            isRoundOver: this.isRoundOver,
            roundWinner: this.roundWinnerSlotIndex !== -1 ? this.playerSlots[this.roundWinnerSlotIndex].displayName : null,
            gameLog: [...this.gameLog], // Send a copy
            canStartGame: !this.isGameStarted && this.playerSlots.filter(s => s.connected && s.playerId).length >= 2,
            connectedPlayersCount: this.playerSlots.filter(s => s.connected && s.playerId).length,
            maxPlayers: MAX_PLAYERS,
        };
    }

    getLobbyState(requestingPlayerId = null) {
        return {
            myPlayerId: requestingPlayerId, // So client knows its own socket ID even if not in game
            myDisplayName: "观察者",
            myHand: [],
            myIsTurn: false,
            myHasPassed: false,
            playerSlots: this.playerSlots.map(s => ({
                slotId: s.slotId,
                playerId: s.playerId,
                displayName: s.displayName,
                cardCount: (s.connected && s.playerId) ? s.hand.length : 0,
                isTurn: s.isTurn,
                hasPassed: s.hasPassed,
                connected: s.connected,
                score: s.score,
                isMe: s.playerId === requestingPlayerId && s.connected // Mark as "me" if socket ID matches and is connected
            })),
            lastPlayedHand: this.lastPlayedHandDetails ? this.lastPlayedHandDetails.cards.map(c => ({ ...c })) : [],
            lastPlayedHandType: this.lastPlayedHandDetails ? this.lastPlayedHandDetails.type : null,
            lastPlayerWhoPlayed: this.lastPlayerWhoPlayedSlotIndex !== -1 ? this.playerSlots[this.lastPlayerWhoPlayedSlotIndex].displayName : null,
            isGameStarted: this.isGameStarted,
            isRoundOver: this.isRoundOver,
            roundWinner: this.roundWinnerSlotIndex !== -1 ? this.playerSlots[this.roundWinnerSlotIndex].displayName : null,
            gameLog: [...this.gameLog],
            canStartGame: !this.isGameStarted && this.playerSlots.filter(s => s.connected && s.playerId).length >= 2,
            connectedPlayersCount: this.playerSlots.filter(s => s.connected && s.playerId).length,
            maxPlayers: MAX_PLAYERS,
            statusMessage: this.playerSlots.every(s => s.playerId === null || !s.connected) ? "等待玩家加入..." : 
                           (this.playerSlots.filter(s=>s.connected && s.playerId).length < MAX_PLAYERS && !this.isGameStarted ? "可以加入游戏..." : "游戏进行中或已满，你正在观察。")
        };
    }
    
    getPlayerListInfo() {
        return this.playerSlots.map(s => ({
            slotId: s.slotId,
            playerId: s.playerId,
            displayName: s.displayName,
            connected: s.connected,
        }));
    }

    getGameStartInfo() {
        if (this.currentPlayerSlotIndex === -1 || !this.playerSlots[this.currentPlayerSlotIndex]) {
            return { startingPlayerName: "Error", message: "游戏开始! 但无法确定起始玩家。" };
        }
        const starter = this.playerSlots[this.currentPlayerSlotIndex];
        return {
            startingPlayerName: starter.displayName,
            message: `游戏开始! ${starter.displayName} 首先出牌.`
        };
    }
}

module.exports = { Game, Card };
