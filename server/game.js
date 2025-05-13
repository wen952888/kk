// server/game.js

const SUITS = ['diamonds', 'clubs', 'hearts', 'spades'];
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

// Values for comparison (higher is better)
const RANK_VALUES = {
    '3': 0, '4': 1, '5': 2, '6': 3, '7': 4, '8': 5, '9': 6, '10': 7,
    'J': 8, 'Q': 9, 'K': 10, 'A': 11, '2': 12
};
const SUIT_VALUES = { 'diamonds': 0, 'clubs': 1, 'hearts': 2, 'spades': 3 };

// For image filenames
const RANK_TO_FILENAME_PART = {
    '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
    'J': 'jack', 'Q': 'queen', 'K': 'king', 'A': 'ace', '2': '2'
};

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.value = RANK_VALUES[rank];
        this.suitValue = SUIT_VALUES[suit];
        this.id = `${rank}-${suit}`; // Unique ID for selection
        this.image = `${RANK_TO_FILENAME_PART[rank]}_of_${suit}.png`;
    }

    toString() {
        return `${this.rank}${this.suit.charAt(0).toUpperCase()}`;
    }

    // Comparison for sorting and evaluation
    compareTo(otherCard) {
        if (this.value !== otherCard.value) {
            return this.value - otherCard.value;
        }
        return this.suitValue - otherCard.suitValue;
    }
}

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push(new Card(suit, rank));
        }
    }
    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// --- Hand Evaluation Logic ---
// This is the most complex part and needs careful implementation
// For simplicity, we'll implement basic hand types. More complex ones can be added.

function getHandDetails(cards) {
    if (!cards || cards.length === 0) return null;
    cards.sort((a, b) => a.compareTo(b)); // Sort for easier evaluation

    const n = cards.length;
    const ranks = cards.map(c => c.rank);
    const suits = cards.map(c => c.suit);
    const values = cards.map(c => c.value);
    const highestCard = cards[n - 1];

    // Single
    if (n === 1) return { type: 'single', cards, rankValue: highestCard.value, highestCard, sortKey: highestCard.value * 10 + highestCard.suitValue };

    // Pair
    if (n === 2 && ranks[0] === ranks[1]) return { type: 'pair', cards, rankValue: highestCard.value, highestCard, sortKey: highestCard.value * 10 + highestCard.suitValue };

    // Triple
    if (n === 3 && ranks[0] === ranks[1] && ranks[1] === ranks[2]) return { type: 'triple', cards, rankValue: highestCard.value, highestCard, sortKey: highestCard.value };

    // Five-card hands
    if (n === 5) {
        const isFlush = suits.every(s => s === suits[0]);
        
        const uniqueSortedValues = [...new Set(values)].sort((a,b) => a-b);
        let isStraight = uniqueSortedValues.length === 5 && (uniqueSortedValues[4] - uniqueSortedValues[0] === 4);
        // Special case: A-2-3-4-5 (A is high, but acts low in this straight)
        // Values: 3=0, 4=1, 5=2, ..., A=11, 2=12
        // A2345 -> ranks: A,2,3,4,5 -> values: 11,12,0,1,2. Sorted: 0,1,2,11,12. Not contiguous.
        // For straights, let A be 11, K=10, Q=9, J=8, T=7, ..., 3=0. '2' cannot be in normal straights.
        // Or, map ranks to a linear sequence for straight checking: 3,4,5,6,7,8,9,10,J,Q,K,A,2
        // (A,2,3,4,5) and (10,J,Q,K,A) are special. (2,3,4,5,6) is also a straight type.
        // Let's use a simplified straight definition: contiguous ranks using RANK_VALUES, where 2 is highest.
        // A straight is 5 cards with consecutive ranks.
        // Example: 3,4,5,6,7. Values: 0,1,2,3,4.
        // Example: 10,J,Q,K,A. Values: 7,8,9,10,11.
        // Example: A,2,3,4,5 (special, usually lowest or second lowest). Values: 11,12,0,1,2. We will treat A as high.
        // For Big Two, 2-3-4-5-6 is a valid straight, and 10-J-Q-K-A is the highest. A-2-3-4-5 is not typical.
        // Let's adjust RANK_VALUES for straight checks if necessary, or handle '2' specially.
        // For simplicity: straight uses normal rank order, 2 is highest.
        // So J,Q,K,A,2 is NOT a straight. 10,J,Q,K,A IS a straight. 9,10,J,Q,K is a straight. A,2,3,4,5 is NOT.
        
        // Simplified straight check:
        isStraight = true;
        for(let i=0; i < 4; i++) {
            if(RANK_VALUES[cards[i+1].rank] - RANK_VALUES[cards[i].rank] !== 1) {
                 // Check for A,2,3,4,5 (A is high, so this isn't a simple sequence)
                const isAceLowStraight = ranks.join('') === "345A2"; // This is tricky. Let's disallow A-2-3-4-5 for now.
                                                               // And 2-3-4-5-6
                // 10-J-Q-K-A is the highest straight.
                // J-Q-K-A-2 is not a straight.
                if (ranks.join('') === "A2345" || ranks.join('') === "23456") { // These are not standard high straights
                     // A-2-3-4-5 would be [A,3,4,5,2] after sorting. Ranks ['3','4','5','A','2']
                     // Sorted: 3,4,5,A,2. Values: 0,1,2,11,12
                     // No, the above rank sort is wrong. A card sort should be:
                     // [3d, 4s, 5h, Ac, 2s]
                     // Let's assume standard straights: 34567 up to 10JQKA
                     if(ranks.join('') === "10JQKA") { // Ranks: 10,J,Q,K,A
                         // This is the highest straight.
                     } else if (ranks.join('') === "A2345") {
                        // This would be a A,2,3,4,5 straight using rank values, needs specific handling
                        // For Big Two it's usually not like this.
                        // The player can choose to make Ace low for A-2-3-4-5 or high for 10-J-Q-K-A
                        // For now, let's only allow standard straights 3-4-5-6-7 up to 10-J-Q-K-A
                        // A (11), K (10), Q (9), J (8), 10 (7)
                        isStraight = true;
                     } else {
                        isStraight = false;
                     }
                     break; // Exit loop
                } else {
                    isStraight = false;
                    break;
                }
            }
        }
        // Correct straight check:
        // Sort by rank only, not suit for straight check.
        const tempCardsForStraight = [...cards].sort((a,b) => RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
        isStraight = true;
        for(let i=0; i < 4; i++) {
            if(RANK_VALUES[tempCardsForStraight[i+1].rank] - RANK_VALUES[tempCardsForStraight[i].rank] !== 1) {
                isStraight = false;
                break;
            }
        }
        // Handle A-2-3-4-5 (values: 0,1,2,3,11 after rank sort) -> rank array ['3','4','5','6','A'] no, ranks are '3','4','5','A','2'
        // If ranks are 'A', '2', '3', '4', '5' (Ace low straight) -> this is complex because '2' is high.
        // Big Two straight: Any 5 cards in sequence. 2-3-4-5-6 is highest before 10-J-Q-K-A in some rules.
        // We use: 10-J-Q-K-A (highest), A-2-3-4-5 (second highest). Other straights by highest card.
        // Let's define rank order for straights explicitly: 3,4,5,6,7,8,9,10,J,Q,K,A,2
        const straightRankOrder = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
        const getStraightRank = (rank) => straightRankOrder.indexOf(rank);

        let isStraightV2 = true;
        const tempCardsForStraightV2 = [...cards].sort((a,b) => getStraightRank(a.rank) - getStraightRank(b.rank));
        for(let i=0; i < 4; i++) {
            if(getStraightRank(tempCardsForStraightV2[i+1].rank) - getStraightRank(tempCardsForStraightV2[i].rank) !== 1) {
                 // Special case 10-J-Q-K-A (ranks: 10,J,Q,K,A) -> straightRanks: 7,8,9,10,11 (Indices)
                 // Special case A-2-3-4-5 (ranks: A,2,3,4,5) -> straightRanks: 11,12,0,1,2 -> sorted indices 0,1,2,11,12. This is a "wheel straight"
                if (ranks.sort().join(',') === ['A','J','K','Q','10'].sort().join(',')) { // 10 J Q K A
                    // highest card is A, but for comparison, use A's rank
                } else if (ranks.sort().join(',') === ['A','2','3','4','5'].sort().join(',')) { // A 2 3 4 5
                    // highest card is 5 (or A if A is treated as high for ranking)
                } else {
                   isStraightV2 = false;
                }
                break;
            }
        }
        // This straight logic is very tricky. For now, a simpler definition:
        // Straight: highest card determines rank. For 10JQKA, A is highest. For 34567, 7 is highest.
        // Flush: highest card, then suit of highest card.
        // Full House: rank of the triple.
        // Four of a kind: rank of the four.
        // Straight Flush: highest card, then suit of highest card.

        const rankCounts = ranks.reduce((acc, rank) => { acc[rank] = (acc[rank] || 0) + 1; return acc; }, {});
        const counts = Object.values(rankCounts);

        if (isStraightV2 && isFlush) return { type: 'straight_flush', cards, rankValue: highestCard.value, highestCard, sortKey: 800 + highestCard.value * 10 + highestCard.suitValue };
        if (counts.includes(4)) {
            const fourRank = Object.keys(rankCounts).find(r => rankCounts[r] === 4);
            return { type: 'four_of_a_kind', cards, rankValue: RANK_VALUES[fourRank], highestCard: cards.find(c=>c.rank === fourRank) || highestCard, sortKey: 700 + RANK_VALUES[fourRank] };
        }
        if (counts.includes(3) && counts.includes(2)) {
            const tripleRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
            return { type: 'full_house', cards, rankValue: RANK_VALUES[tripleRank], highestCard: cards.find(c=>c.rank === tripleRank) || highestCard, sortKey: 600 + RANK_VALUES[tripleRank] };
        }
        if (isFlush) return { type: 'flush', cards, rankValue: highestCard.value, highestCard, sortKey: 500 + highestCard.value * 10 + highestCard.suitValue }; // Suit matters
        if (isStraightV2) {
            // For 10-J-Q-K-A, highest is A. For A-2-3-4-5, highest is 5 (or A if A always high).
            // For Big Two, A-2-3-4-5 is usually ranked with 5 as high card if Ace is low for sequence.
            // Let's use the absolute highest card in the straight based on RANK_VALUES
            let straightHighCard = highestCard;
            if (ranks.sort().join(',') === ['A','2','3','4','5'].sort().join(',')) { // A 2 3 4 5
                straightHighCard = cards.find(c => c.rank === '5') || highestCard; // Use 5 as ranking card for A2345
                 return { type: 'straight', cards, rankValue: RANK_VALUES['5'], highestCard: straightHighCard, sortKey: 400 + RANK_VALUES['5'] * 10 + straightHighCard.suitValue };
            }
            return { type: 'straight', cards, rankValue: highestCard.value, highestCard, sortKey: 400 + highestCard.value * 10 + highestCard.suitValue };
        }
    }
    return { type: 'invalid', cards }; // Or null
}


// Simplified canPlayOver: returns true if playHand can beat lastHand
function canPlayOver(playHandDetails, lastHandDetails) {
    if (!lastHandDetails) return true; // First play of a trick

    const playType = playHandDetails.type;
    const lastType = lastHandDetails.type;

    // Bombs can beat smaller non-bomb hands
    const isPlayBomb = playType === 'four_of_a_kind' || playType === 'straight_flush';
    const isLastBomb = lastType === 'four_of_a_kind' || lastType === 'straight_flush';

    if (isPlayBomb && !isLastBomb) {
        if (lastType === 'single' || lastType === 'pair' || lastType === 'triple' || (playHandDetails.cards.length === 5 && (lastType === 'straight' || lastType === 'flush' || lastType === 'full_house'))) {
            return true;
        }
    }
    
    if (playHandDetails.cards.length !== lastHandDetails.cards.length) {
        if(isPlayBomb && lastHandDetails.cards.length < 5) return true; // Bomb can beat smaller card count hands if not 5 card hands
        if(isPlayBomb && lastHandDetails.cards.length === 5 && !isLastBomb) return true;
        return false; // Must play same number of cards (unless bomb)
    }


    if (playType !== lastType) {
         if(isPlayBomb && isLastBomb) { // Both bombs, compare bomb strength
            // SF beats FoK
            if(playType === 'straight_flush' && lastType === 'four_of_a_kind') return true;
            if(playType === 'four_of_a_kind' && lastType === 'straight_flush') return false;
            // Same bomb type, compare by rankValue (already incorporated in sortKey)
         } else {
            return false; // Must be same type (unless bomb)
         }
    }
    
    // Compare by sortKey (already incorporates rank and suit for tie-breaking where appropriate)
    return playHandDetails.sortKey > lastHandDetails.sortKey;
}


class Game {
    constructor(playerIds) {
        this.players = playerIds.map(id => ({ id, hand: [], isTurn: false, hasPassed: false, connected: true }));
        this.deck = shuffleDeck(createDeck());
        this.lastPlayedHandDetails = null;
        this.lastPlayerWhoPlayed = null;
        this.currentPlayerIndex = -1;
        this.passCount = 0;
        this.isRoundOver = false;
        this.winner = null;
        this.gameLog = [];
        this.isGameStarted = false;
    }

    addLog(message) {
        this.gameLog.unshift(message); // Add to beginning
        if (this.gameLog.length > 10) this.gameLog.pop(); // Keep it short
    }

    dealCards() {
        let playerIdx = 0;
        this.deck.forEach(card => {
            this.players[playerIdx].hand.push(card);
            playerIdx = (playerIdx + 1) % this.players.length;
        });
        this.players.forEach(p => p.hand.sort((a, b) => a.compareTo(b)));
    }

    findStartingPlayer() {
        // Player with 3 of Diamonds starts
        const card3D = new Card('diamonds', '3');
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].hand.some(card => card.id === card3D.id)) {
                return i;
            }
        }
        return 0; // Fallback, should not happen in a 4 player game
    }

    startGame() {
        if (this.players.length < 2) { // Min 2 players, ideally 4
            this.addLog("Not enough players to start.");
            return false;
        }
        this.dealCards();
        this.currentPlayerIndex = this.findStartingPlayer();
        this.players.forEach((p, idx) => p.isTurn = (idx === this.currentPlayerIndex));
        this.isGameStarted = true;
        this.addLog(`Game started. Player ${this.players[this.currentPlayerIndex].id} (with 3♦) starts.`);
        return true;
    }

    playTurn(playerId, playedCardIds) {
        if (this.isRoundOver) return { success: false, message: "Round is over." };
        const player = this.players[this.currentPlayerIndex];
        if (player.id !== playerId) return { success: false, message: "Not your turn." };

        const playedCards = playedCardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean);
        if (playedCards.length !== playedCardIds.length) return { success: false, message: "Invalid card selection." };

        const playedHandDetails = getHandDetails(playedCards);
        if (!playedHandDetails || playedHandDetails.type === 'invalid') {
            return { success: false, message: "Invalid hand type." };
        }

        // First turn of the game, must include 3 of Diamonds
        if (!this.lastPlayerWhoPlayed && this.currentPlayerIndex === this.findStartingPlayer()) {
            const has3D = playedCards.some(c => c.rank === '3' && c.suit === 'diamonds');
            if (!has3D) {
                return { success: false, message: "First play must include the 3 of Diamonds." };
            }
        }
        
        if (!canPlayOver(playedHandDetails, this.lastPlayedHandDetails)) {
            return { success: false, message: "Your hand does not beat the current hand on table." };
        }

        // Play is valid
        player.hand = player.hand.filter(card => !playedCardIds.includes(card.id));
        player.hand.sort((a, b) => a.compareTo(b));
        this.lastPlayedHandDetails = playedHandDetails;
        this.lastPlayerWhoPlayed = player.id;
        this.passCount = 0; // Reset pass count
        this.players.forEach(p => p.hasPassed = false); // Reset pass status for all

        this.addLog(`Player ${player.id} played: ${playedCards.map(c => c.toString()).join(' ')} (${playedHandDetails.type})`);


        if (player.hand.length === 0) {
            this.isRoundOver = true;
            this.winner = player.id;
            this.addLog(`Player ${player.id} wins the round!`);
            this.players.forEach(p => p.isTurn = false);
            return { success: true, roundOver: true, winner: player.id };
        }

        this.moveToNextPlayer();
        return { success: true, roundOver: false };
    }

    passTurn(playerId) {
        if (this.isRoundOver) return { success: false, message: "Round is over." };
        const player = this.players[this.currentPlayerIndex];
        if (player.id !== playerId) return { success: false, message: "Not your turn." };
        if (!this.lastPlayerWhoPlayed) return { success: false, message: "Cannot pass on the first play of a trick."};


        player.hasPassed = true;
        this.passCount++;
        this.addLog(`Player ${player.id} passed.`);

        // If all other active players pass, the last player who played starts a new trick
        const activePlayers = this.players.filter(p => p.hand.length > 0);
        if (this.passCount >= activePlayers.length - 1 && this.lastPlayerWhoPlayed) {
            this.addLog(`All other players passed. Player ${this.lastPlayerWhoPlayed} starts a new trick.`);
            this.currentPlayerIndex = this.players.findIndex(p => p.id === this.lastPlayerWhoPlayed);
            this.lastPlayedHandDetails = null; // Clear table for new trick
            this.passCount = 0;
            this.players.forEach(p => {
                p.hasPassed = false;
                p.isTurn = (p.id === this.lastPlayerWhoPlayed);
            });
        } else {
            this.moveToNextPlayer();
        }
        return { success: true };
    }
    
    moveToNextPlayer() {
        this.players[this.currentPlayerIndex].isTurn = false;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        } while (this.players[this.currentPlayerIndex].hand.length === 0 || this.players[this.currentPlayerIndex].hasPassed); 
        // Skip players with no cards or who have already passed in this "sub-round"

        // If it cycles back to the player who last played (meaning everyone else passed or has no cards)
        // and that player hasn't won, they start a new trick.
        if (this.players[this.currentPlayerIndex].id === this.lastPlayerWhoPlayed && this.players[this.currentPlayerIndex].hand.length > 0) {
             // This condition is largely handled by the passCount logic now.
             // However, if a player wins, and turn tries to move to them, it should stop.
        }
        this.players[this.currentPlayerIndex].isTurn = true;
        this.addLog(`It's now Player ${this.players[this.currentPlayerIndex].id}'s turn.`);
    }


    // Get state for a specific player
    getGameStateForPlayer(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return null;

        return {
            myHand: player.hand.map(c => ({ rank: c.rank, suit: c.suit, id: c.id, image: c.image })),
            myId: playerId,
            isMyTurn: player.isTurn,
            players: this.players.map(p => ({
                id: p.id,
                cardCount: p.hand.length,
                isTurn: p.isTurn,
                hasPassed: p.hasPassed,
                isConnected: p.connected,
            })),
            lastPlayedHand: this.lastPlayedHandDetails ? this.lastPlayedHandDetails.cards.map(c => ({ rank: c.rank, suit: c.suit, id: c.id, image: c.image })) : [],
            lastPlayedHandType: this.lastPlayedHandDetails ? this.lastPlayedHandDetails.type : null,
            lastPlayerWhoPlayed: this.lastPlayerWhoPlayed,
            isRoundOver: this.isRoundOver,
            winner: this.winner,
            gameLog: this.gameLog,
            isGameStarted: this.isGameStarted,
            canStartGame: this.players.length === 4 && this.players.every(p => p.connected) && !this.isGameStarted
        };
    }

    addPlayer(playerId) {
        if (this.players.length >= 4) return false; // Game full
        if (this.players.find(p => p.id === playerId)) return true; // Already joined

        const existingDisconnectedPlayer = this.players.find(p => !p.connected);
        if (existingDisconnectedPlayer) {
            existingDisconnectedPlayer.id = playerId; // Reassign slot to new socket ID
            existingDisconnectedPlayer.connected = true;
            this.addLog(`Player ${playerId} reconnected.`);
        } else {
             this.players.push({ id: playerId, hand: [], isTurn: false, hasPassed: false, connected: true });
             this.addLog(`Player ${playerId} joined. Waiting for ${4 - this.players.length} more players.`);
        }
       
        return true;
    }

    removePlayer(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.connected = false; // Mark as disconnected
            this.addLog(`Player ${playerId} disconnected.`);
            if (this.isGameStarted) {
                // Handle disconnection during game (e.g., make them auto-pass or pause game)
                if(player.isTurn) {
                    this.passTurn(playerId); // Auto-pass if it was their turn
                }
            }
            // Check if all players disconnected
            if (this.players.every(p => !p.connected)) {
                this.addLog("All players disconnected. Resetting game.");
                // Optionally reset the game state entirely
                this.isGameStarted = false;
                this.players = [];
                this.lastPlayedHandDetails = null;
                this.lastPlayerWhoPlayed = null;
                // etc.
            }
        }
    }
}

module.exports = { Game, Card }; // Export Card if needed elsewhere, or just Game
