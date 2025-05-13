const crypto = require('crypto'); // For shuffling potentially

class Game {
    constructor(roomId, maxPlayers = 4) {
        this.roomId = roomId;
        this.maxPlayers = maxPlayers;
        this.players = []; // { id, name, slot, hand:[], score:0, connected: true }
        this.deck = [];
        this.centerPile = []; // Stores played cards (simple model: just the last card?)
        this.currentPlayerIndex = -1;
        this.gameStarted = false;
        this.gameFinished = false;
        this.winnerId = null;
    }

    // --- Player Management ---

    addPlayer(userId, username, slot) {
        if (this.players.length >= this.maxPlayers) {
            console.warn(`[GAME ${this.roomId}] Attempted to add player beyond max capacity.`);
            return false;
        }
        if (this.players.some(p => p.id === userId)) {
            console.warn(`[GAME ${this.roomId}] Player ${username} (${userId}) already in game.`);
             // Handle reconnect case if necessary (mark as connected)
             const p = this.players.find(pl=>pl.id === userId);
             if(p) p.connected = true;
            return true; // Allow reconnecting player state
        }

        this.players.push({
            id: userId,
            name: username,
            slot: slot,
            hand: [],
            score: 0,
            connected: true // Assume connected on add
        });
        // Sort players by slot for consistent turn order? Optional but good.
        this.players.sort((a, b) => a.slot - b.slot);
        console.log(`[GAME ${this.roomId}] Player ${username} added to game logic.`);
        return true;
    }

    removePlayer(userId) {
        // Instead of removing, mark as disconnected to preserve state/score/slot
        const player = this.players.find(p => p.id === userId);
        if (player) {
            player.connected = false;
            console.log(`[GAME ${this.roomId}] Player ${player.name} marked as disconnected in game logic.`);
            // If they were the current player, the disconnect handler in roomManager should advance the turn.
        }
    }

     markPlayerConnected(userId, isConnected) {
         const player = this.players.find(p => p.id === userId);
         if (player) {
             player.connected = !!isConnected;
             console.log(`[GAME ${this.roomId}] Player ${player.name} connection status set to ${player.connected}`);
         }
     }

    // --- Game Flow ---

    startGame(playerStartInfo) {
         // Reset game state for potential restart
         this.deck = [];
         this.centerPile = [];
         this.currentPlayerIndex = -1;
         this.gameStarted = false;
         this.gameFinished = false;
         this.winnerId = null;
         this.players.forEach(p => {
            p.hand = [];
            // p.score = 0; // Reset score only if starting a brand NEW game, not just a round
            p.connected = true; // Assume all players passed in are connected initially
        });


        // Ensure players in game logic match the players starting
        if (playerStartInfo.length !== this.maxPlayers) {
             return { success: false, message: `需要 ${this.maxPlayers} 名玩家开始游戏，当前只有 ${playerStartInfo.length} 名。` };
        }
        // Update player list based on start info (ensure names/ids/slots are correct)
         this.players = playerStartInfo.map(info => ({
             id: info.id,
             name: info.name,
             slot: info.slot,
             hand: [],
             score: 0, // Reset score at start of game
             connected: true
         })).sort((a, b) => a.slot - b.slot); // Ensure sorted by slot


        console.log(`[GAME ${this.roomId}] Starting game with players:`, this.players.map(p => p.name));
        this.createDeck();
        this.shuffleDeck();
        this.dealCards();
        this.gameStarted = true;
        // Determine starting player (e.g., random or slot 0)
        this.currentPlayerIndex = 0; // Start with player in slot 0
         // Ensure the first player is connected
         while (!this.players[this.currentPlayerIndex]?.connected) {
             this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
             // Safety break if all disconnected? Should be handled before startGame
         }


        console.log(`[GAME ${this.roomId}] Deck created (${this.deck.length}), shuffled, cards dealt.`);
        return { success: true };
    }

    playCard(playerId, card) {
        if (!this.gameStarted || this.gameFinished) {
            return { success: false, message: "游戏未开始或已结束。" };
        }
        const player = this.players[this.currentPlayerIndex];

        if (!player || player.id !== playerId) {
            return { success: false, message: "现在不是你的回合。" };
        }
        if (!player.connected) {
             return { success: false, message: "你当前处于断线状态。" };
        }

        // Find the card in the player's hand
        const cardIndex = player.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (cardIndex === -1) {
            return { success: false, message: "你手中没有这张牌。" };
        }

        // *** VITAL: Add your game's specific validation logic here! ***
        // Example: Can this card be played now? (e.g., based on centerPile)
        // const isValidMove = this.checkValidPlay(card, this.centerPile);
        // if (!isValidMove) {
        //    return { success: false, message: "不符合出牌规则。" };
        // }

        // Play the card: remove from hand, add to center pile
        const playedCard = player.hand.splice(cardIndex, 1)[0];
        this.centerPile.push(playedCard); // Add to history, or just keep last: this.centerPile = [playedCard];

        // Check for win condition (empty hand)
        if (player.hand.length === 0) {
            this.gameFinished = true;
            this.winnerId = player.id;
            // Scoring should happen here or be triggered from here
            // this.calculateScores();
            console.log(`[GAME ${this.roomId}] Player ${player.name} has played their last card!`);
             // Return winnerId in success result
             this.nextTurn(); // Still advance turn technically, though game is over
             return { success: true, winnerId: this.winnerId };
        } else {
             // Advance to the next player
             this.nextTurn();
             return { success: true };
        }

    }

    nextTurn(forceAdvance = false) {
        if (this.gameFinished && !forceAdvance) return; // Don't advance turn if game over unless forced (like on disconnect)

        if (this.players.length === 0) {
            this.currentPlayerIndex = -1;
            return;
        }

        let nextIndex = (this.currentPlayerIndex + 1) % this.players.length;
        let loopDetection = 0; // Prevent infinite loop if all players disconnect

        // Skip disconnected players
        while (!this.players[nextIndex]?.connected && loopDetection < this.players.length) {
            nextIndex = (nextIndex + 1) % this.players.length;
            loopDetection++;
        }

         // If loop detected (all remaining are disconnected), maybe end game?
         if (loopDetection >= this.players.length && this.players.some(p => p.connected)) {
              console.error(`[GAME ${this.roomId}] Infinite loop detected in nextTurn?`);
             // This case should ideally be handled by the disconnect logic ending the game earlier
             this.currentPlayerIndex = -1; // Indicate no valid player
         } else {
            this.currentPlayerIndex = nextIndex;
             // console.log(`[GAME ${this.roomId}] Turn advanced to player: ${this.players[this.currentPlayerIndex]?.name}`);
         }

    }

    endGame(reason = "Game finished") {
        this.gameFinished = true;
        this.gameStarted = false; // Mark as no longer actively started
        console.log(`[GAME ${this.roomId}] Game ended. Reason: ${reason}`);
        // Implement score calculation, cleanup etc.
    }


    // --- Card Handling ---

    createDeck() {
        const suits = ["H", "D", "C", "S"]; // Hearts, Diamonds, Clubs, Spades
        const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]; // T=10
        this.deck = [];
        for (const suit of suits) {
            for (const rank of ranks) {
                this.deck.push({ suit, rank });
            }
        }
        // Add Jokers if needed for your game
        // this.deck.push({ suit: 'J', rank: 'BJ' }); // Black Joker
        // this.deck.push({ suit: 'J', rank: 'RJ' }); // Red Joker
    }

    shuffleDeck() {
        // Fisher-Yates shuffle
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(crypto.randomInt(i + 1)); // Use crypto.randomInt for better randomness
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    dealCards() {
        // Example: Deal 13 cards to each of 4 players (standard for many games)
        // Adjust dealCount based on your game rules!
        const cardsPerPlayer = 13;
        let playerIdx = 0;
        for (let i = 0; i < cardsPerPlayer * this.players.length; i++) {
             const player = this.players[playerIdx % this.players.length];
             if (player && this.deck.length > 0) {
                 player.hand.push(this.deck.pop());
             }
             playerIdx++;
        }

        // Sort players' hands (optional, but nice for UI)
        this.players.forEach(player => this.sortHand(player.hand));
    }

     // Simple sort (can be customized based on game rules)
     sortHand(hand) {
         const rankOrder = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "BJ", "RJ"];
         const suitOrder = ["S", "C", "D", "H"]; // Example: Spades, Clubs, Diamonds, Hearts

         hand.sort((a, b) => {
             const rankDiff = rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
             if (rankDiff !== 0) return rankDiff;
             // If ranks are equal, sort by suit (optional)
             return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
         });
     }

    // --- State Generation ---

    getStateForPlayer(requestingPlayerId) {
        if (!this.gameStarted && !this.gameFinished) {
             // Return minimal state if game hasn't started or finished cleanly
             return {
                 players: this.players.map(p => ({
                     id: p.id,
                     name: p.name,
                     slot: p.slot,
                     score: p.score,
                     connected: p.connected,
                     hand: requestingPlayerId === p.id ? p.hand : undefined, // Show empty hand before start only to self
                     handCount: 0, // No cards dealt yet
                 })),
                 centerPile: [],
                 currentPlayerId: null,
                 gameStarted: false,
                 gameFinished: false,
             };
        }

        return {
            players: this.players.map(p => {
                const isSelf = p.id === requestingPlayerId;
                return {
                    id: p.id,
                    name: p.name,
                    slot: p.slot,
                    score: p.score,
                    connected: p.connected,
                    // Hand data depends on who is asking
                    hand: isSelf ? p.hand : undefined, // Only send full hand to the owner
                    handCount: p.hand.length, // Always send hand count
                };
            }),
            centerPile: this.centerPile.slice(-5), // Show last 5 played cards, adjust as needed
            currentPlayerId: this.gameFinished ? null : this.players[this.currentPlayerIndex]?.id, // No current player if finished
            gameStarted: this.gameStarted,
            gameFinished: this.gameFinished,
            winnerId: this.winnerId
        };
    }

     // Placeholder for checking valid plays according to game rules
     checkValidPlay(card, centerPile) {
         // IMPLEMENT YOUR GAME'S RULES HERE
         // e.g., check if card rank/suit matches top card on centerPile
         return true; // Default: allow any card
     }

     // Placeholder for scoring
     calculateScores() {
         // IMPLEMENT YOUR GAME'S SCORING RULES HERE
         console.log(`[GAME ${this.roomId}] Calculating scores... (Not implemented)`);
     }
}

module.exports = { Game };
