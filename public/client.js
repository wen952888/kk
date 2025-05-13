// public/client.js
// (大部分代码与上一个“完整版”的 client.js 相同，关键修改如下)

// ... (顶部变量和工具函数保持不变) ...

function renderRoomView(state) {
    if (!state || !roomView || !myUserId) {
        console.error("RenderRoomView called with invalid state or no myUserId", state, myUserId);
        if (!myUserId && currentView === 'roomView') { handleLogout(); alert("用户身份丢失，请重新登录。"); }
        return;
    }
    currentGameState = state;

    // 更新整合到牌桌内的信息
    const gameInfoBar = document.getElementById('gameInfoBar'); // 需要在HTML中添加这个元素
    if (gameInfoBar) {
        const roomNameIdEl = gameInfoBar.querySelector('.room-name-id');
        if (roomNameIdEl) {
            roomNameIdEl.innerHTML = `
                <span class="room-name">${state.roomName || '房间'}</span>
                <span class="room-id">ID: ${state.roomId || 'N/A'}</span>
            `;
        }
    }
    // 移除对 #roomNameDisplay 和 #gameModeDisplay 的直接操作，因为它们可能已从主HTML结构中移除或由 gameInfoBar 处理

    // 更新整合到牌桌底部的状态显示
    const gameStatusDisplay = document.getElementById('gameStatusDisplay'); // 需要在HTML中添加这个元素
    if (gameStatusDisplay) {
        if (state.status === 'waiting') {
            const numPlayers = state.players.length;
            const maxPlayers = 4;
            gameStatusDisplay.textContent = `等待 ${numPlayers}/${maxPlayers} 位玩家准备...`;
        } else if (state.status === 'playing') {
            const currentPlayer = state.players.find(p => p.userId === state.currentPlayerId);
            gameStatusDisplay.textContent = currentPlayer ? (currentPlayer.userId === myUserId ? '轮到你出牌！' : `等待 ${currentPlayer.username} 出牌...`) : '游戏进行中...';
        } else if (state.status === 'finished') {
            gameStatusDisplay.textContent = '游戏已结束';
        } else {
            gameStatusDisplay.textContent = `状态: ${state.status}`;
        }
    }
    // 移除对 #roomStatusDisplay 的直接操作


    Object.values(playerAreas).forEach(clearPlayerAreaDOM);
    const myPlayer = state.players.find(p => p.userId === myUserId);
    if (!myPlayer) { console.error("My player data not found in game state!", state.players); handleLeaveRoom(); return; }
    isReadyForGame = myPlayer.isReady;
    const mySlot = myPlayer.slot;
    state.players.forEach(player => {
        const isMe = player.userId === myUserId;
        let relativeSlot = (player.slot - mySlot + state.players.length) % state.players.length;
        const targetArea = playerAreas[relativeSlot];
        if (targetArea) renderPlayerArea(targetArea, player, isMe, state);
        else console.warn(`No target area for relative slot ${relativeSlot} (Player slot ${player.slot})`);
    });
    centerPileArea.innerHTML = '';
    if (state.centerPile && state.centerPile.length > 0) {
        state.centerPile.forEach(cardData => centerPileArea.appendChild(renderCard(cardData, false, true)));
    } else {
        const placeholder = document.createElement('span'); placeholder.textContent = '- 等待出牌 -'; placeholder.style.color = '#aaa';
        centerPileArea.appendChild(placeholder);
    }
    lastHandTypeDisplay.textContent = state.lastHandInfo ? `类型: ${state.lastHandInfo.type}` : '新回合';
    updateRoomControls(state); // 这个函数现在主要控制准备按钮和动作按钮的显隐及状态
    if (state.currentPlayerId !== myUserId || state.status !== 'playing') clearHintsAndSelection(false);
}

// ... (clearPlayerAreaDOM, renderPlayerArea 保持不变) ...

function fanCards(cardContainer, cardElements, areaId) {
    const numCards = cardElements.length;
    if (numCards === 0) return;

    const cardWidth = 60; // Updated from CSS .card width
    const cardHeight = 84; // Updated from CSS .card height

    if (areaId === 'playerAreaBottom') { // My hand -平铺
        // 卡牌在CSS中已设为 position: relative; margin: 0 2px;
        // 不需要JS做特别的平铺定位，CSS flexbox会处理
        // 但为了确保z-index正确（例如选中时），可以设置一下
        cardElements.forEach((card, i) => {
            card.style.zIndex = i;
        });
    } else { // Opponent hands - 扇形/堆叠
        let maxAngle = 25; // 减小扇形角度
        let angleStep = numCards > 1 ? maxAngle / (numCards - 1) : 0;
        angleStep = Math.min(angleStep, 4); // 每张牌最大角度减小

        let initialRotation = -((numCards - 1) * angleStep) / 2;
        let offsetMultiplier = 1.5; // 牌的堆叠偏移

        cardElements.forEach((card, i) => {
            const rotation = initialRotation + i * angleStep;
            let tx = "0px", ty = "0px";

            if (areaId === 'playerAreaTop') {
                card.style.left = `calc(50% - ${cardWidth / 2}px)`;
                ty = `${i * offsetMultiplier}px`;
                card.style.transform = `translateY(${ty}) rotate(${rotation}deg)`;
                card.style.zIndex = numCards - i;
            } else if (areaId === 'playerAreaLeft') {
                tx = `${i * offsetMultiplier}px`;
                card.style.transform = `translateX(${tx}) rotate(${rotation}deg) translateY(-50%)`;
                card.style.zIndex = numCards - i;
            } else if (areaId === 'playerAreaRight') {
                tx = `${-i * offsetMultiplier}px`;
                card.style.transform = `translateX(${tx}) rotate(${rotation}deg) translateY(-50%)`;
                card.style.zIndex = i;
            }
        });
    }
}

function renderPlayerCards(container, playerData, isMe, isMyTurnAndPlaying) {
    container.innerHTML = '';
    const cardElements = [];

    if (isMe) {
        let sortedHand = playerData.hand ? [...playerData.hand] : [];
        if (sortedHand.length === 0 && !playerData.finished) {
             container.innerHTML = '<span style="color:#ccc; font-style:italic;">- 无手牌 -</span>';
        } else if (playerData.finished) {
            container.innerHTML = '<span style="color:gray; font-style:italic;">已出完</span>';
        } else {
            if (currentSortMode === 'rank') sortedHand.sort(compareSingleCardsClient);
            else if (currentSortMode === 'suit') sortedHand.sort(compareBySuitThenRank);

            sortedHand.forEach(cardData => {
                const cardElement = renderCard(cardData, false); // isCenterPileCard 默认为 false
                // cardElement.style.position = 'relative'; // 确保自己的牌是relative，以便平铺
                // cardElement.style.margin = '0 2px'; // 水平间距
                // cardElement.style.bottom = 'auto'; // 重置可能从其他地方继承的bottom
                // cardElement.style.left = 'auto';   // 重置可能从其他地方继承的left

                const isSelected = selectedCards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);
                const isHinted = currentHint && currentHint.cards.some(c => c.rank === cardData.rank && c.suit === cardData.suit);
                if (isSelected) cardElement.classList.add('selected');
                if (isHinted) cardElement.classList.add('hinted');
                if (isMyTurnAndPlaying) {
                    cardElement.onclick = () => toggleCardSelection(cardData, cardElement);
                    cardElement.classList.remove('disabled');
                } else {
                    cardElement.classList.add('disabled');
                }
                container.appendChild(cardElement);
                cardElements.push(cardElement); // 仍然收集，以备将来可能的JS交互
            });
        }
    } else {
        // ... (对手牌的逻辑与上一版类似，使用 fanCards) ...
        if (playerData.finished) {
            container.innerHTML = '<span style="color:gray; font-style:italic;">已出完</span>';
        } else if (playerData.handCount > 0) {
            for (let i = 0; i < playerData.handCount; i++) {
                const cardElement = renderCard(null, true);
                container.appendChild(cardElement);
                cardElements.push(cardElement);
            }
            let handCountEl = container.closest('.playerArea')?.querySelector('.hand-count-display');
            if (!handCountEl) {
                handCountEl = document.createElement('div');
                handCountEl.classList.add('hand-count-display');
                container.closest('.playerArea')?.appendChild(handCountEl);
            }
            handCountEl.textContent = `${playerData.handCount} 张`;

        } else {
            container.innerHTML = '<span style="color:#ccc; font-style:italic;">- 无手牌 -</span>';
            let handCountEl = container.closest('.playerArea')?.querySelector('.hand-count-display');
            if (handCountEl) handCountEl.remove();
        }
    }

    if (cardElements.length > 0) {
        requestAnimationFrame(() => {
             fanCards(container, cardElements, container.closest('.playerArea')?.id);
        });
    }
}


// ... (renderCard, updateRoomControls 和其他事件处理器、socket监听器等与上一个“完整版”client.js一致) ...
// 确保您使用的是上一回复中提供的 client.js 的完整版本，并只修改上面展示的几个函数。
// 主要是 renderRoomView 中对头部和底部状态栏的处理方式，以及 renderPlayerCards 和 fanCards 对自己手牌的平铺处理。
// 为避免再次粘贴超长代码，这里只展示了关键的修改部分。

// 确保 updateRoomControls 函数只处理 readyButton 和 myActions 的显隐和状态
function updateRoomControls(state) {
    if (!state || !myUserId) return;
    const myPlayerInState = state.players.find(p => p.userId === myUserId);
    if (!myPlayerInState) return;

    // 准备按钮现在可能放在 gameInfoBar 或其他地方，如果还用 readyButton ID，则逻辑不变
    const readyButtonInstance = document.getElementById('readyButton'); // 获取实例
    if (readyButtonInstance) {
        if (state.status === 'waiting') {
            readyButtonInstance.classList.remove('hidden-view');
            readyButtonInstance.classList.add('view-inline-block'); // Or appropriate display
            readyButtonInstance.textContent = myPlayerInState.isReady ? '取消准备' : '准备';
            readyButtonInstance.classList.toggle('ready', myPlayerInState.isReady);
            readyButtonInstance.disabled = false;
        } else {
            readyButtonInstance.classList.add('hidden-view');
            readyButtonInstance.classList.remove('view-inline-block');
        }
    }


    if (myActionsArea) {
        if (state.status === 'playing' && state.currentPlayerId === myUserId && !myPlayerInState.finished) {
            myActionsArea.classList.remove('hidden-view'); myActionsArea.classList.add('view-flex');
            if(playSelectedCardsButton) playSelectedCardsButton.disabled = selectedCards.length === 0;
            if(passTurnButton) {
                let disablePass = (!state.lastHandInfo && !state.isFirstTurn);
                if (state.isFirstTurn && !state.lastHandInfo) {
                     const iAmD4Holder = myPlayerInState.hand && myPlayerInState.hand.some(c => c.rank === '4' && c.suit === 'D');
                     if (iAmD4Holder) disablePass = true;
                }
                passTurnButton.disabled = disablePass;
            }
            if(hintButton) hintButton.disabled = false;
            if(sortHandButton) sortHandButton.disabled = false;
        } else {
            myActionsArea.classList.add('hidden-view'); myActionsArea.classList.remove('view-flex');
        }
    }
}


// --- 其余的 client.js 代码 (从 handleRegister 开始到文件末尾) ---
// --- 请确保这部分与我倒数第二个回复中提供的“完整版 client.js”一致 ---
// ... (handleRegister, handleLogin, handleLogout, etc. ... initClientSession, setupEventListeners, DOMContentLoaded)
// (此处省略大量重复代码，请以上一个“完整版”为准，仅需确认上面修改的几个函数)
function handleRegister() {
    const phone = regPhoneInput.value.trim(); const password = regPasswordInput.value;
    if (!phone || !password) { displayMessage(authMessage, '请输入手机号和密码。', true); return; }
    if (password.length < 4) { displayMessage(authMessage, '密码至少需要4位。', true); return; }
    registerButton.disabled = true;
    socket.emit('register', { phoneNumber: phone, password }, (response) => {
        registerButton.disabled = false;
        displayMessage(authMessage, response.message, !response.success, response.success);
        if (response.success) { regPhoneInput.value = ''; regPasswordInput.value = ''; }
    });
 }
function handleLogin() {
     const phone = loginPhoneInput.value.trim(); const password = loginPasswordInput.value;
     if (!phone || !password) { displayMessage(authMessage, '请输入手机号和密码。', true); return; }
     loginButton.disabled = true;
     socket.emit('login', { phoneNumber: phone, password }, (response) => {
         loginButton.disabled = false;
         displayMessage(authMessage, response.message, !response.success, response.success);
         if (response.success) {
             myUserId = response.userId; myUsername = response.username;
             try { localStorage.setItem('kkUserId', myUserId); localStorage.setItem('kkUsername', myUsername); }
             catch (e) { console.warn('LocalStorage error while saving user session:', e); }
             if(lobbyUsername) lobbyUsername.textContent = myUsername;
             showView('lobbyView');
         }
     });
 }
function handleLogout() {
      console.log('Logging out...');
      try { localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); }
      catch (e) { console.warn('LocalStorage error while removing user session:', e); }
      myUserId = null; myUsername = null; currentRoomId = null; currentGameState = null; isReadyForGame = false; selectedCards = []; currentHint = null; currentHintCycleIndex = 0;

      if (socket.connected) socket.disconnect();
      socket.connect();

      showView('loginRegisterView');
 }
function handleCreateRoom() {
     const roomName = createRoomNameInput.value.trim(); const password = createRoomPasswordInput.value;
     if (!roomName) { displayMessage(lobbyMessage, '请输入房间名称。', true); return; }
     createRoomButton.disabled = true;
     socket.emit('createRoom', { roomName, password: password || null }, (response) => {
         createRoomButton.disabled = false;
         displayMessage(lobbyMessage, response.message, !response.success, response.success);
         if (response.success) {
             currentRoomId = response.roomId;
             showView('roomView');
             renderRoomView(response.roomState);
             createRoomNameInput.value = ''; createRoomPasswordInput.value = '';
         }
     });
 }
function joinRoom(roomId, needsPassword) {
      let passwordToTry = null;
      if (needsPassword) {
          passwordToTry = prompt(`房间 "${roomId}" 受密码保护，请输入密码:`, '');
          if (passwordToTry === null) return;
      }
      displayMessage(lobbyMessage, `正在加入房间 ${roomId}...`, false);
      socket.emit('joinRoom', { roomId, password: passwordToTry }, (response) => {
          displayMessage(lobbyMessage, response.message, !response.success, response.success);
          if (response.success) {
              currentRoomId = response.roomId;
              showView('roomView');
              renderRoomView(response.roomState);
          }
      });
 }
function handleReadyClick() {
      if (!currentRoomId || !currentGameState) return;
      // 准备按钮可能已移到 gameInfoBar, 需要更新其引用或通过ID获取
      const actualReadyButton = document.getElementById('readyButton'); // 或者您新位置的按钮ID
      if (!actualReadyButton) return;

      const desiredReadyState = !isReadyForGame;
      actualReadyButton.disabled = true;
      socket.emit('playerReady', desiredReadyState, (response) => {
           actualReadyButton.disabled = false;
           if (!response.success) {
               displayMessage(gameMessage, response.message || "无法改变准备状态。", true);
           }
      });
 }

function handleLeaveRoom() {
    if (!currentRoomId && currentView === 'roomView') {
        console.warn("In room view but no currentRoomId, forcing back to lobby.");
        currentRoomId = null; currentGameState = null; selectedCards = []; currentHint = null; currentHintCycleIndex = 0;
        showView('lobbyView');
        socket.emit('listRooms', (rooms) => renderRoomList(rooms));
        return;
    }
    if (!currentRoomId) {
        console.log("Not in a room to leave.");
        return;
    }

    console.log(`Attempting to leave room: ${currentRoomId}`);
    const actualLeaveButton = document.getElementById('leaveRoomButton'); // 或者您新位置的按钮ID
    if (actualLeaveButton) actualLeaveButton.disabled = true;


    socket.emit('leaveRoom', (response) => {
        if (actualLeaveButton) actualLeaveButton.disabled = false;
        if (response.success) {
            displayMessage(lobbyMessage, response.message || '已离开房间。', false, true);
            currentRoomId = null; currentGameState = null; selectedCards = []; currentHint = null; currentHintCycleIndex = 0; isReadyForGame = false;
            showView('lobbyView');
            socket.emit('listRooms', (rooms) => renderRoomList(rooms));
        } else {
            // 如果离开失败，游戏内消息区域可能不存在了，可以考虑用alert
            alert(response.message || '离开房间失败。');
            // displayMessage(gameMessage, response.message || '离开房间失败。', true);
        }
    });
}

function handleSortHand() {
    if (currentSortMode === 'rank') currentSortMode = 'suit';
    else currentSortMode = 'rank';
    console.log("Sorting mode changed to:", currentSortMode);
    if (currentGameState && currentView === 'roomView') {
        renderRoomView(currentGameState);
    }
    clearHintsAndSelection(true);
}
function toggleCardSelection(cardData, cardElement) {
    if (!cardElement || cardElement.classList.contains('disabled')) return;
    clearHintsAndSelection(false);

    const index = selectedCards.findIndex(c => c.rank === cardData.rank && c.suit === cardData.suit);
    if (index > -1) {
        selectedCards.splice(index, 1);
        cardElement.classList.remove('selected');
    } else {
        selectedCards.push(cardData);
        cardElement.classList.add('selected');
    }
    if (playSelectedCardsButton && currentGameState && currentGameState.currentPlayerId === myUserId) {
         playSelectedCardsButton.disabled = selectedCards.length === 0;
    }
}
function handlePlaySelectedCards() {
    if (selectedCards.length === 0) { displayMessage(gameStatusDisplay, '请先选择要出的牌。', true); return; } // 使用 gameStatusDisplay
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) {
        displayMessage(gameStatusDisplay, '现在不是你的回合或状态无效。', true); return;
    }
    setGameActionButtonsDisabled(true);

    socket.emit('playCard', selectedCards, (response) => {
        if (currentGameState && currentGameState.currentPlayerId === myUserId) {
            setGameActionButtonsDisabled(false);
        }
        if (!response.success) {
            displayMessage(gameStatusDisplay, response.message || '出牌失败。', true);
        } else {
            selectedCards = [];
            clearHintsAndSelection(true);
        }
    });
}
function handlePassTurn() {
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) {
        displayMessage(gameStatusDisplay, '现在不是你的回合或状态无效。', true); return;
    }
    if (passTurnButton.disabled) {
        displayMessage(gameStatusDisplay, '你必须出牌。', true);
        return;
    }
    setGameActionButtonsDisabled(true);
    selectedCards = [];

    socket.emit('passTurn', (response) => {
        if (currentGameState && currentGameState.currentPlayerId === myUserId) {
             setGameActionButtonsDisabled(false);
        }
        if (!response.success) {
            displayMessage(gameStatusDisplay, response.message || 'Pass 失败。', true);
        } else {
            clearHintsAndSelection(true);
        }
    });
}
function handleHint() {
    if (!currentRoomId || !currentGameState || currentGameState.status !== 'playing' || currentGameState.currentPlayerId !== myUserId) {
        displayMessage(gameStatusDisplay, '现在不是你的回合或状态无效。', true); return;
    }
    clearHintsAndSelection(false);
    setGameActionButtonsDisabled(true);

    socket.emit('requestHint', currentHintCycleIndex, (response) => {
        if (currentGameState && currentGameState.currentPlayerId === myUserId) {
            setGameActionButtonsDisabled(false);
        }
        if (response.success && response.hint && response.hint.cards) {
            displayMessage(gameStatusDisplay, '找到提示！(点击提示可尝试下一个)', false, true);
            currentHint = response.hint;
            currentHintCycleIndex = response.nextHintIndex;
            highlightHintedCards(currentHint.cards);
        } else {
            displayMessage(gameStatusDisplay, response.message || '没有可出的牌或无更多提示。', true);
            currentHint = null;
            currentHintCycleIndex = 0;
        }
    });
}
function setGameActionButtonsDisabled(disabled) {
    if(playSelectedCardsButton) playSelectedCardsButton.disabled = disabled || selectedCards.length === 0;
    if(passTurnButton) { // Pass button logic moved to updateRoomControls for consistency
        updateRoomControls(currentGameState); // Call this to re-evaluate pass button state
        if (disabled) passTurnButton.disabled = true; // Still allow forcing disable
    }
    if(hintButton) hintButton.disabled = disabled;
}

function highlightHintedCards(hintedCardsArray) {
    if (!hintedCardsArray || hintedCardsArray.length === 0) return;
    if (!myHandArea) return;
    const cardElements = myHandArea.querySelectorAll('.card.visible:not(.hidden)');
    hintedCardsArray.forEach(hintCard => {
        for(const elem of cardElements) {
            if(elem.dataset.rank === hintCard.rank && elem.dataset.suit === hintCard.suit) {
                elem.classList.add('hinted');
                break;
            }
        }
    });
}
function clearHintsAndSelection(resetHintCycle = true) {
    if (resetHintCycle) {
        currentHint = null;
        currentHintCycleIndex = 0;
    }
    if (myHandArea) {
        const hintedElements = myHandArea.querySelectorAll('.card.hinted');
        hintedElements.forEach(el => el.classList.remove('hinted'));
    }
}
function showGameOver(scoreResultData) {
    if (!scoreResultData) {
        console.warn("showGameOver called with no data.");
        gameOverTitle.textContent = "游戏结束!";
        gameOverReason.textContent = "无法获取详细结果。";
        gameOverScores.innerHTML = '';
    } else {
        gameOverTitle.textContent = scoreResultData.result || "游戏结束!";
        gameOverReason.textContent = scoreResultData.reason || "";
        gameOverScores.innerHTML = '';

        const playersToDisplay = scoreResultData.finalScores || currentGameState?.players || [];

        playersToDisplay.forEach(playerData => {
            const p = document.createElement('p');
            let scoreText = `${playerData.name} (${playerData.role || '?'})`;
            if (scoreResultData.scoreChanges && scoreResultData.scoreChanges[playerData.id] !== undefined) {
                const change = scoreResultData.scoreChanges[playerData.id];
                const changeDisplay = change > 0 ? `+${change}` : (change < 0 ? `${change}` : '0');
                const changeClass = change > 0 ? 'score-plus' : (change < 0 ? 'score-minus' : 'score-zero');
                scoreText += ` : <span class="${changeClass}">${changeDisplay}</span>`;
            }
            scoreText += ` (总分: ${playerData.score})`;
            p.innerHTML = scoreText;
            gameOverScores.appendChild(p);
        });
    }
    showView('gameOverOverlay');
}

socket.on('connect', () => {
    console.log('Connected to server! Socket ID:', socket.id);
    initClientSession();
});
socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    if (currentView !== 'loginRegisterView') {
        showView('loadingView');
        displayMessage(loadingView.querySelector('p'), `与服务器断开连接: ${reason}. 请刷新页面或等待重连...`, true);
    }
    currentRoomId = null; currentGameState = null; isReadyForGame = false;
});
socket.on('roomListUpdate', (rooms) => {
    console.log('Received room list update:', rooms);
    if (currentView === 'lobbyView') renderRoomList(rooms);
});
socket.on('playerReadyUpdate', ({ userId, isReady }) => {
    if (currentGameState && currentView === 'roomView') {
        const player = currentGameState.players.find(p => p.userId === userId);
        if (player) player.isReady = isReady;
        if (userId === myUserId) isReadyForGame = isReady;
        renderRoomView(currentGameState);
    }
});
socket.on('playerJoined', (newPlayerInfo) => {
    if (currentGameState && currentView === 'roomView') {
        console.log('Player joined:', newPlayerInfo.username);
        const existingPlayer = currentGameState.players.find(p => p.userId === newPlayerInfo.userId);
        if (existingPlayer) {
            Object.assign(existingPlayer, newPlayerInfo, {connected: true});
        } else {
            currentGameState.players.push({ ...newPlayerInfo, score:0, hand:undefined, handCount:0, role:null, finished:false, connected:true });
        }
        currentGameState.players.sort((a,b) => a.slot - b.slot);
        renderRoomView(currentGameState);
        displayMessage(gameStatusDisplay, `${newPlayerInfo.username} 加入了房间。`, false, true); // Use gameStatusDisplay
    }
});
socket.on('playerLeft', ({ userId, username, reason }) => {
    if (currentGameState && currentView === 'roomView') {
        console.log('Player left:', username, reason);
        const player = currentGameState.players.find(p => p.userId === userId);
        if (player) {
            player.connected = false;
            player.isReady = false;
        }
        renderRoomView(currentGameState);
        displayMessage(gameStatusDisplay, `${username} ${reason === 'disconnected' ? '断线了' : '离开了房间'}。`, true); // Use gameStatusDisplay
    }
});
socket.on('playerReconnected', (reconnectedPlayerInfo) => {
     if (currentGameState && currentView === 'roomView') {
        console.log('Player reconnected:', reconnectedPlayerInfo.username);
        const player = currentGameState.players.find(p => p.userId === reconnectedPlayerInfo.userId);
        if (player) {
            Object.assign(player, reconnectedPlayerInfo, {connected: true});
        } else {
            currentGameState.players.push({ ...reconnectedPlayerInfo, score:0, hand:undefined, handCount:0, role:null, finished:false, connected:true });
            currentGameState.players.sort((a,b) => a.slot - b.slot);
        }
        renderRoomView(currentGameState);
        displayMessage(gameStatusDisplay, `${reconnectedPlayerInfo.username} 重新连接。`, false, true); // Use gameStatusDisplay
    }
});
socket.on('gameStarted', (initialGameState) => {
    if (currentView === 'roomView' && currentRoomId === initialGameState.roomId) {
        console.log('Game started!', initialGameState);
        displayMessage(gameStatusDisplay, '游戏开始！祝你好运！', false, true); // Use gameStatusDisplay
        selectedCards = []; clearHintsAndSelection(true);
        renderRoomView(initialGameState);
    }
});
socket.on('gameStateUpdate', (newState) => {
    if (currentView === 'roomView' && currentRoomId === newState.roomId) {
        // console.log('GameStateUpdate received. Current Player:', newState.currentPlayerId, 'My ID:', myUserId, 'My turn?', newState.currentPlayerId === myUserId);
        if (currentGameState && (currentGameState.currentPlayerId === myUserId && newState.currentPlayerId !== myUserId) ||
            (currentGameState.status !== newState.status) ) {
            selectedCards = [];
            clearHintsAndSelection(true);
        }
        renderRoomView(newState);
    } else if (currentRoomId && currentRoomId !== newState.roomId) {
        console.warn("Received gameStateUpdate for a different room. Ignoring.");
    }
});
socket.on('invalidPlay', ({ message }) => {
    displayMessage(gameStatusDisplay, `操作无效: ${message}`, true); // Use gameStatusDisplay
    if (currentGameState && currentGameState.currentPlayerId === myUserId) {
        setGameActionButtonsDisabled(false);
    }
});
socket.on('gameOver', (results) => {
    if (currentGameState && currentView === 'roomView' && currentRoomId === currentGameState.roomId) {
        console.log('Game Over event received:', results);
        currentGameState.status = 'finished';
        showGameOver(results);
    }
});
socket.on('gameStartFailed', ({ message }) => {
    if (currentView === 'roomView') {
        displayMessage(gameStatusDisplay, `游戏开始失败: ${message}`, true); // Use gameStatusDisplay
        if (currentGameState) {
            currentGameState.players.forEach(p => p.isReady = false);
            isReadyForGame = false;
            renderRoomView(currentGameState);
        }
    }
});
socket.on('allPlayersResetReady', () => {
    if (currentGameState && currentView === 'roomView' && currentGameState.status === 'waiting') {
        currentGameState.players.forEach(p => p.isReady = false);
        isReadyForGame = false;
        renderRoomView(currentGameState);
        displayMessage(gameStatusDisplay, '部分玩家状态变更，请重新准备。', true); // Use gameStatusDisplay
    }
});

function initClientSession() {
    let storedUserId = null;
    try {
        storedUserId = localStorage.getItem('kkUserId');
    } catch (e) {
        console.warn('Error accessing localStorage for user ID:', e);
        showView('loginRegisterView');
        return;
    }

    if (storedUserId) {
        console.log(`Found stored user ID: ${storedUserId}. Attempting reauthentication...`);
        showView('loadingView'); displayMessage(loadingView.querySelector('p'), "正在重新连接...", false);
        socket.emit('reauthenticate', storedUserId, (response) => {
            if (response.success) {
                myUserId = response.userId;
                myUsername = response.username;
                if (lobbyUsername) lobbyUsername.textContent = myUsername;

                if (response.roomState) {
                    currentRoomId = response.roomState.roomId;
                    showView('roomView');
                    renderRoomView(response.roomState);
                } else {
                    showView('lobbyView');
                }
                // displayMessage(authMessage, response.message, !response.success, response.success); // Reauth message not shown on auth view by default
            } else {
                try { localStorage.removeItem('kkUserId'); localStorage.removeItem('kkUsername'); } catch (e) {}
                displayMessage(authMessage, response.message, true); // Show error on auth view
                showView('loginRegisterView');
            }
        });
    } else {
         console.log('No stored user ID found.');
         showView('loginRegisterView');
    }
}

function setupEventListeners() {
    if(registerButton) registerButton.addEventListener('click', handleRegister);
    if(loginButton) loginButton.addEventListener('click', handleLogin);
    if(logoutButton) logoutButton.addEventListener('click', handleLogout); // Assuming this is now inside #gameInfoBar if used
    if(createRoomButton) createRoomButton.addEventListener('click', handleCreateRoom);

    // Need to get readyButton and leaveRoomButton by ID if they are dynamically added or always present
    document.body.addEventListener('click', function(event) {
        if (event.target.id === 'readyButton') {
            handleReadyClick();
        }
        if (event.target.id === 'leaveRoomButton') { // Ensure this button is correctly referenced
            handleLeaveRoom();
        }
    });

    if(sortHandButton) sortHandButton.addEventListener('click', handleSortHand);
    if(playSelectedCardsButton) playSelectedCardsButton.addEventListener('click', handlePlaySelectedCards);
    if(passTurnButton) passTurnButton.addEventListener('click', handlePassTurn);
    if(hintButton) hintButton.addEventListener('click', handleHint);
    if(backToLobbyButton) backToLobbyButton.addEventListener('click', () => {
        currentRoomId = null; currentGameState = null; isReadyForGame = false;
        selectedCards = []; currentHint = null; currentHintCycleIndex = 0;
        showView('lobbyView');
        socket.emit('listRooms', (rooms) => renderRoomList(rooms));
    });

    regPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });
    loginPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    createRoomPasswordInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleCreateRoom(); });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Setting up client...");
    document.documentElement.style.overflow = ''; document.body.style.overflow = '';
    setupEventListeners();

    if (socket.connected) {
         initClientSession();
    } else {
        showView('loadingView');
        displayMessage(loadingView.querySelector('p'), "正在连接服务器...", false);
    }
    console.log('Client setup complete.');
});
