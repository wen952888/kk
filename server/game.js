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
        this.suit = suit;
        this.rank = rank;
        this.value = RANK_VALUES[rank];
        this.suitValue = SUIT_VALUES[suit];
        this.id = `${rank}-${suit}-${Math.random().toString(36).substring(2, 7)}`; // Ensure unique ID if cards are re-added
        this.image = `${RANK_TO_FILENAME_PART[rank]}_of_${suit}.png`;
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

// --- Hand Evaluation (Simplified for brevity, real Big Two eval is complex) ---
// This needs to be robust for actual gameplay.
// The `sortKey` is crucial for comparing hands of the same type.
// Higher sortKey means a stronger hand.
// Hand Type Power: Straight Flush (SF) > Four-of-a-Kind (FoK) > Full House (FH) > Flush > Straight
// Note: In Big Two, 2 is the highest card. A-2-3-4-5 and 2-3-4-5-6 are special straights.
// 10-J-Q-K-A is highest normal straight.
// For simplicity, this example might not perfectly implement all Big Two straight ranking nuances.

function getHandDetails(cards) {
    if (!cards || cards.length === 0) return { type: 'invalid', cards, sortKey: -1 };
    cards.sort((a, b) => a.compareTo(b));
    const n = cards.length;
    const ranks = cards.map(c => c.rank);
    const suits = cards.map(c => c.suit);
    const values = cards.map(c => c.value); // RANK_VALUES
    const highestCard = cards[n - 1];

    if (n === 1) return { type: 'single', cards, highestCard, sortKey: highestCard.value * 10 + highestCard.suitValue };
    if (n === 2 && ranks[0] === ranks[1]) return { type: 'pair', cards, highestCard, sortKey: 100 + highestCard.value * 10 + highestCard.suitValue };
    if (n === 3 && ranks[0] === ranks[1] && ranks[1] === ranks[2]) return { type: 'triple', cards, highestCard, sortKey: 200 + highestCard.value };

    if (n === 5) {
        const rankCounts = {};
        ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
        const counts = Object.values(rankCounts);

        // Straight flush and Four-of-a-kind are "bombs"
        const isFlush = suits.every(s => s === suits[0]);
        // Simplified straight check (does not perfectly handle A-2-3-4-5 vs 10-J-Q-K-A nuances of Big Two)
        // For Big Two, straights are: A2345 (A as 1, 2 as 2), 23456, ..., 9TJQK, TJQKA (A as 14)
        // We'll use a simpler value-based straight for now.
        let isStraight = true;
        const uniqueSortedValues = [...new Set(values)].sort((a,b) => a-b); // Use RANK_VALUES
        if (uniqueSortedValues.length === 5) {
             // Check for 10-J-Q-K-A (values: 7,8,9,10,11)
            if (uniqueSortedValues.join(',') === '7,8,9,10,11') isStraight = true;
            // Check for A-2-3-4-5 (values for 3,4,5,A,2 -> 0,1,2,11,12)
            else if (uniqueSortedValues.join(',') === '0,1,2,11,12') {
                isStraight = true; // Special Ace-low straight
                // For ranking, this straight is often ranked by the 5 or by Ace as low.
            } else { // Normal sequence
                for (let i = 0; i < 4; i++) {
                    if (uniqueSortedValues[i+1] - uniqueSortedValues[i] !== 1) {
                        isStraight = false; break;
                    }
                }
            }
        } else {
            isStraight = false;
        }


        if (isStraight && isFlush) {
            // SF rank uses highest card's value, then suit.
            // A2345 SF: rank by 5. TJQKA SF: rank by A.
            let sfRankCard = highestCard;
            if (uniqueSortedValues.join(',') === '0,1,2,11,12') sfRankCard = cards.find(c=>c.rank === '5') || highestCard;
            return { type: 'straight_flush', cards, highestCard: sfRankCard, sortKey: 800 + sfRankCard.value * 10 + sfRankCard.suitValue };
        }
        if (counts.includes(4)) {
            const fourRank = Object.keys(rankCounts).find(r => rankCounts[r] === 4);
            return { type: 'four_of_a_kind', cards, highestCard: cards.find(c => c.rank === fourRank), sortKey: 700 + RANK_VALUES[fourRank] };
        }
        if (counts.includes(3) && counts.includes(2)) {
            const tripleRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
            return { type: 'full_house', cards, highestCard: cards.find(c => c.rank === tripleRank), sortKey: 600 + RANK_VALUES[tripleRank] };
        }
        if (isFlush) return { type: 'flush', cards, highestCard, sortKey: 500 + highestCard.value * 10 + highestCard.suitValue }; // Big Two: suit of flush matters for tie break
        if (isStraight) {
            let sRankCard = highestCard;
            if (uniqueSortedValues.join(',') === '0,1,2,11,12') sRankCard = cards.find(c=>c.rank === '5') || highestCard;
            return { type: 'straight', cards, highestCard: sRankCard, sortKey: 400 + sRankCard.value * 10 + sRankCard.suitValue }; // Big Two: suit of highest card in straight matters for tie break
        }
    }
    return { type: 'invalid', cards, sortKey: -1, message: "Not a recognized hand type." };
}


function canPlayOver(playedHandDetails, currentTableHandDetails) {
    if (!currentTableHandDetails) return true; // First play of a trick.

    const playType = playedHandDetails.type;
    const tableType = currentTableHandDetails.type;

    const isPlayBomb = playType === 'four_of_a_kind' || playType === 'straight_flush';
    const isTableBomb = tableType === 'four_of_a_kind' || tableType === 'straight_flush';

    if (isPlayBomb && !isTableBomb) {
        // Bombs can beat any non-bomb 5-card hand, or any smaller hand if it's a different type
        if (currentTableHandDetails.cards.length < 5) return true;
        if (currentTableHandDetails.cards.length === 5) return true; // Bomb beats any 5-card non-bomb
    }

    // If not a bomb beating a non-bomb, card counts must match
    if (playedHandDetails.cards.length !== currentTableHandDetails.cards.length) {
        return false;
    }

    // If types are different (and it's not bomb vs non-bomb)
    if (playType !== tableType) {
        if (isPlayBomb && isTableBomb) { // Both are bombs
            // Straight flush beats four-of-a-kind
            if (playType === 'straight_flush' && tableType === 'four_of_a_kind') return true;
            if (playType === 'four_of_a_kind' && tableType === 'straight_flush') return false;
            // Otherwise, compare same-type bombs by sortKey
        } else {
            return false; // Must be same type if not bomb play
        }
    }

    // Same type, or same-type bombs: compare by sortKey
    return playedHandDetails.sortKey > currentTableHandDetails.sortKey;
}


class Game {
    constructor() {
        this.playerSlots = Array(MAX_PLAYERS).fill(null).map(() => ({
            playerId: null,
            displayName: null, // e.g. Player 1, or user chosen name
            hand: [],
            isTurn: false,
            hasPassed: false,
            connected: false,
            score: 0
        }));
        this.players = []; // Active player objects, might be redundant if playerSlots is primary
        this.deck = [];
        this.lastPlayedHandDetails = null;
        this.lastPlayerWhoPlayedIndex = -1; // Index in playerSlots
        this.currentPlayerIndex = -1;       // Index in playerSlots
        this.passCount = 0;
        this.isGameStarted = false;
        this.isRoundOver = false;
        this.roundWinnerSlotIndex = -1;
        this.gameLog = [];
        this.currentTrickStarterIndex = -1;

        this.addLog("Game created. Waiting for players.");
    }

    getPlayerById(playerId) {
        return this.playerSlots.find(p => p.playerId === playerId);
    }
    
    getPlayerSlotIndex(playerId) {
        return this.playerSlots.findIndex(p => p.playerId === playerId);
    }

    addLog(message) {
        this.gameLog.unshift(message);
        if (this.gameLog.length > 20) this.gameLog.pop();
    }

    addPlayer(playerId) {
        // Try to find an existing disconnected slot for this playerId (unlikely for new connections)
        const existingSlotForId = this.playerSlots.find(s => s.playerId === playerId && !s.connected);
        if (existingSlotForId) {
            existingSlotForId.connected = true;
            this.addLog(`Player ${playerId.substring(0,5)} reconnected.`);
            return { success: true, message: "Reconnected."};
        }

        // Try to find an empty slot
        const emptySlotIndex = this.playerSlots.findIndex(s => s.playerId === null);
        if (emptySlotIndex !== -1) {
            this.playerSlots[emptySlotIndex] = {
                ...this.playerSlots[emptySlotIndex], // keep score if any
                playerId: playerId,
                displayName: `P${emptySlotIndex + 1} (${playerId.substring(0,3)})`,
                hand: [],
                isTurn: false,
                hasPassed: false,
                connected: true,
            };
            this.addLog(`Player ${this.playerSlots[emptySlotIndex].displayName} joined slot ${emptySlotIndex + 1}.`);
            return { success: true, message: "Joined game."};
        }

        // Try to find a disconnected slot to take over (if game allows it)
        const disconnectedSlotIndex = this.playerSlots.findIndex(s => !s.connected && s.playerId !== null);
        if (disconnectedSlotIndex !== -1) {
             this.addLog(`Player ${playerId.substring(0,5)} took over disconnected slot ${disconnectedSlotIndex + 1}.`);
             this.playerSlots[disconnectedSlotIndex].playerId = playerId;
             this.playerSlots[disconnectedSlotIndex].displayName = `P${disconnectedSlotIndex + 1} (${playerId.substring(0,3)}) ( übernahm )`;
             this.playerSlots[disconnectedSlotIndex].connected = true;
             this.playerSlots[disconnectedSlotIndex].hand = []; // Give fresh hand if game not started
             this.playerSlots[disconnectedSlotIndex].isTurn = false;
             this.playerSlots[disconnectedSlotIndex].hasPassed = false;
             // If game started, this player is at a disadvantage, or rules needed for re-entry
             return { success: true, message: "Took over disconnected slot." };
        }

        this.addLog(`Player ${playerId.substring(0,5)} tried to join but game is full.`);
        return { success: false, message: "Game is full. No empty or disconnected slots available."};
    }

    removePlayer(playerId) {
        const slot = this.getPlayerById(playerId);
        if (slot) {
            this.addLog(`Player ${slot.displayName} disconnected.`);
            slot.connected = false;
            // Don't null out playerId immediately, to allow re-connection to same slot if desired
            // slot.playerId = null;
            // slot.displayName = null;
            if (slot.isTurn) {
                // If it was their turn, and game is running, treat as a pass or auto-play
                if (this.isGameStarted && !this.isRoundOver) {
                    this.addLog(`${slot.displayName} disconnected on their turn. Auto-passing.`);
                    this._handlePass(slot); // Internal pass logic
                }
            }
        }
    }

    startGame() {
        const connectedPlayers = this.playerSlots.filter(s => s.connected);
        if (connectedPlayers.length < 2) { // Min 2 players, ideally 4 for Big Two
            return { success: false, message: `Need at least 2 players to start. Currently ${connectedPlayers.length}.` };
        }
        if (this.isGameStarted) return { success: false, message: "Game already in progress." };

        this.isGameStarted = true;
        this.isRoundOver = false;
        this.deck = shuffleDeck(createDeck());
        this.lastPlayedHandDetails = null;
        this.lastPlayerWhoPlayedIndex = -1;
        this.passCount = 0;
        this.gameLog = ["Game started!"];

        // Deal cards only to connected players
        let cardDealIdx = 0;
        this.playerSlots.forEach(s => s.hand = []); // Clear hands

        for (let i = 0; i < 13; i++) { // Deal 13 cards
            for (let j = 0; j < connectedPlayers.length; j++) {
                if (this.deck.length > 0) {
                    const playerSlot = this.playerSlots.find(ps => ps.playerId === connectedPlayers[j].playerId);
                    if (playerSlot) {
                         playerSlot.hand.push(this.deck.pop());
                    }
                }
            }
        }
        this.playerSlots.forEach(s => {
            if (s.connected) s.hand.sort((a, b) => a.compareTo(b));
            s.isTurn = false;
            s.hasPassed = false;
        });

        // Find starting player (with 3 of Diamonds)
        const card3DId = '3-diamonds'; // Simplified check
        let startingPlayerSlotIndex = -1;
        for (let i = 0; i < this.playerSlots.length; i++) {
            if (this.playerSlots[i].connected && this.playerSlots[i].hand.some(card => card.rank === '3' && card.suit === 'diamonds')) {
                startingPlayerSlotIndex = i;
                break;
            }
        }
        // Fallback if 3D not found (e.g. fewer than 4 players, or bad deal) - start with first connected player
        if (startingPlayerSlotIndex === -1) {
            startingPlayerSlotIndex = this.playerSlots.findIndex(s => s.connected);
        }
        if (startingPlayerSlotIndex === -1) return { success: false, message: "Error: No connected players to start with."};


        this.currentPlayerIndex = startingPlayerSlotIndex;
        this.playerSlots[startingPlayerSlotIndex].isTurn = true;
        this.currentTrickStarterIndex = startingPlayerSlotIndex;
        this.addLog(`Player ${this.playerSlots[startingPlayerSlotIndex].displayName} starts (has 3♦ or is first).`);
        return { success: true };
    }

    _moveToNextPlayer() {
        if (this.isRoundOver) return;
        this.playerSlots[this.currentPlayerIndex].isTurn = false;
        let loopedOnce = false;
        let attempts = 0;
        const numSlots = this.playerSlots.length;

        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % numSlots;
            if (this.currentPlayerIndex === this.currentTrickStarterIndex && attempts > numSlots) { // Looped fully and everyone passed or is out
                 // This condition indicates the trick starter wins the trick by default if everyone else passed
                 // this.addLog(`Player ${this.playerSlots[this.currentTrickStarterIndex].displayName} wins the trick.`);
                 // this.lastPlayedHandDetails = null; // Clear table for new trick by this player
                 // this.passCount = 0;
                 // this.playerSlots.forEach(s => s.hasPassed = false);
                 // this.playerSlots[this.currentTrickStarterIndex].isTurn = true;
                 // this.currentPlayerIndex = this.currentTrickStarterIndex;
                 // return; // This logic is now within passTurn's check
            }
            attempts++;
            // Skip slots that are not part of the game, have no cards, or have already passed THIS TRICK
        } while (!this.playerSlots[this.currentPlayerIndex].connected ||
                 this.playerSlots[this.currentPlayerIndex].hand.length === 0 ||
                 this.playerSlots[this.currentPlayerIndex].hasPassed ||
                 attempts > numSlots * 2); // Safety break

        if (attempts > numSlots * 2) {
            // This should not happen if game logic is correct (e.g. round ends if one player left)
            this.addLog("Error in _moveToNextPlayer: Could not find next valid player.");
            this.isRoundOver = true; // Consider ending round
            this.roundWinnerSlotIndex = this.lastPlayerWhoPlayedIndex; // Or some other logic
            return;
        }

        this.playerSlots[this.currentPlayerIndex].isTurn = true;
        this.addLog(`It's now ${this.playerSlots[this.currentPlayerIndex].displayName}'s turn.`);
    }

    _handlePass(playerSlot) {
        playerSlot.hasPassed = true;
        this.passCount++;
        this.addLog(`${playerSlot.displayName} passed.`);

        const activePlayersInTrick = this.playerSlots.filter(s => s.connected && s.hand.length > 0 && !s.hasPassed);
        const totalActivePlayers = this.playerSlots.filter(s => s.connected && s.hand.length > 0);

        // If all other active players in the game have passed this trick, or are out of cards
        // The last player who played cards starts a new trick.
        if (this.passCount >= totalActivePlayers.length -1 && this.lastPlayerWhoPlayedIndex !== -1) {
            this.addLog(`${this.playerSlots[this.lastPlayerWhoPlayedIndex].displayName} wins the trick and starts a new one.`);
            this.currentPlayerIndex = this.lastPlayerWhoPlayedIndex;
            this.currentTrickStarterIndex = this.lastPlayerWhoPlayedIndex;
            this.lastPlayedHandDetails = null; // Clear table
            this.passCount = 0;
            this.playerSlots.forEach(s => {
                s.hasPassed = false; // Reset pass status for new trick
                s.isTurn = (s.playerId === this.playerSlots[this.currentPlayerIndex].playerId);
            });
            this.addLog(`New trick. ${this.playerSlots[this.currentPlayerIndex].displayName} to play.`);
        } else {
            this._moveToNextPlayer();
        }
    }


    passTurn(playerId) {
        if (this.isRoundOver) return { success: false, message: "Round is over." };
        const playerSlotIndex = this.getPlayerSlotIndex(playerId);
        if (playerSlotIndex === -1 || playerSlotIndex !== this.currentPlayerIndex) {
            return { success: false, message: "Not your turn or not in game." };
        }
        if (!this.lastPlayedHandDetails) {
            return { success: false, message: "Cannot pass if you are starting a new trick." };
        }
        const playerSlot = this.playerSlots[playerSlotIndex];
        this._handlePass(playerSlot);
        return { success: true };
    }


    playTurn(playerId, playedCardIds) {
        if (this.isRoundOver) return { success: false, message: "Round is over." };
        const playerSlotIndex = this.getPlayerSlotIndex(playerId);
        if (playerSlotIndex === -1 || playerSlotIndex !== this.currentPlayerIndex) {
            return { success: false, message: "Not your turn or not in game." };
        }

        const playerSlot = this.playerSlots[playerSlotIndex];
        const playedCards = playedCardIds
            .map(id => playerSlot.hand.find(c => c.id === id))
            .filter(Boolean); // Filter out undefined if IDs are bad

        if (playedCards.length !== playedCardIds.length || playedCards.length === 0) {
            return { success: false, message: "Invalid card selection." };
        }

        const playedHandDetails = getHandDetails(playedCards);
        if (playedHandDetails.type === 'invalid') {
            return { success: false, message: playedHandDetails.message || "Invalid hand type." };
        }

        // First turn of the game must include 3 of Diamonds
        if (!this.lastPlayedHandDetails && this.lastPlayerWhoPlayedIndex === -1) { // Very first play of the game
            const isStartingPlayerWith3D = this.playerSlots[this.currentPlayerIndex].hand.some(c => c.rank === '3' && c.suit === 'diamonds');
            if (isStartingPlayerWith3D) { // Only enforce if this player actually has 3D
                 const played3D = playedCards.some(c => c.rank === '3' && c.suit === 'diamonds');
                 if (!played3D) {
                    return { success: false, message: "First play of the game by starting player must include the 3 of Diamonds." };
                }
            }
        }

        if (!canPlayOver(playedHandDetails, this.lastPlayedHandDetails)) {
            return { success: false, message: "Your hand does not beat the current hand on table." };
        }

        // Play is valid
        playerSlot.hand = playerSlot.hand.filter(card => !playedCardIds.includes(card.id));
        playerSlot.hand.sort((a, b) => a.compareTo(b));

        this.lastPlayedHandDetails = playedHandDetails;
        this.lastPlayerWhoPlayedIndex = playerSlotIndex;
        this.passCount = 0; // Reset pass count for the new played hand
        this.playerSlots.forEach(s => s.hasPassed = false); // Reset pass status for all players for this new "sub-trick"
        this.currentTrickStarterIndex = playerSlotIndex; // This player is now the one to beat / starts next if all pass

        this.addLog(`${playerSlot.displayName} played: ${playedCards.map(c => c.toString()).join(' ')} (${playedHandDetails.type})`);

        if (playerSlot.hand.length === 0) {
            this.isRoundOver = true;
            this.roundWinnerSlotIndex = playerSlotIndex;
            playerSlot.score++; // Example scoring
            this.addLog(`Player ${playerSlot.displayName} wins the round! Current score: ${playerSlot.score}`);
            this.playerSlots.forEach(s => s.isTurn = false);
            return { success: true, roundOver: true, winner: playerSlot.displayName };
        }

        this._moveToNextPlayer();
        return { success: true, roundOver: false };
    }

    endGameDueToDisconnection() {
        this.addLog("Game ended due to disconnections.");
        this.isGameStarted = false; // Or a specific "paused/ended" state
        this.isRoundOver = true; // Mark round as over
        // Winner could be last active player, or no one
        this.roundWinnerSlotIndex = -1; // Or decide based on game rules for abandoned games
    }

    // Get state for a specific player
    getGameStateForPlayer(playerId) {
        const slot = this.getPlayerById(playerId);
        if (!slot && !this.playerSlots.some(s => s.playerId === null)) { // If no slot for ID AND no empty slots, maybe spectator?
            // Basic spectator state
            return this.getSpectatorState();
        }
        if (!slot) { // No specific slot for this ID, but maybe they can join
             return this.getLobbyState(); // Player not yet in a slot
        }


        return {
            myPlayerId: slot.playerId,
            myDisplayName: slot.displayName,
            myHand: slot.hand.map(c => ({ ...c })), // Send copy
            myIsTurn: slot.isTurn,
            myHasPassed: slot.hasPassed,
            playerSlots: this.playerSlots.map(s => ({
                playerId: s.playerId,
                displayName: s.displayName,
                cardCount: s.hand.length,
                isTurn: s.isTurn,
                hasPassed: s.hasPassed,
                connected: s.connected,
                score: s.score,
                isMe: s.playerId === playerId
            })),
            lastPlayedHand: this.lastPlayedHandDetails ? this.lastPlayedHandDetails.cards.map(c => ({ ...c })) : [],
            lastPlayedHandType: this.lastPlayedHandDetails ? this.lastPlayedHandDetails.type : null,
            lastPlayerWhoPlayed: this.lastPlayerWhoPlayedIndex !== -1 ? this.playerSlots[this.lastPlayerWhoPlayedIndex].displayName : null,
            isGameStarted: this.isGameStarted,
            isRoundOver: this.isRoundOver,
            roundWinner: this.roundWinnerSlotIndex !== -1 ? this.playerSlots[this.roundWinnerSlotIndex].displayName : null,
            gameLog: this.gameLog,
            canStartGame: !this.isGameStarted && this.playerSlots.filter(s => s.connected).length >= 2, // Min 2
            connectedPlayersCount: this.playerSlots.filter(s => s.connected).length,
            maxPlayers: MAX_PLAYERS,
        };
    }
    getLobbyState() { // For players connected but not yet in a slot, or if game full
        return {
            myPlayerId: null,
            myDisplayName: "Observer",
            myHand: [],
            myIsTurn: false,
            myHasPassed: false,
            playerSlots: this.playerSlots.map(s => ({
                playerId: s.playerId,
                displayName: s.displayName,
                cardCount: s.connected ? s.hand.length : 0, // Show 0 if not connected or no hand
                isTurn: s.isTurn,
                hasPassed: s.hasPassed,
                connected: s.connected,
                score: s.score,
                isMe: false
            })),
            lastPlayedHand: this.lastPlayedHandDetails ? this.lastPlayedHandDetails.cards.map(c => ({ ...c })) : [],
            lastPlayedHandType: this.lastPlayedHandDetails ? this.lastPlayedHandDetails.type : null,
            lastPlayerWhoPlayed: this.lastPlayerWhoPlayedIndex !== -1 ? this.playerSlots[this.lastPlayerWhoPlayedIndex].displayName : null,
            isGameStarted: this.isGameStarted,
            isRoundOver: this.isRoundOver,
            roundWinner: this.roundWinnerSlotIndex !== -1 ? this.playerSlots[this.roundWinnerSlotIndex].displayName : null,
            gameLog: this.gameLog,
            canStartGame: !this.isGameStarted && this.playerSlots.filter(s => s.connected).length >= 2,
            connectedPlayersCount: this.playerSlots.filter(s => s.connected).length,
            maxPlayers: MAX_PLAYERS,
            statusMessage: "You are observing. Game might be full or not started."
        };
    }

    getSpectatorState() { return this.getLobbyState(); } // Alias for now

    getPlayerListInfo() { // For quick updates on player joins/leaves
        return this.playerSlots.map(s => ({
            playerId: s.playerId,
            displayName: s.displayName,
            connected: s.connected,
        }));
    }
    getGameStartInfo() {
        return {
            startingPlayerName: this.playerSlots[this.currentPlayerIndex].displayName,
            message: `Game started! ${this.playerSlots[this.currentPlayerIndex].displayName} to play first.`
        };
    }
}

module.exports = { Game, Card };
