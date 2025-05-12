// game/gameLogic.js

// (之前的 RANK_VALUES, SUIT_VALUES, CARD_TYPES, sortCards, getRankCounts, getSuitCounts 保持不变)
// ...

const CARD_TYPES = { // 重新定义，增加一些特殊牌型的值
    HIGH_CARD: 0,       // 乌龙 / 散牌
    ONE_PAIR: 1,        // 对子
    TWO_PAIR: 2,        // 两对
    THREE_OF_A_KIND: 3, // 三条
    STRAIGHT: 4,        // 顺子
    FLUSH: 5,           // 同花
    FULL_HOUSE: 6,      // 葫芦 / 三带二
    FOUR_OF_A_KIND: 7,  // 铁支 / 四条 / 炸弹
    STRAIGHT_FLUSH: 8,  // 同花顺
    ROYAL_FLUSH: 9,     // 皇家同花顺 (同花A,K,Q,J,10)

    // 特殊牌型 (整手牌的，通常比所有普通牌型大)
    // 这些值可以很高，以确保它们优先
    THREE_FLUSHES: 50,          // 三同花
    THREE_STRAIGHTS: 51,        // 三顺子
    SIX_PAIRS_HALF: 52,         // 六对半
    FIVE_PAIRS_TRIPLE: 53,      // 五对冲三 (五对加一个三条)
    FOUR_TRIPLES: 54,           // 四套三条
    ALL_SMALL: 55,              // 全小 (所有牌都是 2-8)
    ALL_BIG: 56,                // 全大 (所有牌都是 8-A)
    SAME_COLOR_ACE_TO_KING: 57, // 凑一色 (全黑或全红)
    TWELVE_ROYALS: 58,          // 十二皇族 (12张J,Q,K,A)
    ONE_DRAGON: 59,             // 一条龙 (A-K不同花)
    THIRTEEN_DIFFERENT: 60,     // 十三张(十三幺/十三烂，各牌点数花色均不同)
    SUPREME_DRAGON: 61,         // 至尊青龙 (A-K同花)
};

// 计分规则 (示例，请根据您的规则调整)
const SCORE_RULES = {
    // 道次基础分
    SEGMENT_WIN: 1,
    // 特殊牌型在道中的加分
    FRONT_THREE_OF_A_KIND: 3, // 头道三条（冲三）
    MIDDLE_FULL_HOUSE: 2,     // 中道葫芦
    MIDDLE_FOUR_OF_A_KIND: 8, // 中道铁支
    MIDDLE_STRAIGHT_FLUSH: 10,// 中道同花顺
    BACK_FOUR_OF_A_KIND: 4,   // 尾道铁支
    BACK_STRAIGHT_FLUSH: 5,   // 尾道同花顺
    // 打枪/全垒打
    SCOOP_MULTIPLIER: 2,      // 打枪得分翻倍
    // 特殊整体牌型得分 (通常是与每个其他玩家结算的分数)
    // 这些分数通常很高，代表直接胜利并获得大量分数
    [CARD_TYPES.SUPREME_DRAGON]: 108, // 例如至尊青龙108分
    [CARD_TYPES.ONE_DRAGON]: 36,
    [CARD_TYPES.TWELVE_ROYALS]: 24,
    // ... 其他特殊牌型分数
};


// (evaluateHand 函数需要更健壮，特别是A2345顺子的处理)
function evaluateHand(cards) {
    // ... （之前的 evaluateHand 逻辑）
    // 确保A2345顺子处理：
    // if (isStraight && cards.length === 5 && uniqueRanks.toString() === [RANK_VALUES['A'], RANK_VALUES['5'], RANK_VALUES['4'], RANK_VALUES['3'], RANK_VALUES['2']].sort((a,b)=>b-a).toString()){
    //     return { type: CARD_TYPES.STRAIGHT, ranks: [RANK_VALUES['5'], RANK_VALUES['4'], RANK_VALUES['3'], RANK_VALUES['2'], RANK_VALUES['A']], name: "顺子 (A2345)", details: sortedCards, isA5Straight: true };
    // }
    // ...
    // 在返回结果中添加 isA5Straight 标志位，方便比较时用5作为最大牌
    const sortedCards = sortCards(cards);
    const ranks = sortedCards.map(c => RANK_VALUES[c.rank]);
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);

    const rankCounts = getRankCounts(sortedCards);
    const suitCounts = getSuitCounts(sortedCards);
    const isFlush = Object.values(suitCounts).some(count => count === cards.length);

    let isStraight = false;
    let isA5Straight = false;
    if (uniqueRanks.length === cards.length) {
        isStraight = uniqueRanks.every((rank, i) => i === 0 || rank === uniqueRanks[i-1] - 1);
        if (!isStraight && cards.length === 5 &&
            uniqueRanks[0] === RANK_VALUES['A'] && uniqueRanks[1] === RANK_VALUES['5'] && uniqueRanks[2] === RANK_VALUES['4'] && uniqueRanks[3] === RANK_VALUES['3'] && uniqueRanks[4] === RANK_VALUES['2']) {
            isStraight = true;
            isA5Straight = true;
        }
    }

    // 皇家同花顺 (A K Q J 10 同花)
    if (isStraight && isFlush && cards.length === 5 && !isA5Straight && uniqueRanks[0] === RANK_VALUES['A'] && uniqueRanks[4] === RANK_VALUES['10']) {
        return { type: CARD_TYPES.ROYAL_FLUSH, ranks: uniqueRanks, name: "皇家同花顺", details: sortedCards };
    }
    // 同花顺
    if (isStraight && isFlush) {
        const straightRanks = isA5Straight ? [RANK_VALUES['5'], RANK_VALUES['4'], RANK_VALUES['3'], RANK_VALUES['2'], RANK_VALUES['A']] : uniqueRanks;
        return { type: CARD_TYPES.STRAIGHT_FLUSH, ranks: straightRanks, name: "同花顺", details: sortedCards, isA5Straight };
    }
    // 铁支
    if (cards.length === 5) { // 5张牌的牌型
        const fourRank = Object.keys(rankCounts).find(r => rankCounts[r] === 4);
        if (fourRank) {
            const kicker = Object.keys(rankCounts).find(r => rankCounts[r] === 1);
            return { type: CARD_TYPES.FOUR_OF_A_KIND, ranks: [RANK_VALUES[fourRank], RANK_VALUES[kicker]], name: "铁支", details: sortedCards };
        }
    }
    // 葫芦
    if (cards.length === 5) {
        const threeRank = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
        const pairRank = Object.keys(rankCounts).find(r => rankCounts[r] === 2);
        if (threeRank && pairRank) {
            return { type: CARD_TYPES.FULL_HOUSE, ranks: [RANK_VALUES[threeRank], RANK_VALUES[pairRank]], name: "葫芦", details: sortedCards };
        }
    }
    // 同花
    if (isFlush) {
        return { type: CARD_TYPES.FLUSH, ranks: ranks, name: "同花", details: sortedCards }; // ranks应该是排序后的点数
    }
    // 顺子
    if (isStraight) {
        const straightRanks = isA5Straight ? [RANK_VALUES['5'], RANK_VALUES['4'], RANK_VALUES['3'], RANK_VALUES['2'], RANK_VALUES['A']] : uniqueRanks;
        return { type: CARD_TYPES.STRAIGHT, ranks: straightRanks, name: "顺子", details: sortedCards, isA5Straight };
    }
    // 三条
    const threeRankVal = Object.keys(rankCounts).find(r => rankCounts[r] === 3);
    if (threeRankVal) {
        const kickers = sortedCards.filter(c => c.rank !== threeRankVal).map(c => RANK_VALUES[c.rank]);
        return { type: CARD_TYPES.THREE_OF_A_KIND, ranks: [RANK_VALUES[threeRankVal], ...kickers], name: "三条", details: sortedCards };
    }
    // 两对
    if (cards.length === 5) {
        const pairRanks = Object.keys(rankCounts).filter(r => rankCounts[r] === 2).map(r => RANK_VALUES[r]).sort((a, b) => b - a);
        if (pairRanks.length === 2) {
            const kicker = sortedCards.find(c => !pairRanks.includes(RANK_VALUES[c.rank]));
            return { type: CARD_TYPES.TWO_PAIR, ranks: [pairRanks[0], pairRanks[1], RANK_VALUES[kicker.rank]], name: "两对", details: sortedCards };
        }
    }
    // 对子
    const pairRankVal = Object.keys(rankCounts).find(r => rankCounts[r] === 2);
    if (pairRankVal) {
        const kickers = sortedCards.filter(c => c.rank !== pairRankVal).map(c => RANK_VALUES[c.rank]);
        return { type: CARD_TYPES.ONE_PAIR, ranks: [RANK_VALUES[pairRankVal], ...kickers], name: "对子", details: sortedCards };
    }
    // 乌龙
    return { type: CARD_TYPES.HIGH_CARD, ranks: ranks, name: "乌龙", details: sortedCards };
}

// (compareHands 函数需要适配 isA5Straight)
function compareHands(handInfo1, handInfo2) {
    // ... （之前的 compareHands 逻辑）
    // 如果牌型相同，ranks[0] 代表顺子中最大的牌（A2345中是5）
    // 例子:
    // if (handInfo1.type === CARD_TYPES.STRAIGHT && handInfo2.type === CARD_TYPES.STRAIGHT) {
    //     const rank1 = handInfo1.isA5Straight ? 5 : handInfo1.ranks[0];
    //     const rank2 = handInfo2.isA5Straight ? 5 : handInfo2.ranks[0];
    //     if (rank1 > rank2) return 1;
    //     if (rank1 < rank2) return -1;
    //     return 0; // 顺子一样大
    // }
    // ...
    if (handInfo1.type > handInfo2.type) return 1;
    if (handInfo1.type < handInfo2.type) return -1;

    // 牌型相同，比较点数
    // ranks 数组应按比较优先级排列 (例如，葫芦: [三条点数, 对子点数])
    for (let i = 0; i < handInfo1.ranks.length; i++) {
        // 对于A5顺子，其 ranks[0] (最大牌) 应该是5，而不是A(14)
        let rank1 = handInfo1.ranks[i];
        let rank2 = handInfo2.ranks[i];

        if (handInfo1.type === CARD_TYPES.STRAIGHT || handInfo1.type === CARD_TYPES.STRAIGHT_FLUSH) {
            // A5顺子比较时，A算作1，所以最大牌是5
            if (handInfo1.isA5Straight && handInfo1.ranks[i] === RANK_VALUES['A']) rank1 = 1; // 将A视为1进行比较
            if (handInfo2.isA5Straight && handInfo2.ranks[i] === RANK_VALUES['A']) rank2 = 1;
        }
        
        if (rank1 > rank2) return 1;
        if (rank1 < rank2) return -1;
    }
    return 0; // 完全相同 (理论上十三水同牌型点数相同不比花色)
}


// (validateArrangement 保持不变)
// ...

// 判断整手13张牌的特殊牌型
function checkOverallSpecialHand(all13Cards) {
    const sortedHand = sortCards(all13Cards, true); // 按点数和花色排序
    const ranks = sortedHand.map(c => RANK_VALUES[c.rank]);
    const suits = sortedHand.map(c => c.suit);
    const rankCounts = getRankCounts(sortedHand);
    const suitCounts = getSuitCounts(sortedHand);

    // 至尊青龙: 同花色的A-K
    if (ranks.toString() === [14,13,12,11,10,9,8,7,6,5,4,3,2].toString() && Object.values(suitCounts)[0] === 13) {
        return { type: CARD_TYPES.SUPREME_DRAGON, name: "至尊青龙", score: SCORE_RULES[CARD_TYPES.SUPREME_DRAGON] };
    }
    // 一条龙: 不同花色的A-K
    if (ranks.toString() === [14,13,12,11,10,9,8,7,6,5,4,3,2].toString() && new Set(suits).size > 1) {
         return { type: CARD_TYPES.ONE_DRAGON, name: "一条龙", score: SCORE_RULES[CARD_TYPES.ONE_DRAGON] };
    }
    // 十二皇族: 12张 J,Q,K,A
    const royalCount = sortedHand.filter(c => ['J', 'Q', 'K', 'A'].includes(c.rank)).length;
    if (royalCount === 12) {
        return { type: CARD_TYPES.TWELVE_ROYALS, name: "十二皇族", score: SCORE_RULES[CARD_TYPES.TWELVE_ROYALS] };
    }
    // 三同花顺: 需要将牌摆好后判断三道都是同花顺
    // 这个比较复杂，通常是在摆好牌后，检查三道的牌型。
    // 如果在发牌阶段就判断，需要尝试所有摆法，不现实。
    // 一般规则是玩家自己摆出三同花顺。

    // 六对半: 6个对子 + 1张单牌
    const pairs = Object.values(rankCounts).filter(count => count === 2).length;
    const singles = Object.values(rankCounts).filter(count => count === 1).length;
    if (pairs === 6 && singles === 1) {
        return { type: CARD_TYPES.SIX_PAIRS_HALF, name: "六对半", score: SCORE_RULES[CARD_TYPES.SIX_PAIRS_HALF] || 5 }; // 示例分
    }
    // 五对冲三: 5个对子 + 1个三条
    const triplesCount = Object.values(rankCounts).filter(count => count === 3).length;
    if (pairs === 5 && triplesCount === 1) {
         return { type: CARD_TYPES.FIVE_PAIRS_TRIPLE, name: "五对冲三", score: SCORE_RULES[CARD_TYPES.FIVE_PAIRS_TRIPLE] || 8 };
    }
    // ... 其他特殊牌型判断 ...
    // 十三张(十三烂): 所有牌点数不同，花色也可能不同。需要更精确定义。
    // 如果是“全不靠”，即点数不连续，花色不同，没有对子三条。
    const uniqueRanksCount = new Set(ranks).size;
    if (uniqueRanksCount === 13 && pairs === 0 && triplesCount === 0) { // 所有牌点数都不同
        // 进一步判断是否全不靠（没有顺子和同花元素）
        // 这个判断比较复杂，十三烂本身也有多种定义
         return { type: CARD_TYPES.THIRTEEN_DIFFERENT, name: "十三幺/十三烂", score: SCORE_RULES[CARD_TYPES.THIRTEEN_DIFFERENT] || 13 };
    }


    return null; // 没有全局特殊牌型
}

// 计算单道牌的特殊加分
function getSegmentExtraScore(segmentEval, segmentName) {
    let extra = 0;
    switch (segmentName) {
        case 'front':
            if (segmentEval.type === CARD_TYPES.THREE_OF_A_KIND) extra = SCORE_RULES.FRONT_THREE_OF_A_KIND;
            break;
        case 'middle':
            if (segmentEval.type === CARD_TYPES.FULL_HOUSE) extra = SCORE_RULES.MIDDLE_FULL_HOUSE;
            else if (segmentEval.type === CARD_TYPES.FOUR_OF_A_KIND) extra = SCORE_RULES.MIDDLE_FOUR_OF_A_KIND;
            else if (segmentEval.type === CARD_TYPES.STRAIGHT_FLUSH) extra = SCORE_RULES.MIDDLE_STRAIGHT_FLUSH;
            break;
        case 'back':
            if (segmentEval.type === CARD_TYPES.FOUR_OF_A_KIND) extra = SCORE_RULES.BACK_FOUR_OF_A_KIND;
            else if (segmentEval.type === CARD_TYPES.STRAIGHT_FLUSH) extra = SCORE_RULES.BACK_STRAIGHT_FLUSH;
            break;
    }
    return extra;
}

// 计算两个玩家比牌后的得分 (核心计分逻辑)
// p1Arrangement, p2Arrangement 是 {front: evalObj, middle: evalObj, back: evalObj}
// p1OverallSpecial, p2OverallSpecial 是 checkOverallSpecialHand 的结果
function calculateScores(p1Arrangement, p2Arrangement, p1OverallSpecial, p2OverallSpecial) {
    let p1Score = 0;
    let p2Score = 0;
    const comparisonDetails = {
        front: { winner: null, p1CardType: p1Arrangement.front.name, p2CardType: p2Arrangement.front.name, points: 0 },
        middle: { winner: null, p1CardType: p1Arrangement.middle.name, p2CardType: p2Arrangement.middle.name, points: 0 },
        back: { winner: null, p1CardType: p1Arrangement.back.name, p2CardType: p2Arrangement.back.name, points: 0 },
        scoop: null, // 'p1' or 'p2' if scoop happened
        overallWinner: null, // If special hand determines winner
        reason: ""
    };

    // 1. 处理全局特殊牌型
    if (p1OverallSpecial && p2OverallSpecial) {
        // 双方都有特殊牌型，比较特殊牌型大小
        if (p1OverallSpecial.type > p2OverallSpecial.type) {
            p1Score = p1OverallSpecial.score;
            p2Score = -p1OverallSpecial.score;
            comparisonDetails.overallWinner = 'p1';
            comparisonDetails.reason = `${p1OverallSpecial.name} 大于 ${p2OverallSpecial.name}`;
        } else if (p2OverallSpecial.type > p1OverallSpecial.type) {
            p2Score = p2OverallSpecial.score;
            p1Score = -p2OverallSpecial.score;
            comparisonDetails.overallWinner = 'p2';
            comparisonDetails.reason = `${p2OverallSpecial.name} 大于 ${p1OverallSpecial.name}`;
        } else { // 特殊牌型一样大 (罕见，按平局或规则定)
            comparisonDetails.reason = "双方特殊牌型相同，按普通比牌";
            // 继续普通比牌
        }
    } else if (p1OverallSpecial) {
        p1Score = p1OverallSpecial.score;
        p2Score = -p1OverallSpecial.score;
        comparisonDetails.overallWinner = 'p1';
        comparisonDetails.reason = `玩家1有特殊牌型: ${p1OverallSpecial.name}`;
    } else if (p2OverallSpecial) {
        p2Score = p2OverallSpecial.score;
        p1Score = -p2OverallSpecial.score;
        comparisonDetails.overallWinner = 'p2';
        comparisonDetails.reason = `玩家2有特殊牌型: ${p2OverallSpecial.name}`;
    }

    // 如果没有被全局特殊牌型决定胜负，则进行普通三道比牌
    if (!comparisonDetails.overallWinner) {
        let p1SegmentWins = 0;
        let p2SegmentWins = 0;

        // 比头道
        const frontComp = compareHands(p1Arrangement.front, p2Arrangement.front);
        let frontPoints = SCORE_RULES.SEGMENT_WIN;
        if (frontComp === 1) {
            frontPoints += getSegmentExtraScore(p1Arrangement.front, 'front');
            p1Score += frontPoints; p2Score -= frontPoints;
            p1SegmentWins++;
            comparisonDetails.front.winner = 'p1';
        } else if (frontComp === -1) {
            frontPoints += getSegmentExtraScore(p2Arrangement.front, 'front');
            p2Score += frontPoints; p1Score -= frontPoints;
            p2SegmentWins++;
            comparisonDetails.front.winner = 'p2';
        }
        comparisonDetails.front.points = frontPoints;


        // 比中道
        const middleComp = compareHands(p1Arrangement.middle, p2Arrangement.middle);
        let middlePoints = SCORE_RULES.SEGMENT_WIN;
        if (middleComp === 1) {
            middlePoints += getSegmentExtraScore(p1Arrangement.middle, 'middle');
            p1Score += middlePoints; p2Score -= middlePoints;
            p1SegmentWins++;
            comparisonDetails.middle.winner = 'p1';
        } else if (middleComp === -1) {
            middlePoints += getSegmentExtraScore(p2Arrangement.middle, 'middle');
            p2Score += middlePoints; p1Score -= middlePoints;
            p2SegmentWins++;
            comparisonDetails.middle.winner = 'p2';
        }
         comparisonDetails.middle.points = middlePoints;

        // 比尾道
        const backComp = compareHands(p1Arrangement.back, p2Arrangement.back);
        let backPoints = SCORE_RULES.SEGMENT_WIN;
        if (backComp === 1) {
            backPoints += getSegmentExtraScore(p1Arrangement.back, 'back');
            p1Score += backPoints; p2Score -= backPoints;
            p1SegmentWins++;
            comparisonDetails.back.winner = 'p1';
        } else if (backComp === -1) {
            backPoints += getSegmentExtraScore(p2Arrangement.back, 'back');
            p2Score += backPoints; p1Score -= backPoints;
            p2SegmentWins++;
            comparisonDetails.back.winner = 'p2';
        }
        comparisonDetails.back.points = backPoints;

        // 处理打枪
        if (p1SegmentWins === 3) {
            p1Score *= SCORE_RULES.SCOOP_MULTIPLIER; // p1总分翻倍
            p2Score = -p1Score; // p2输掉p1的总分
            comparisonDetails.scoop = 'p1';
            comparisonDetails.reason = "玩家1打枪！";
        } else if (p2SegmentWins === 3) {
            p2Score *= SCORE_RULES.SCOOP_MULTIPLIER;
            p1Score = -p2Score;
            comparisonDetails.scoop = 'p2';
            comparisonDetails.reason = "玩家2打枪！";
        }
    }

    return { p1Score, p2Score, details: comparisonDetails };
}

module.exports = {
    CARD_TYPES,
    RANK_VALUES,
    SUIT_VALUES,
    SCORE_RULES,
    sortCards,
    evaluateHand,
    compareHands,
    validateArrangement,
    // comparePlayerHands, // 旧的，被 calculateScores 替代
    checkOverallSpecialHand,
    getSegmentExtraScore,
    calculateScores
};
