// game/room.js (部分修改)
// ...
// const { validateArrangement, calculateScores, checkOverallSpecialHand } = require('./gameLogic'); // 更新引入
// ...

    processRoundResults() {
        this.logEvent("所有玩家已提交，开始比牌...");
        const playersArray = Object.values(this.players);
        const allRoundResults = { // 存储整个房间本轮所有比较和得分
            playerDetails: {}, // {playerId: {username, hand, evaluatedHand, overallSpecial, roundScore, totalScore}}
            comparisons: [] // {playerA_id, playerB_id, p1ScoreChange, p2ScoreChange, details}
        };

        // 1. 准备玩家数据和评估特殊牌型
        playersArray.forEach(p => {
            p.currentRoundScore = 0; // 初始化本轮得分
            p.overallSpecialHand = checkOverallSpecialHand(p.hand); // 判断全局特殊牌型
            if (p.overallSpecialHand) {
                this.logEvent(`${p.username} 有特殊牌型: ${p.overallSpecialHand.name}`);
            }
            allRoundResults.playerDetails[p.id] = {
                username: p.username,
                hand: this.playerSubmittedHandsRaw[p.id],
                evaluatedHand: this.playerArrangements[p.id],
                overallSpecial: p.overallSpecialHand ? p.overallSpecialHand.name : null,
                roundScore: 0, // 稍后更新
                totalScore: p.score // 当前总分
            };
        });

        // 2. 两两比较计分
        for (let i = 0; i < playersArray.length; i++) {
            for (let j = i + 1; j < playersArray.length; j++) {
                const playerA = playersArray[i];
                const playerB = playersArray[j];

                const arrangedA = this.playerArrangements[playerA.id];
                const arrangedB = this.playerArrangements[playerB.id];
                
                const scoreResult = calculateScores(
                    arrangedA,
                    arrangedB,
                    playerA.overallSpecialHand,
                    playerB.overallSpecialHand
                );

                playerA.currentRoundScore += scoreResult.p1Score;
                playerB.currentRoundScore += scoreResult.p2Score;

                allRoundResults.comparisons.push({
                    playerA_id: playerA.id,
                    playerB_id: playerB.id,
                    playerA_score_change: scoreResult.p1Score,
                    playerB_score_change: scoreResult.p2Score,
                    details: scoreResult.details
                });
                this.logEvent(`${playerA.username} vs ${playerB.username}: A得分 ${scoreResult.p1Score}, B得分 ${scoreResult.p2Score}. ${scoreResult.details.reason}`);
            }
        }

        // 3. 更新玩家总分并整理最终结果
        playersArray.forEach(p => {
            p.score += p.currentRoundScore;
            allRoundResults.playerDetails[p.id].roundScore = p.currentRoundScore;
            allRoundResults.playerDetails[p.id].totalScore = p.score; // 更新后的总分
            this.logEvent(`${p.username} 本局总得分: ${p.currentRoundScore}, 房间总积分: ${p.score}`);
        });

        this.roundResults = allRoundResults; // 保存本轮详细结果
        this.broadcastToRoom('roundEnd', this.roundResults);
        this.endRoundAndReset(false);
    }
// ...
