const crypto = require('crypto');

// --- Constants for Rules ---
const RANK_ORDER = ["4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2", "3"];
const RANK_VALUES = {};
RANK_ORDER.forEach((rank, index) => { RANK_VALUES[rank] = index; });

const SUIT_ORDER = ["D", "C", "H", "S"];
const SUIT_VALUES = {};
SUIT_ORDER.forEach((suit, index) => { SUIT_VALUES[suit] = index; });

const HAND_TYPES = {
    SINGLE: 'single', PAIR: 'pair', THREE_OF_A_KIND: 'three_of_a_kind',
    STRAIGHT: 'straight', FLUSH: 'flush', FULL_HOUSE: 'full_house',
    STRAIGHT_FLUSH: 'straight_flush'
};

const HAND_TYPE_RANKING = {
    [HAND_TYPES.SINGLE]: 1, [HAND_TYPES.PAIR]: 2, [HAND_TYPES.THREE_OF_A_KIND]: 3,
    [HAND_TYPES.STRAIGHT]: 4, [HAND_TYPES.FLUSH]: 5, [HAND_TYPES.FULL_HOUSE]: 6,
    [HAND_TYPES.STRAIGHT_FLUSH]: 7
};

// --- Helper Functions ---
function compareSingleCards(cardA, cardB) {
    const rankValueA = RANK_VALUES[cardA.rank];
    const rankValueB = RANK_VALUES[cardB.rank];
    if (rankValueA !== rankValueB) return rankValueA - rankValueB;
    return SUIT_VALUES[cardA.suit] - SUIT_VALUES[cardB.suit];
}

function compareHands(handInfoA, handInfoB) {
    // Assumes A and B are valid handInfos from getHandInfo
    const rankA = HAND_TYPE_RANKING[handInfoA.type];
    const rankB = HAND_TYPE_RANKING[handInfoB.type];

    // Higher rank type wins (no bombs, so strict comparison)
    if (rankA !== rankB) return rankA - rankB;

    // Same type comparison
    switch (handInfoA.type) {
        case HAND_TYPES.STRAIGHT_FLUSH:
            if (handInfoA.suitValue !== handInfoB.suitValue) return handInfoA.suitValue - handInfoB.suitValue;
            return handInfoA.primaryRankValue - handInfoB.primaryRankValue; // Use the calculated comparison value
        case HAND_TYPES.FULL_HOUSE: // Fallthrough
        case HAND_TYPES.STRAIGHT:
            return handInfoA.primaryRankValue - handInfoB.primaryRankValue;
        case HAND_TYPES.FLUSH:
            for (let i = 0; i < handInfoA.cards.length; i++) {
                const compareResult = compareSingleCards(handInfoA.cards[i], handInfoB.cards[i]);
                if (compareResult !== 0) return compareResult;
            }
            return 0;
        case HAND_TYPES.THREE_OF_A_KIND: // Fallthrough
        case HAND_TYPES.PAIR: // Fallthrough
        case HAND_TYPES.SINGLE:
            return compareSingleCards(handInfoA.representativeCard, handInfoB.representativeCard);
        default: return 0;
    }
}


class Game {
    constructor(roomId, maxPlayers = 4) {
        this.roomId = roomId;
        this.maxPlayers = maxPlayers;
        this.players = []; // { id, name, slot, hand:[], score:0, connected: true, finished: false, role: null }
        this.deck = [];
        this.centerPile = []; // Stores actual cards of the last played hand
        this.lastValidHandInfo = null; // Stores { type, cards, ... } of the last played hand for comparison
        this.currentPlayerIndex = -1;
        this.firstTurn = true; // Special rule for first turn
        this.gameStarted = false;
        this.gameFinished = false;
        this.winnerId = null; // ID of the first player to finish
        this.playerRoles = {}; // { playerId: 'D' | 'F' | 'DD' }
        this.finishOrder = []; // [playerId, playerId, ...]
        this.gameMode = null; // 'standard' | 'double_landlord'
        this.consecutivePasses = 0; // Track passes for turn reset
        this.lastPlayerWhoPlayed = null; // Track who played last for pass reset logic
        this.possibleHints = []; // Stores hints for the current player
        this.currentHintIndexInternal = 0; // Tracks hint cycling
    }

    // --- Player Management ---
    addPlayer(userId, username, slot) {
        if (this.players.length >= this.maxPlayers || this.players.some(p => p.id === userId)) return false;
        this.players.push({
            id: userId, name: username, slot: slot, hand: [], score: 0,
            connected: true, finished: false, role: null
        });
        this.players.sort((a, b) => a.slot - b.slot);
        return true;
    }

    removePlayer(userId) { this.markPlayerConnected(userId, false); }

    markPlayerConnected(userId, isConnected) {
        const player = this.players.find(p => p.id === userId);
        if (player) {
            player.connected = !!isConnected;
            if (!isConnected) player.finished = false; // Reset finished status on disconnect? Or handle differently?
            console.log(`[GAME ${this.roomId}] Player ${player.name} connection status set to ${player.connected}`);
        }
    }

    // --- Game Flow ---
    startGame(playerStartInfo) {
        this.deck = []; this.centerPile = []; this.lastValidHandInfo = null; this.currentPlayerIndex = -1;
        this.firstTurn = true; this.gameStarted = false; this.gameFinished = false; this.winnerId = null;
        this.playerRoles = {}; this.finishOrder = []; this.gameMode = null; this.consecutivePasses = 0; this.lastPlayerWhoPlayed = null;

        if (playerStartInfo.length !== this.maxPlayers) return { success: false, message: `需要 ${this.maxPlayers} 玩家。` };

        this.players = playerStartInfo.map(info => ({
            id: info.id, name: info.name, slot: info.slot, hand: [], score: this.players.find(p=>p.id === info.id)?.score || 0, // Preserve score across rounds
            connected: true, finished: false, role: null
        })).sort((a, b) => a.slot - b.slot);

        console.log(`[GAME ${this.roomId}] Starting game with players:`, this.players.map(p => p.name));
        this.createDeck(); this.shuffleDeck(); this.dealCards(13);
        this.gameStarted = true; this.firstTurn = true;

        // Determine roles
        let s3PlayerId = null, saPlayerId = null;
        this.players.forEach(p => {
            if (p.hand.some(c => c.suit === 'S' && c.rank === '3')) s3PlayerId = p.id;
            if (p.hand.some(c => c.suit === 'S' && c.rank === 'A')) saPlayerId = p.id;
        });
        if (!s3PlayerId || !saPlayerId) return { success: false, message: "发牌错误，无法确定身份！" };

        if (s3PlayerId === saPlayerId) {
            this.gameMode = 'double_landlord'; this.playerRoles[s3PlayerId] = 'DD';
            this.players.forEach(p => { p.role = (p.id === s3PlayerId) ? 'DD' : 'F'; this.playerRoles[p.id] = p.role; });
        } else {
            this.gameMode = 'standard'; this.playerRoles[s3PlayerId] = 'D'; this.playerRoles[saPlayerId] = 'D';
            this.players.forEach(p => { p.role = (p.id === s3PlayerId || p.id === saPlayerId) ? 'D' : 'F'; this.playerRoles[p.id] = p.role; });
        }
        console.log(`[GAME ${this.roomId}] Game Mode: ${this.gameMode}. Roles assigned.`);

        // Find starting player (D4)
        let startingPlayerIndex = -1;
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].hand.some(card => card.suit === 'D' && card.rank === '4')) {
                startingPlayerIndex = i; break;
            }
        }
        if (startingPlayerIndex === -1) return { success: false, message: "发牌错误，未找到方块4！" };
        this.currentPlayerIndex = startingPlayerIndex;
        this.lastPlayerWhoPlayed = null; // No one played yet

        console.log(`[GAME ${this.roomId}] Player ${this.players[this.currentPlayerIndex].name} starts (has D4).`);
        return { success: true };
    }

    playCard(playerId, cards) {
        if (!this.gameStarted || this.gameFinished) return { success: false, message: "游戏未开始或已结束。" };
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        if (playerIndex !== this.currentPlayerIndex) return { success: false, message: "现在不是你的回合。" };
        const player = this.players[playerIndex];
        if (!player.connected) return { success: false, message: "你已断线。" };
        if (player.finished) return { success: false, message: "你已完成出牌。" };

        // Validate cards are in hand
        const handSet = new Set(player.hand.map(c => `${c.rank}${c.suit}`));
        const cardsValidInHand = cards.every(card => handSet.has(`${card.rank}${card.suit}`));
        if (!cardsValidInHand) return { success: false, message: "选择的牌不在您的手中。" };

        // Validate hand type and rules
        const validationResult = this.checkValidPlay(cards, player.hand, this.lastValidHandInfo, this.firstTurn);
        if (!validationResult.valid) return { success: false, message: validationResult.message };

        // --- Execute Play ---
        // Remove cards from hand
        const cardsToRemoveSet = new Set(cards.map(c => `${c.rank}${c.suit}`));
        player.hand = player.hand.filter(card => !cardsToRemoveSet.has(`${card.rank}${card.suit}`));

        // Update game state
        this.centerPile = cards;
        this.lastValidHandInfo = validationResult.handInfo;
        this.lastPlayerWhoPlayed = playerId; // Track player who made the move
        this.consecutivePasses = 0; // Reset passes on successful play
        if (this.firstTurn) this.firstTurn = false;
        console.log(`[GAME ${this.roomId}] Player ${player.name} played ${this.lastValidHandInfo.type}.`);

        // --- Check Game End ---
        let gameOver = false;
        let scoreResult = null;
        if (player.hand.length === 0) {
            this.finishOrder.push(playerId);
            player.finished = true;
            if (!this.winnerId) this.winnerId = playerId; // Record first winner
            console.log(`[GAME ${this.roomId}] Player ${player.name} finished ${this.finishOrder.length}.`);

            const instantResult = this.checkInstantGameOver();
            if (instantResult.isOver) {
                gameOver = true;
                scoreResult = this.calculateScoresBasedOnResult(instantResult.resultDescription);
                this.gameFinished = true; this.gameStarted = false;
                console.log(`[GAME ${this.roomId}] Game result determined early: ${instantResult.resultDescription}`);
            } else if (this.finishOrder.length === this.players.length -1) { // Only one player left
                 const lastPlayer = this.players.find(p => !p.finished);
                 if(lastPlayer) this.finishOrder.push(lastPlayer.id);
                 gameOver = true;
                 scoreResult = this.calculateScores(); // Calculate based on full order
                 this.gameFinished = true; this.gameStarted = false;
                  console.log(`[GAME ${this.roomId}] All players finished (last one remaining).`);
            }
        }

        // --- Return Result ---
        if (gameOver) {
            return { success: true, gameOver: true, scoreResult: scoreResult, handInfo: this.lastValidHandInfo };
        } else if (player.finished) {
            this.nextTurn(true);
            return { success: true, playerFinished: true, handInfo: this.lastValidHandInfo };
        } else {
            this.nextTurn();
            return { success: true, handInfo: this.lastValidHandInfo };
        }
    }

    handlePass(playerId) {
        if (!this.gameStarted || this.gameFinished) return { success: false, message: "游戏未开始或已结束。" };
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        if (playerIndex !== this.currentPlayerIndex) return { success: false, message: "现在不是你的回合。" };
        const player = this.players[playerIndex];
        if (!player.connected) return { success: false, message: "你已断线。" };
        if (player.finished) return { success: false, message: "你已完成出牌。" };
        if (!this.lastValidHandInfo || this.lastPlayerWhoPlayed === playerId) { // Cannot pass if you are starting a round or played last
            return { success: false, message: "你必须出牌。" };
        }

        console.log(`[GAME ${this.roomId}] Player ${player.name} passed.`);
        this.consecutivePasses++;

        // Check if everyone else passed since the last actual play
        const activePlayersCount = this.players.filter(p => !p.finished && p.connected).length;
        if (this.consecutivePasses >= activePlayersCount - 1) {
            console.log(`[GAME ${this.roomId}] All other active players passed. Resetting turn state.`);
            this.resetTurnState();
            // The turn should go to the last player who actually played a card
            const lastPlayerIndex = this.players.findIndex(p => p.id === this.lastPlayerWhoPlayed);
            if (lastPlayerIndex !== -1 && !this.players[lastPlayerIndex].finished) {
                this.currentPlayerIndex = lastPlayerIndex;
                this.lastPlayerWhoPlayed = null; // Reset for the new round starter
                 console.log(`[GAME ${this.roomId}] New round starting with player: ${this.players[this.currentPlayerIndex]?.name}`);
            } else {
                 // Edge case: last player disconnected or finished? Advance normally.
                 this.nextTurn(true); // Force advance to find next available player
                 this.lastPlayerWhoPlayed = null;
            }

        } else {
            this.nextTurn(); // Just advance to the next player
        }

        return { success: true };
    }

    resetTurnState() {
        this.centerPile = [];
        this.lastValidHandInfo = null;
        this.consecutivePasses = 0;
        // Keep lastPlayerWhoPlayed until the new round actually starts
        console.log(`[GAME ${this.roomId}] Turn state reset (pile cleared).`);
    }


    nextTurn(forceAdvance = false) {
        // ... (nextTurn logic skipping finished/disconnected players remains the same) ...
         if (this.gameFinished && !forceAdvance) return;
         if (this.players.length === 0) return;
         let currentIdx = this.currentPlayerIndex;
         if(currentIdx === -1) currentIdx = 0; // Handle initial state if needed
         let nextIndex = currentIdx;
         let loopDetection = 0;
         const maxLoops = this.players.length * 2;

         do {
              nextIndex = (nextIndex + 1) % this.players.length;
              loopDetection++;
              if (loopDetection > maxLoops) { // Safety break
                   console.error(`[GAME ${this.roomId}] Infinite loop detected in nextTurn!`);
                   this.currentPlayerIndex = -1; // Indicate error
                   // Consider ending the game abnormally
                   this.endGame("Turn Advancement Error");
                   return;
              }
         } while (
              !this.players[nextIndex] || this.players[nextIndex].finished || !this.players[nextIndex].connected
         );

         this.currentPlayerIndex = nextIndex;
         console.log(`[GAME ${this.roomId}] Turn advanced to player: ${this.players[this.currentPlayerIndex]?.name}`);
         // Reset hints when turn changes
         this.possibleHints = [];
         this.currentHintIndexInternal = 0;
    }

    // --- Hint Logic (Simple Version) ---
    findHint(playerId, currentHintIndex = 0) {
        if (!this.gameStarted || this.gameFinished) return { success: false, message: "游戏未开始或已结束。" };
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        if (playerIndex !== this.currentPlayerIndex) return { success: false, message: "现在不是你的回合。" };
        const player = this.players[playerIndex];
        if (!player || !player.connected || player.finished) return { success: false, message: "无效状态。" };

        // If hints already calculated for this turn, cycle through them
        if (this.possibleHints.length > 0) {
             const nextIndex = (currentHintIndex + 1) % this.possibleHints.length;
             return { success: true, hint: this.possibleHints[nextIndex], nextHintIndex: nextIndex };
        }

        // --- Calculate Hints (Find minimal valid plays) ---
        this.possibleHints = [];
        const hand = player.hand;

        // 1. Try single cards
        for (const card of hand) {
            const handInfo = this.getHandInfo([card]);
            if (handInfo.isValid) {
                const validation = this.checkValidPlay([card], hand, this.lastValidHandInfo, this.firstTurn);
                if (validation.valid) this.possibleHints.push({ cards: [card] });
            }
        }

        // 2. Try pairs
        const ranksInHand = {};
        hand.forEach(c => ranksInHand[c.rank] = (ranksInHand[c.rank] || 0) + 1);
        for (const rank in ranksInHand) {
            if (ranksInHand[rank] >= 2) {
                const pairCards = hand.filter(c => c.rank === rank).sort(compareSingleCards).slice(0, 2); // Get smallest 2 of that rank
                 const handInfo = this.getHandInfo(pairCards);
                 if(handInfo.isValid && handInfo.type === HAND_TYPES.PAIR) {
                      const validation = this.checkValidPlay(pairCards, hand, this.lastValidHandInfo, this.firstTurn);
                      if (validation.valid) this.possibleHints.push({ cards: pairCards });
                 }
            }
        }
         // 3. Try three of a kind
         for (const rank in ranksInHand) {
             if (ranksInHand[rank] >= 3) {
                 const threeCards = hand.filter(c => c.rank === rank).sort(compareSingleCards).slice(0, 3);
                  const handInfo = this.getHandInfo(threeCards);
                  if(handInfo.isValid && handInfo.type === HAND_TYPES.THREE_OF_A_KIND) {
                       const validation = this.checkValidPlay(threeCards, hand, this.lastValidHandInfo, this.firstTurn);
                       if (validation.valid) this.possibleHints.push({ cards: threeCards });
                  }
             }
         }

        // TODO: Add hints for straights, flushes etc. (more complex)

        // Sort hints (e.g., by type rank, then by comparison value/card) - Optional but good
        this.possibleHints.sort((a, b) => {
             const infoA = this.getHandInfo(a.cards);
             const infoB = this.getHandInfo(b.cards);
             // Minimal implementation: compare based on the handInfo comparison logic
             return compareHands(infoA, infoB);
        });


        if (this.possibleHints.length > 0) {
             this.currentHintIndexInternal = 0; // Reset index for new calculation
             return { success: true, hint: this.possibleHints[0], nextHintIndex: 0 };
        } else {
             return { success: false, message: "没有可出的牌。" }; // Or suggest passing
        }
    }


    // --- Card Handling & Validation (getHandInfo, checkValidPlay) ---
    // getHandInfo, checkValidPlay, compareHands from previous versions
    // ensure getHandInfo does NOT validate 4-of-a-kind
    getHandInfo(cards) { /* ... Keep implementation from previous step ... */
        if (!Array.isArray(cards) || cards.length === 0) return { isValid: false, message: "无效输入" };
        const n = cards.length;
        const sortedCards = [...cards].sort((a, b) => compareSingleCards(b, a));
        const suits = new Set(sortedCards.map(c => c.suit));
        const ranks = sortedCards.map(c => c.rank);
        const rankValues = sortedCards.map(c => RANK_VALUES[c.rank]);
        const isFlush = suits.size === 1;
        let isStraight = false;
        let straightComparisonValue = -1;
        if (n === 5) {
            const uniqueRankValues = [...new Set(rankValues)].sort((a, b) => a - b);
            if (uniqueRankValues.length === 5) {
                const aceLowStraightRanks = [RANK_VALUES['A'], RANK_VALUES['2'], RANK_VALUES['3'], RANK_VALUES['4'], RANK_VALUES['5']].sort((a, b) => a - b);
                const isAceLowStraight = uniqueRankValues.join(',') === aceLowStraightRanks.join(',');
                const isNormalStraight = (uniqueRankValues[4] - uniqueRankValues[0] === 4);
                if (isNormalStraight || isAceLowStraight) {
                    isStraight = true;
                    straightComparisonValue = isAceLowStraight ? (RANK_VALUES['3'] + 1) : uniqueRankValues[4];
                }
            }
        }
        const rankCounts = {}; ranks.forEach(rank => { rankCounts[rank] = (rankCounts[rank] || 0) + 1; });
        const counts = Object.values(rankCounts).sort((a, b) => b - a);
        const distinctRanks = Object.keys(rankCounts);

        if (n === 5 && isStraight && isFlush) return { isValid: true, type: HAND_TYPES.STRAIGHT_FLUSH, cards: sortedCards, primaryRankValue: straightComparisonValue, suitValue: SUIT_VALUES[sortedCards[0].suit] };
        if (counts[0] === 3 && counts[1] === 2 && n === 5) { const threeRank = distinctRanks.find(rank => rankCounts[rank] === 3); return { isValid: true, type: HAND_TYPES.FULL_HOUSE, cards: sortedCards, primaryRankValue: RANK_VALUES[threeRank] }; }
        if (isFlush && n === 5) return { isValid: true, type: HAND_TYPES.FLUSH, cards: sortedCards };
        if (isStraight && n === 5) return { isValid: true, type: HAND_TYPES.STRAIGHT, cards: sortedCards, primaryRankValue: straightComparisonValue };
        if (counts[0] === 3 && n === 3) { const threeRank = distinctRanks.find(rank => rankCounts[rank] === 3); const repCard = sortedCards[0]; return { isValid: true, type: HAND_TYPES.THREE_OF_A_KIND, cards: sortedCards, primaryRankValue: RANK_VALUES[threeRank], representativeCard: repCard }; }
        if (counts[0] === 2 && n === 2) { const pairRank = distinctRanks.find(rank => rankCounts[rank] === 2); const repCard = sortedCards[0]; return { isValid: true, type: HAND_TYPES.PAIR, cards: sortedCards, primaryRankValue: RANK_VALUES[pairRank], representativeCard: repCard }; }
        if (n === 1) { const repCard = sortedCards[0]; return { isValid: true, type: HAND_TYPES.SINGLE, cards: sortedCards, primaryRankValue: RANK_VALUES[ranks[0]], representativeCard: repCard }; }
        if (counts[0] === 4) return { isValid: false, message: "不允许出四条炸弹。" }; // Explicitly disallow

        return { isValid: false, message: "无法识别的牌型或不允许的出牌组合。" };
     }

    checkValidPlay(cardsToPlay, currentHand, centerPileInfo, isFirstTurn) { /* ... Keep implementation from previous step ... */
         const newHandInfo = this.getHandInfo(cardsToPlay);
         if (!newHandInfo.isValid) return { valid: false, message: newHandInfo.message || "无效的牌型。" };
         if (isFirstTurn) {
             const hasD4 = cardsToPlay.some(c => c.suit === 'D' && c.rank === '4');
             if (!hasD4) return { valid: false, message: "第一回合必须包含方块4。" };
             return { valid: true, handInfo: newHandInfo };
         } else {
             if (!centerPileInfo) return { valid: true, handInfo: newHandInfo }; // Pile empty
             // Check type match (no bombs, so must match)
             if (newHandInfo.type !== centerPileInfo.type) return { valid: false, message: `必须出与上家相同类型的牌 (${centerPileInfo.type})。` };
             // Compare hands of the same type
             const comparison = compareHands(newHandInfo, centerPileInfo);
             if (comparison > 0) return { valid: true, handInfo: newHandInfo };
             else return { valid: false, message: `出的 ${newHandInfo.type} 必须大于上家的。` };
         }
     }


    // --- Scoring ---
    checkInstantGameOver() { /* ... Keep implementation from previous step ... */
        const nFinished = this.finishOrder.length;
        if (nFinished < 2 && this.gameMode === 'standard') return { isOver: false }; // Standard needs at least 2 to sometimes decide
        if (nFinished < 1 && this.gameMode === 'double_landlord') return { isOver: false}; // DD needs at least 1

        const finishRoles = this.finishOrder.map(playerId => this.playerRoles[playerId]);
        let resultDescription = null; let isOver = false;

        if (this.gameMode === 'standard') {
            const rolesStr = finishRoles.join('');
            if (rolesStr.startsWith('DD')) { resultDescription = "地主大胜"; isOver = true; }
            else if (rolesStr.startsWith('FF')) { resultDescription = "农民大胜"; isOver = true; }
            else if (rolesStr === 'DFDF') { resultDescription = "地主胜"; isOver = true; }
            else if (rolesStr === 'FDFD') { resultDescription = "农民胜"; isOver = true; }
            else if (rolesStr === 'DFFD' || rolesStr === 'FDDF') { resultDescription = "打平"; isOver = true; }
             // Check if enough players finished to guarantee outcome even if not full string match
            else if (nFinished >= 2) {
                 // If first two are D,D -> 地主大胜 guaranteed
                 if (finishRoles[0] === 'D' && finishRoles[1] === 'D') { resultDescription = "地主大胜"; isOver = true; }
                 // If first two are F,F -> 农民大胜 guaranteed
                 else if (finishRoles[0] === 'F' && finishRoles[1] === 'F') { resultDescription = "农民大胜"; isOver = true; }
            }
             // Add check for 3 players finished if needed for tie/single win determination
             else if (nFinished >= 3) {
                 // FDF -> Farmer Win guaranteed? Yes.
                 if (rolesStr.startsWith('FDF')) { resultDescription = "农民胜"; isOver = true; }
                 // DFD -> Landlord Win guaranteed? Yes.
                 else if (rolesStr.startsWith('DFD')) { resultDescription = "地主胜"; isOver = true; }
                 // FDD -> Tie guaranteed? Yes.
                 else if (rolesStr.startsWith('FDD')) { resultDescription = "打平"; isOver = true; }
                 // DFF -> Tie guaranteed? Yes.
                 else if (rolesStr.startsWith('DFF')) { resultDescription = "打平"; isOver = true; }
             }

        } else { // Double Landlord
            const rolesStr = finishRoles.join(''); // DD is represented as D here
            if (rolesStr.startsWith('D')) { resultDescription = "双地主大胜"; isOver = true; }
            else if (rolesStr === 'FDFF') { resultDescription = "双地主胜"; isOver = true; } // Need full order
            else if (rolesStr === 'FFDF') { resultDescription = "农民胜"; isOver = true; } // Need full order
            else if (rolesStr === 'FFFD') { resultDescription = "农民大胜"; isOver = true; } // Need full order
            else if (nFinished >= 3 && finishRoles[0] === 'F' && finishRoles[1] === 'F' && finishRoles[2] === 'F') { // FFF...
                 resultDescription = "农民大胜"; isOver = true;
            }
             // Check for 3 players finished to determine FDFF vs FFDF
             else if (nFinished >= 3) {
                 // F D F... guarantees FDFF (DD Win)
                 if (rolesStr.startsWith('FDF')) { resultDescription = "双地主胜"; isOver = true; }
                 // F F D... guarantees FFDF (Farmer Win)
                 else if (rolesStr.startsWith('FFD')) { resultDescription = "农民胜"; isOver = true; }
             }
        }
        return { isOver, resultDescription };
     }

    calculateScoresBasedOnResult(resultDescription) { /* ... Keep implementation from previous step ... */
         const scoreChanges = {}; let landlordScoreChange = 0; let farmerScoreChange = 0; let ddScoreChange = 0;
         console.log(`[SCORE] Calculating scores based on early result: ${resultDescription}`);
         if (this.gameMode === 'standard') {
             switch (resultDescription) {
                 case "打平": landlordScoreChange = 0; farmerScoreChange = 0; break;
                 case "地主胜": landlordScoreChange = 1; farmerScoreChange = -1; break;
                 case "农民胜": landlordScoreChange = -1; farmerScoreChange = 1; break;
                 case "地主大胜": landlordScoreChange = 2; farmerScoreChange = -2; break;
                 case "农民大胜": landlordScoreChange = -2; farmerScoreChange = 2; break;
                 default: console.warn(`[SCORE] Unknown standard result: ${resultDescription}`);
             }
             this.players.forEach(p => { scoreChanges[p.id] = (this.playerRoles[p.id] === 'D') ? landlordScoreChange : farmerScoreChange; });
         } else { // Double Landlord
             switch (resultDescription) {
                 case "双地主大胜": ddScoreChange = 6; farmerScoreChange = -2; break;
                 case "双地主胜": ddScoreChange = 3; farmerScoreChange = -1; break;
                 case "农民胜": ddScoreChange = -3; farmerScoreChange = 1; break;
                 case "农民大胜": ddScoreChange = -6; farmerScoreChange = 2; break;
                 default: console.warn(`[SCORE] Unknown double landlord result: ${resultDescription}`);
             }
              this.players.forEach(p => { scoreChanges[p.id] = (this.playerRoles[p.id] === 'DD') ? ddScoreChange : farmerScoreChange; });
         }
         console.log(`[SCORE] Result: ${resultDescription}`);
         this.players.forEach(p => {
             const change = scoreChanges[p.id] || 0;
             p.score += change; // Accumulate total score
             console.log(`[SCORE] Player ${p.name} (${this.playerRoles[p.id]}): ${change >= 0 ? '+' : ''}${change} -> New Total Score: ${p.score}`);
         });
          return {
              result: resultDescription,
              // Return score *changes* for this round's display
              scoreChanges: scoreChanges,
              // Also return final scores if needed immediately
              finalScores: this.players.map(p => ({ id: p.id, name: p.name, score: p.score, role: this.playerRoles[p.id] }))
          };
      }

    endGame(reason = "Game finished") { /* ... Keep implementation from previous step ... */
          if (this.gameFinished) return null;
          this.gameFinished = true; this.gameStarted = false;
          console.log(`[GAME ${this.roomId}] Game ended. Reason: ${reason}`);
          // Ensure finishOrder is complete if ended abruptly
          if (this.finishOrder.length < this.players.length) {
               const finishedIds = new Set(this.finishOrder);
               this.players.forEach(p => { if (!finishedIds.has(p.id)) this.finishOrder.push(p.id); });
          }
          // Score calculation is handled when gameOver is detected in playCard
          // This function just marks the end state
          return null; // No need to return scores here if playCard does
     }

    // --- Utility ---
    createDeck() { /* ... unchanged ... */
        const suits = ["H", "D", "C", "S"];
        const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
        this.deck = [];
        for (const suit of suits) { for (const rank of ranks) { this.deck.push({ suit, rank }); } }
     }
    shuffleDeck() { /* ... unchanged ... */
         for (let i = this.deck.length - 1; i > 0; i--) { const j = Math.floor(crypto.randomInt(i + 1));[this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]]; }
     }
    dealCards(cardsPerPlayer) { /* ... unchanged ... */
         let playerIdx = 0; const totalCardsToDeal = cardsPerPlayer * this.players.length;
         if (totalCardsToDeal > this.deck.length) { console.error(`Not enough cards`); return; }
         for (let i = 0; i < totalCardsToDeal; i++) { const player = this.players[playerIdx % this.players.length]; if (player) player.hand.push(this.deck.pop()); playerIdx++; }
         this.players.forEach(player => this.sortHand(player.hand)); // Initial sort
     }
    sortHand(hand) { hand.sort(compareSingleCards); } // Default sort

    getStateForPlayer(requestingPlayerId) {
        // Include necessary state for client rendering and logic
        return {
            players: this.players.map(p => ({
                id: p.id, name: p.name, slot: p.slot, score: p.score,
                role: this.playerRoles[p.id], finished: p.finished,
                connected: p.connected,
                hand: p.id === requestingPlayerId ? p.hand : undefined,
                handCount: p.hand.length,
            })),
            centerPile: [...this.centerPile],
            lastHandInfo: this.lastValidHandInfo ? { type: this.lastValidHandInfo.type } : null, // Send type only? Or more?
            currentPlayerId: this.gameFinished ? null : this.players[this.currentPlayerIndex]?.id,
            isFirstTurn: this.firstTurn,
            gameStarted: this.gameStarted,
            gameFinished: this.gameFinished,
            winnerId: this.winnerId,
            gameMode: this.gameMode,
            // finishOrder: [...this.finishOrder] // Maybe not needed by client directly?
        };
    }
}

module.exports = { Game };
