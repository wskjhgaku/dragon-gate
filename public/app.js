const socket = io();

// ==========================================
// DOM Elements
// ==========================================
const lobbyView = document.getElementById('lobby-view');
const waitingRoomView = document.getElementById('waiting-room-view');

const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const settingChipsInput = document.getElementById('setting-chips');
const settingAnteInput = document.getElementById('setting-ante');
const settingMinInput = document.getElementById('setting-min');

const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const startGameBtn = document.getElementById('start-game-btn');
const addBotBtn = document.getElementById('add-bot-btn');

const displayRoomCode = document.getElementById('display-room-code');
const playerList = document.getElementById('player-list');
const playerCount = document.getElementById('player-count');

const gameView = document.getElementById('game-view');
const gamePot = document.getElementById('game-pot');
const gameChips = document.getElementById('game-chips');
const turnIndicator = document.getElementById('turn-indicator');
const card1El = document.getElementById('card-1');
const card2El = document.getElementById('card-2');
const card3El = document.getElementById('card-3');
const card1Slot = document.getElementById('card1-slot');
const card2Slot = document.getElementById('card2-slot');
const card3Slot = document.getElementById('card3-slot');

const playersBalanceContainer = document.getElementById('players-balance-container');
const ruleHint = document.getElementById('rule-hint');
const normalActionView = document.getElementById('normal-action-view');
const pairActionView = document.getElementById('pair-action-view');
const consecutiveActionView = document.getElementById('consecutive-action-view');

const betInput = document.getElementById('bet-input');
const betBtn = document.getElementById('bet-btn');
const pairBetInput = document.getElementById('pair-bet-input');
const betHighBtn = document.getElementById('bet-high-btn');
const betLowBtn = document.getElementById('bet-low-btn');
const passBtn = document.getElementById('pass-btn');

const betControlsView = document.getElementById('bet-controls-view');
const betSlider = document.getElementById('bet-slider');
const halfInBtn = document.getElementById('half-in-btn');

const leaveGameBtn = document.getElementById('leave-game-btn');
const endGameBtn = document.getElementById('end-game-btn');
const gameOverView = document.getElementById('game-over-view');
const rankingList = document.getElementById('ranking-list');
const backToLobbyBtn = document.getElementById('back-to-lobby-btn');

const bankruptBtn = document.getElementById('bankrupt-btn');
const gameLog = document.getElementById('game-log');
const toastContainer = document.getElementById('toast-container');

const footerRoom = document.getElementById('footer-room');
const footerHumans = document.getElementById('footer-humans');
const footerBots = document.getElementById('footer-bots');

let currentRoomId = null;
let currentMyChips = 0;

// ==========================================
// Initialization
// ==========================================
// Set a random default player name
playerNameInput.value = `Player_${Math.floor(Math.random() * 9000) + 1000}`;

// ==========================================
// Helpers
// ==========================================
function triggerVibration(type) {
    if ('vibrate' in navigator) {
        if (type === 'tap') navigator.vibrate(50);
        else if (type === 'win') navigator.vibrate([50, 100, 50]);
        else if (type === 'hit_post') navigator.vibrate([200, 100, 200, 100, 300]);
    }
}

// ==========================================
// UI Event Listeners
// ==========================================
createRoomBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Anonymous';
    const chips = parseInt(settingChipsInput.value) || 0;
    const ante = parseInt(settingAnteInput.value) || 0;
    const minBet = parseInt(settingMinInput.value) || 0;
    
    if (chips < ante * 2 || ante < minBet || minBet < 10) {
        alert("Invalid settings. Rules: Chips >= Ante * 2, Ante >= Min Bet, Min Bet >= 10.");
        return;
    }
    if (chips % 10 !== 0 || ante % 10 !== 0 || minBet % 10 !== 0) {
        alert("Settings must be multiples of 10.");
        return;
    }
    
    socket.emit('create_room', { name, starting_chips: chips, ante, min_bet: minBet });
});

joinRoomBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Anonymous';
    const roomId = roomCodeInput.value.trim().toUpperCase();
    if (!roomId) {
        alert("Please enter a room code.");
        return;
    }
    socket.emit('join_room', { name, room_id: roomId });
});

// Game Action Events
startGameBtn.addEventListener('click', () => {
    if (currentRoomId) socket.emit('start_game', currentRoomId);
});

addBotBtn.addEventListener('click', () => {
    if (currentRoomId) socket.emit('add_bot', { room_id: currentRoomId });
});

betBtn.addEventListener('click', () => {
    const amount = parseInt(betInput.value);
    if (!amount || amount < 20) return alert("Enter a valid bet amount (min 20).");
    triggerVibration('tap');
    socket.emit('place_bet', { room_id: currentRoomId, amount });
    betInput.value = '';
});

betHighBtn.addEventListener('click', () => {
    const amount = parseInt(pairBetInput.value);
    if (!amount || amount < 20) return alert("Enter a valid bet amount (min 20).");
    triggerVibration('tap');
    socket.emit('place_bet', { room_id: currentRoomId, amount, guess: 'high' });
    pairBetInput.value = '';
});

betLowBtn.addEventListener('click', () => {
    const amount = parseInt(pairBetInput.value);
    if (!amount || amount < 20) return alert("Enter a valid bet amount (min 20).");
    triggerVibration('tap');
    socket.emit('place_bet', { room_id: currentRoomId, amount, guess: 'low' });
});

passBtn.addEventListener('click', () => {
    triggerVibration('tap');
    socket.emit('place_bet', { room_id: currentRoomId, amount: 0 });
});

// Slider bindings
if (betSlider) {
    betSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        betInput.value = val;
        pairBetInput.value = val;
    });
}
if (betInput) betInput.addEventListener('input', (e) => { betSlider.value = e.target.value; });
if (pairBetInput) pairBetInput.addEventListener('input', (e) => { betSlider.value = e.target.value; });

halfInBtn.addEventListener('click', () => {
    triggerVibration('tap');
    const halfInAmount = Math.floor(currentMyChips / 2 / 10) * 10;
    const boundedHalf = Math.min(Math.max(betSlider.min, halfInAmount), betSlider.max);
    betSlider.value = boundedHalf;
    betInput.value = boundedHalf;
    pairBetInput.value = boundedHalf;
});

leaveGameBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to leave the game?")) {
        socket.emit('leave_game', { room_id: currentRoomId });
        location.reload();
    }
});

endGameBtn.addEventListener('click', () => {
    if (confirm("End the game and show final standings?")) {
        socket.emit('force_end_game', { room_id: currentRoomId });
    }
});

backToLobbyBtn.addEventListener('click', () => {
    location.reload();
});

bankruptBtn.addEventListener('click', () => {
    socket.emit('request_revive', { room_id: currentRoomId });
});

// ==========================================
// Socket Event Listeners
// ==========================================
socket.on('room_updated', (roomData) => {
    console.log("Room updated:", roomData);
    currentRoomId = roomData.room_id;
    
    // Switch Views
    lobbyView.classList.add('hidden');
    lobbyView.classList.remove('flex');
    waitingRoomView.classList.remove('hidden');
    waitingRoomView.classList.add('flex');

    // Update Room Info
    displayRoomCode.textContent = roomData.room_id;
    playerCount.textContent = roomData.players.length;

    // Render Players List
    playerList.innerHTML = '';
    roomData.players.forEach(player => {
        const isMe = player.sid === socket.id;
        const isHost = player.sid === roomData.host_sid;
        
        const li = document.createElement('li');
        li.className = `flex items-center justify-between p-3 rounded-xl transition-all ${
            isMe ? 'bg-slate-700/80 border border-slate-600 shadow-inner' : 'bg-slate-800/50'
        }`;
        
        // Badges
        const hostBadge = isHost ? `<span class="bg-yellow-500/20 text-yellow-400 text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase ml-2 tracking-wider">Host</span>` : '';
        const meBadge = isMe ? `<span class="text-slate-400 text-xs ml-2 italic">(You)</span>` : '';

        // Avatar Initial
        const initial = player.name.charAt(0).toUpperCase();
        
        const revivalsTxt = player.revivals > 0 ? ` <span class="text-xs text-yellow-400">(x${player.revivals})</span>` : '';

        li.innerHTML = `
            <div class="flex items-center">
                <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold mr-3 shadow-md border border-slate-600">
                    ${initial}
                </div>
                <span class="font-medium ${isMe ? 'text-white' : 'text-slate-300'}">${player.name}</span>
                ${meBadge}
                ${hostBadge}
            </div>
            <div class="text-yellow-400 font-mono font-semibold bg-slate-900/50 px-3 py-1 rounded-lg">
                $${player.chips}${revivalsTxt}
            </div>
        `;
        playerList.appendChild(li);
    });

    // Handle Start Game & Add Bot Button Visibility (Only for Host)
    if (socket.id === roomData.host_sid) {
        startGameBtn.classList.remove('hidden');
        addBotBtn.classList.remove('hidden');
    } else {
        startGameBtn.classList.add('hidden');
        addBotBtn.classList.add('hidden');
    }
});

function formatCard(val) {
    if (val === 1) return 'A';
    if (val === 11) return 'J';
    if (val === 12) return 'Q';
    if (val === 13) return 'K';
    return val;
}

function appendLog(msg) {
    const p = document.createElement('div');
    p.className = "py-1 text-slate-300 border-b border-slate-800 break-words";
    p.textContent = `> ${msg}`;
    gameLog.prepend(p);
}

socket.on('game_log_message', (msg) => {
    appendLog(msg);
});

socket.on('game_state_updated', (roomData) => {
    console.log("Game state updated:", roomData);
    currentRoomId = roomData.room_id;
    
    if (roomData.status === "playing") {
        lobbyView.classList.add('hidden');
        lobbyView.classList.remove('flex');
        waitingRoomView.classList.add('hidden');
        waitingRoomView.classList.remove('flex');
        gameView.classList.remove('hidden');
        gameView.classList.add('flex');
        
        gamePot.textContent = `$${roomData.pot}`;
        
        // Render Players Balance
        playersBalanceContainer.innerHTML = '';
        roomData.players.forEach(p => {
            const badge = document.createElement('div');
            badge.className = `whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold border ${
                p.sid === roomData.players[roomData.turn_index].sid
                ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_10px_rgba(37,99,235,0.5)]'
                : 'bg-slate-700 text-slate-300 border-slate-600'
            }`;
            const revivalsTxt = p.revivals > 0 ? ` (x${p.revivals})` : '';
            badge.textContent = `${p.name}: $${p.chips}${revivalsTxt}`;
            playersBalanceContainer.appendChild(badge);
        });

        if (footerRoom) footerRoom.textContent = roomData.room_id;
        if (footerHumans) footerHumans.textContent = roomData.players.filter(p => !p.is_bot).length;
        if (footerBots) footerBots.textContent = roomData.players.filter(p => p.is_bot).length;

        const me = roomData.players.find(p => p.sid === socket.id);
        if (me) {
            currentMyChips = me.chips;
            gameChips.textContent = `$${me.chips}`;
            if (me.chips <= 0) {
                bankruptBtn.classList.remove('hidden');
            } else {
                bankruptBtn.classList.add('hidden');
            }
        }

        const turnPlayer = roomData.players[roomData.turn_index];
        const isMyTurn = turnPlayer.sid === socket.id;
        
        const appContainer = document.getElementById('app-container');
        if (isMyTurn && roomData.status === 'playing') {
            appContainer.classList.add('ring-4', 'ring-green-500', 'ring-opacity-50', 'shadow-[0_0_30px_rgba(34,197,94,0.3)]');
        } else {
            appContainer.classList.remove('ring-4', 'ring-green-500', 'ring-opacity-50', 'shadow-[0_0_30px_rgba(34,197,94,0.3)]');
        }
        
        if (isMyTurn) {
            turnIndicator.textContent = "Your Turn!";
            turnIndicator.className = "w-full text-center py-2 text-lg font-bold tracking-wide rounded-lg bg-green-900/30 text-green-400 border border-green-500/30 shadow-[0_0_15px_rgba(74,222,128,0.2)]";
            betBtn.disabled = false;
            betHighBtn.disabled = false;
            betLowBtn.disabled = false;
            passBtn.disabled = false;
        } else if (turnPlayer.is_bot) {
            turnIndicator.textContent = `🤖 ${turnPlayer.name} is thinking...`;
            turnIndicator.className = "w-full text-center py-2 text-lg font-bold tracking-wide rounded-lg bg-purple-900/30 text-purple-300 border border-purple-500/30";
            betBtn.disabled = true;
            betHighBtn.disabled = true;
            betLowBtn.disabled = true;
            passBtn.disabled = true;
        } else {
            turnIndicator.textContent = `Waiting for ${turnPlayer.name}...`;
            turnIndicator.className = "w-full text-center py-2 text-lg font-bold tracking-wide rounded-lg bg-blue-900/30 text-blue-300 border border-blue-500/30";
            betBtn.disabled = true;
            betHighBtn.disabled = true;
            betLowBtn.disabled = true;
            passBtn.disabled = true;
        }
        
        if (socket.id === roomData.host_sid && roomData.status === 'playing') {
            endGameBtn.classList.remove('hidden');
        } else {
            endGameBtn.classList.add('hidden');
        }

        if (roomData.current_cards) {
            const c1 = roomData.current_cards[0];
            const c2 = roomData.current_cards[1];
            const gap = Math.abs(c1 - c2);
            
            // UI Toggle Logic
            normalActionView.classList.add('hidden');
            pairActionView.classList.add('hidden');
            consecutiveActionView.classList.add('hidden');
            betControlsView.classList.add('hidden');
            ruleHint.classList.add('hidden');
            
            if (me && me.chips > 0) {
                let globalMax = Math.min(Math.floor(me.chips / 2), roomData.pot);
                let maxAllowed = gap === 2 ? Math.min(globalMax, Math.floor(roomData.pot / 2)) : globalMax;
                if (maxAllowed < roomData.min_bet) {
                    maxAllowed = Math.min(me.chips, roomData.pot);
                    if (gap === 2) maxAllowed = Math.min(maxAllowed, Math.floor(roomData.pot / 2));
                }
                let minAllowed = Math.min(roomData.min_bet, maxAllowed);
                
                betSlider.min = minAllowed;
                betSlider.max = maxAllowed;
                betSlider.value = minAllowed;
                betInput.value = minAllowed;
                betInput.min = minAllowed;
                betInput.max = maxAllowed;
                pairBetInput.value = minAllowed;
                pairBetInput.min = minAllowed;
                pairBetInput.max = maxAllowed;

                if (gap === 0) {
                    pairActionView.classList.remove('hidden');
                    betControlsView.classList.remove('hidden');
                } else if (gap === 1) {
                    consecutiveActionView.classList.remove('hidden');
                } else if (gap === 2) {
                    normalActionView.classList.remove('hidden');
                    betControlsView.classList.remove('hidden');
                    ruleHint.textContent = `Middle Hole! Max bet is half pot ($${Math.floor(roomData.pot / 2)}). Payout is 2x!`;
                    ruleHint.classList.remove('hidden');
                } else {
                    normalActionView.classList.remove('hidden');
                    betControlsView.classList.remove('hidden');
                }
            }

            // Unflip and hide card 3 for the new turn
            card3Slot.classList.remove('flipped');
            setTimeout(() => { card3Slot.classList.add('hidden'); }, 300); // Wait for unflip animation
            
            // Set and flip cards 1 & 2
            card1El.textContent = formatCard(c1);
            card2El.textContent = formatCard(c2);
            
            // Small delay so flip is visible if just dealt
            setTimeout(() => {
                card1Slot.classList.add('flipped');
                card2Slot.classList.add('flipped');
            }, 50);
        }
    }
});

socket.on('turn_result', (data) => {
    card3El.textContent = formatCard(data.cards[1]);
    card3Slot.classList.remove('hidden');
    
    // Trigger 3D flip for 3rd card
    setTimeout(() => {
        card3Slot.classList.add('flipped');
    }, 50);
    
    // Check message for vibration/shake
    const msg = data.message.toLowerCase();
    if (msg.includes('won')) {
        triggerVibration('win');
    } else if (msg.includes('hit the post')) {
        triggerVibration('hit_post');
        const appContainer = document.getElementById('app-container');
        appContainer.classList.add('animate-shake');
        setTimeout(() => appContainer.classList.remove('animate-shake'), 500);
    }
    
    appendLog(data.message);
});

socket.on('error', (message) => {
    alert(`Error: ${message}`);
});

socket.on('bet_announced', (msg) => {
    turnIndicator.textContent = msg;
    turnIndicator.className = "w-full text-center py-2 text-lg font-bold tracking-wide rounded-lg bg-orange-900/40 text-orange-400 border border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.4)] animate-pulse";
});

socket.on('game_over', (data) => {
    gameOverView.classList.remove('hidden');
    gameOverView.classList.add('flex');
    
    rankingList.innerHTML = '';
    data.players.forEach((p, idx) => {
        const netTotal = p.chips - (p.debt || 0);
        
        const row = document.createElement('div');
        row.className = `py-3 px-2 sm:px-4 flex justify-between items-center text-white font-medium border-b border-slate-700 gap-1 sm:gap-2 ${p.sid === socket.id ? 'bg-blue-900/40' : ''}`;
        
        if (idx === 0) row.classList.add('bg-yellow-900/30', 'text-yellow-400');
        
        row.innerHTML = `
            <span class="w-6 sm:w-8 text-center font-bold text-yellow-500">#${idx + 1}</span>
            <span class="flex-1 truncate">${p.name} ${p.sid === socket.id ? '(You)' : ''}</span>
            <span class="w-12 sm:w-16 text-right font-mono">$${p.chips}</span>
            <span class="w-12 sm:w-16 text-right font-mono text-red-400">-$${p.debt || 0}</span>
            <span class="w-12 sm:w-16 text-right font-mono font-bold text-green-400">$${netTotal}</span>
        `;
        rankingList.appendChild(row);
    });
});

socket.on('system_message', (msg) => {
    // Add to game log
    const logEntry = document.createElement('div');
    logEntry.className = "py-1 text-slate-300 border-b border-slate-800 break-words";
    logEntry.textContent = `> ${msg}`;
    gameLog.prepend(logEntry);
    
    // Spawn Toast
    if (toastContainer) {
        const toast = document.createElement('div');
        toast.className = "bg-blue-600/90 text-white text-sm font-bold px-4 py-3 rounded-xl shadow-lg border border-blue-400 backdrop-blur-sm transition-opacity duration-300 animate-bounce text-center";
        toast.textContent = msg;
        toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
});
