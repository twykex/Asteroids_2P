// server.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allows any origin
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

let players = {};
let games = {};

const MIN_PLAYERS_TO_START = 2;
const BASE_SPAWN_INTERVAL = 1.5;
const MULTIPLAYER_SPAWN_INTERVAL = 1.2;
const MIN_ASTEROID_SPAWN_INTERVAL_SVR = 0.3;
const SPAWN_INTERVAL_DECREASE_FACTOR_SVR = 0.98;
const ASTEROID_BASE_SPEED = 100;
const ASTEROID_SPEED_VARIANCE = 150;
const SCORE_PER_ASTEROID_SVR = 50;
const SCORE_PER_ARMORED_HEALTH_POINT = 25;
const POWERUP_DROP_CHANCE = 0.20;
const SHIELD_DURATION_MS = 5000;
const RAPID_FIRE_DURATION_MS = 7000;
const SCORE_MULTIPLIER_DURATION_MS = 10000;
const SCORE_MULTIPLIER_VALUE = 2;

const ASTEROID_TYPE_NORMAL = 'normal';
const ASTEROID_TYPE_ARMORED = 'armored';
const ASTEROID_NORMAL_HEALTH = 1;
const ASTEROID_ARMORED_HEALTH = 3;
const ASTEROID_SIZE_LARGE = 60;

const ROUND_BASE_GOAL = 10;
const ROUND_GOAL_INCREASE = 5;
const ROUND_TRANSITION_TIME_MS = 3000;
const ROUND_SPEED_MULTIPLIER = 1.05;
const ROUND_SPAWN_INTERVAL_REDUCTION = 0.05;

const TICK_RATE = 1000 / 30;
setInterval(gameLoop, TICK_RATE);

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    players[socket.id] = {
        id: socket.id, x: 400, y: 500, lives: 3, score: 0, status: 'lobby',
        hasShield: false, rapidFireEndTime: 0, scoreMultiplierEndTime: 0
    };

    socket.emit('yourId', socket.id);
    socket.join('lobby');
    socket.emit('lobbyState', getLobbyPlayers());
    socket.broadcast.to('lobby').emit('playerJoinedLobby', players[socket.id]);
    updateLobbyStatus();

    socket.on('requestStartGame', () => {
        const currentLobbyPlayersData = getLobbyPlayers();
        if (currentLobbyPlayersData.length >= MIN_PLAYERS_TO_START) {
            const gameId = `game_${uuidv4()}`;
            console.log(`Starting game ${gameId} for ${currentLobbyPlayersData.length} players.`);
            const initialRound = 1;
            const initialGoal = calculateRoundGoal(initialRound);
            const initialSpawnInterval = calculateRoundSpawnInterval(initialRound, currentLobbyPlayersData.length > 1);

            games[gameId] = {
                id: gameId, players: {}, asteroids: {}, powerUps: {}, active: true, startTime: Date.now(),
                currentRound: initialRound, asteroidsDestroyedThisRound: 0, asteroidsNeededForRound: initialGoal,
                isRoundTransition: false, spawnTimer: 0, spawnInterval: initialSpawnInterval
            };

            currentLobbyPlayersData.forEach(pData => {
                if (players[pData.id]) {
                    players[pData.id] = {
                        ...players[pData.id], status: 'ingame', gameId: gameId, lives: 3, score: 0,
                        hasShield: false, rapidFireEndTime: 0, scoreMultiplierEndTime: 0
                    };
                    games[gameId].players[pData.id] = players[pData.id];
                    const playerSocket = io.sockets.sockets.get(pData.id);
                    if (playerSocket) {
                        playerSocket.leave('lobby');
                        playerSocket.join(gameId);
                    }
                }
            });
            io.to(gameId).emit('gameStarting', { gameId: gameId, players: Object.values(games[gameId].players), round: initialRound, goal: initialGoal });
            updateLobbyStatus();
        }
    });

    socket.on('playerUpdate', (data) => {
         const player = players[socket.id];
         if (player && player.status === 'ingame' && player.gameId) {
             player.x = data.x;
             player.y = data.y;
             socket.to(player.gameId).emit('remotePlayerUpdate', { id: player.id, x: player.x, y: player.y });
         }
    });

    socket.on('shoot', (projectileData) => {
        const player = players[socket.id];
        if (player && player.status === 'ingame' && player.gameId) {
             const gameRoom = findGameRoomForSocket(socket);
             if (gameRoom) {
                 socket.to(gameRoom).emit('playerShot', { shooterId: socket.id, ...projectileData });
             }
        }
    });

    socket.on('dealDamage', (data) => {
        const player = players[socket.id];
        const game = games[player?.gameId];
        const asteroidId = data.asteroidId;
        const damage = data.damage || 1;
        if (!player || player.status !== 'ingame' || !game || !game.asteroids[asteroidId] || game.isRoundTransition) return;

        const hitAsteroid = game.asteroids[asteroidId];
        const now = Date.now();
        let scoreToAdd = 0;
        let shouldDestroy = false;
        const scoreMultiplier = (player.scoreMultiplierEndTime > now) ? SCORE_MULTIPLIER_VALUE : 1;

        hitAsteroid.health -= damage;
        if (hitAsteroid.type === ASTEROID_TYPE_ARMORED) {
             scoreToAdd = Math.min(damage, hitAsteroid.health + damage) * SCORE_PER_ARMORED_HEALTH_POINT * scoreMultiplier;
        } else if (hitAsteroid.health <= 0) {
             scoreToAdd = SCORE_PER_ASTEROID_SVR * scoreMultiplier;
        }

        if (hitAsteroid.health <= 0) {
            shouldDestroy = true;
        } else if (hitAsteroid.type === ASTEROID_TYPE_ARMORED) {
            io.to(player.gameId).emit('asteroidDamaged', { id: asteroidId, currentHealth: hitAsteroid.health });
        }

        if (scoreToAdd > 0) {
            player.score += scoreToAdd;
            io.to(player.gameId).emit('scoreUpdate', { id: socket.id, score: player.score });
        }

        if (shouldDestroy) {
            const dropX = hitAsteroid.x; const dropY = hitAsteroid.y;
            delete game.asteroids[asteroidId];
            io.to(player.gameId).emit('asteroidDestroyed', asteroidId);

            game.asteroidsDestroyedThisRound++;
            io.to(player.gameId).emit('roundProgress', { destroyed: game.asteroidsDestroyedThisRound, needed: game.asteroidsNeededForRound });

            if (game.asteroidsDestroyedThisRound >= game.asteroidsNeededForRound) {
                startRoundTransition(player.gameId);
            } else if (Math.random() < POWERUP_DROP_CHANCE) { // Drop only if round not ending
                spawnPowerUp(game, dropX, dropY);
            }
        }
         checkForLeaderUpdate(game);
    });

    socket.on('collectPowerUp', (powerUpId) => {
        const player = players[socket.id];
        const game = games[player?.gameId];
        if (!player || player.status !== 'ingame' || !game || !game.powerUps[powerUpId]) return;

        const powerUp = game.powerUps[powerUpId];
        console.log(`Player ${socket.id} collected ${powerUp.type} powerUp ${powerUpId}`);
        delete game.powerUps[powerUpId];

        const now = Date.now();
        let effectEndTime = 0; let effectType = '';

        switch (powerUp.type) {
            case 'shield':
                player.hasShield = true; effectType = 'shield';
                setTimeout(() => { if (players[socket.id] && players[socket.id].gameId === game.id) { players[socket.id].hasShield = false; io.to(player.gameId).emit('playerShieldOff', { id: player.id }); }}, SHIELD_DURATION_MS);
                break;
            case 'rapidFire': player.rapidFireEndTime = now + RAPID_FIRE_DURATION_MS; effectEndTime = player.rapidFireEndTime; effectType = 'rapidFire'; break;
            case 'scoreMultiplier': player.scoreMultiplierEndTime = now + SCORE_MULTIPLIER_DURATION_MS; effectEndTime = player.scoreMultiplierEndTime; effectType = 'scoreMultiplier'; break;
            default: return;
        }
        io.to(player.gameId).emit('powerUpCollected', powerUpId);
        if (effectType) io.to(player.gameId).emit('playerPowerUpOn', { id: player.id, type: effectType, endTime: effectEndTime });
    });

     socket.on('playerWasHit', () => {
         const player = players[socket.id];
         const game = games[player?.gameId];
         if (!player || player.status !== 'ingame' || !game) return;

         if (player.hasShield) { player.hasShield = false; io.to(player.gameId).emit('playerShieldUsed', { id: player.id }); }
         else {
             player.lives--;
             io.to(player.gameId).emit('livesUpdate', { id: socket.id, lives: player.lives });
             if (player.lives <= 0) { player.status = 'dead'; io.to(player.gameId).emit('playerDied', socket.id); checkForGameOver(player.gameId); }
             else { checkForLeaderUpdate(game); }
         }
     });

     socket.on('enterLobby', () => {
        const player = players[socket.id];
        if (player) {
            console.log(`Player ${socket.id} returning to lobby.`);
            const gameId = player.gameId;
            player.status = 'lobby'; player.gameId = undefined; player.lives = 3; player.score = 0; player.hasShield = false;
            player.rapidFireEndTime = 0; player.scoreMultiplierEndTime = 0;
            if (gameId) socket.leave(gameId);
            socket.join('lobby'); socket.emit('lobbyState', getLobbyPlayers());
            socket.broadcast.to('lobby').emit('playerJoinedLobby', player);
            updateLobbyStatus();
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const playerInfo = players[socket.id];
        if (playerInfo) {
            const gameId = playerInfo.gameId;
            const wasInLobby = playerInfo.status === 'lobby';
            delete players[socket.id];
            if(gameId && games[gameId]){ delete games[gameId].players[socket.id]; io.to(gameId).emit('playerLeftGame', socket.id); checkForGameOver(gameId); }
            else if (wasInLobby) { socket.broadcast.to('lobby').emit('playerLeftLobby', socket.id); updateLobbyStatus(); }
        }
    });
});

function gameLoop() {
    const now = Date.now();
    for (const gameId in games) {
        const game = games[gameId];
        if (!game.active || game.isRoundTransition) continue;
        const deltaTime = TICK_RATE / 1000.0;

        game.spawnTimer += deltaTime;
        if (game.spawnTimer >= game.spawnInterval) {
            game.spawnTimer = 0;
            spawnAsteroidForGame(gameId);
        }

        let updatedAsteroids = {};
        for (const astId in game.asteroids) {
            const ast = game.asteroids[astId];
            ast.x += ast.velX * deltaTime; ast.y += ast.velY * deltaTime;
            updatedAsteroids[astId] = { id: ast.id, x: ast.x, y: ast.y };
            if (ast.y > 800 || ast.y < -200 || ast.x < -200 || ast.x > 1000) {
                 delete game.asteroids[astId]; io.to(gameId).emit('asteroidDestroyed', astId);
            }
        }

        let updatedPowerUps = {}; const powerUpSpeed = 50;
        for (const pId in game.powerUps) {
            const pUp = game.powerUps[pId];
            pUp.y += powerUpSpeed * deltaTime;
            updatedPowerUps[pId] = { id: pUp.id, x: pUp.x, y: pUp.y, type: pUp.type };
            if (pUp.y > 800) { delete game.powerUps[pId]; io.to(gameId).emit('powerUpCollected', pId); }
        }

        if (Object.keys(updatedAsteroids).length > 0) io.to(gameId).emit('asteroidsUpdate', updatedAsteroids);
        if (Object.keys(updatedPowerUps).length > 0) io.to(gameId).emit('powerUpsUpdate', updatedPowerUps);
    }
}

function spawnAsteroidForGame(gameId) {
    const game = games[gameId];
    if (!game || !game.active || game.isRoundTransition) return;
    const activePlayersInGame = Object.values(game.players).filter(p => p.status === 'ingame');
    if (activePlayersInGame.length === 0) return;

    const astId = uuidv4(); const spawnX = Math.random() * 800; const spawnY = -50;
    let targetX = 400; let targetY = 500;
    const targetPlayerIndex = Math.floor(Math.random() * activePlayersInGame.length);
    const targetPlayer = activePlayersInGame[targetPlayerIndex];
    if (targetPlayer) { targetX = targetPlayer.x; targetY = targetPlayer.y; }

    const speedMultiplier = Math.pow(ROUND_SPEED_MULTIPLIER, game.currentRound - 1);
    const baseSpeedThisRound = ASTEROID_BASE_SPEED * speedMultiplier;
    const speedVarianceThisRound = ASTEROID_SPEED_VARIANCE * speedMultiplier;
    const speed = baseSpeedThisRound + Math.random() * speedVarianceThisRound;

    const dx = targetX - spawnX; const dy = targetY - spawnY; const magnitude = Math.sqrt(dx*dx + dy*dy);
    let velX = 0, velY = speed;
    if (magnitude > 0) { velX = (dx / magnitude) * speed; velY = (dy / magnitude) * speed; }

    let asteroidType = ASTEROID_TYPE_NORMAL; let health = ASTEROID_NORMAL_HEALTH;
    if (Math.random() < 0.25) { asteroidType = ASTEROID_TYPE_ARMORED; health = ASTEROID_ARMORED_HEALTH; }

    const asteroidData = { id: astId, x: spawnX, y: spawnY, velX: velX, velY: velY, type: asteroidType, health: health, sizeHint: asteroidType === ASTEROID_TYPE_ARMORED ? ASTEROID_SIZE_LARGE : undefined };
    game.asteroids[astId] = asteroidData;
    io.to(gameId).emit('asteroidSpawned', asteroidData);
}

function spawnPowerUp(game, x, y) {
    const powerUpId = uuidv4(); const rand = Math.random(); let powerUpType = 'shield';
    if (rand < 0.4) powerUpType = 'shield'; else if (rand < 0.75) powerUpType = 'rapidFire'; else powerUpType = 'scoreMultiplier';
    const powerUpData = { id: powerUpId, x: x, y: y, type: powerUpType };
    game.powerUps[powerUpId] = powerUpData;
    io.to(game.id).emit('powerUpSpawned', powerUpData);
    console.log(`Spawned powerUp ${powerUpId} [${powerUpType}] at ${x.toFixed(0)}, ${y.toFixed(0)}`);
}

function startRoundTransition(gameId) {
    const game = games[gameId];
    if (!game || !game.active || game.isRoundTransition) return;
    console.log(`Game ${gameId} completing Round ${game.currentRound}.`);
    game.isRoundTransition = true; game.spawnTimer = 0; game.asteroids = {}; game.powerUps = {};
    io.to(gameId).emit('clearEntities');

    game.currentRound++; game.asteroidsDestroyedThisRound = 0;
    game.asteroidsNeededForRound = calculateRoundGoal(game.currentRound);
    game.spawnInterval = calculateRoundSpawnInterval(game.currentRound, Object.keys(game.players).length > 1);

    io.to(gameId).emit('roundOver', { completedRound: game.currentRound - 1, nextRound: game.currentRound, nextGoal: game.asteroidsNeededForRound, transitionTime: ROUND_TRANSITION_TIME_MS / 1000 });

    game.roundTransitionTimer = setTimeout(() => {
        if (games[gameId]) { games[gameId].isRoundTransition = false; games[gameId].roundTransitionTimer = null; io.to(gameId).emit('newRoundStarting', { round: games[gameId].currentRound }); console.log(`Game ${gameId} starting Round ${games[gameId].currentRound}.`); }
    }, ROUND_TRANSITION_TIME_MS);
}

function calculateRoundGoal(round) { return ROUND_BASE_GOAL + (round - 1) * ROUND_GOAL_INCREASE; }
function calculateRoundSpawnInterval(round, isMultiplayer) { const baseInterval = isMultiplayer ? MULTIPLAYER_SPAWN_INTERVAL : BASE_SPAWN_INTERVAL; const interval = baseInterval - (round - 1) * ROUND_SPAWN_INTERVAL_REDUCTION; return Math.max(MIN_ASTEROID_SPAWN_INTERVAL_SVR, interval); }

function checkForGameOver(gameId) {
    const game = games[gameId]; if (!game || !game.active) return;
    const activePlayers = Object.values(game.players).filter(p => p.status === 'ingame');
    if (activePlayers.length <= 1) {
        game.active = false; console.log(`Game ${gameId} ended.`);
        let winnerId = activePlayers.length === 1 ? activePlayers[0].id : null;
        const finalScores = Object.values(game.players).map(p => ({ id: p.id, score: p.score }));
        let highestScore = -1; finalScores.forEach(p => { if(p.score > highestScore) highestScore = p.score; });
        io.to(gameId).emit('gameOver', { winnerId: winnerId, finalScores: finalScores, highestScore: highestScore });
        setTimeout(() => { delete games[gameId]; console.log(`Cleaned up game instance ${gameId}`); }, 30000);
    } else { checkForLeaderUpdate(game); }
}

function checkForLeaderUpdate(game) {
     if (!game || !game.active) return; let currentLeaderId = null; let highestScore = -1;
     const activePlayers = Object.values(game.players).filter(p => p.status === 'ingame');
     activePlayers.forEach(p => { if (p.score > highestScore) { highestScore = p.score; currentLeaderId = p.id; } else if (p.score === highestScore && highestScore !== -1) currentLeaderId = null; });
     if (game.currentLeaderId !== currentLeaderId) { game.currentLeaderId = currentLeaderId; io.to(game.id).emit('leaderUpdate', { leaderId: currentLeaderId }); console.log(`Leader update for game ${game.id}: ${currentLeaderId || 'None/Tie'}`); }
}

function getLobbyPlayers() { return Object.values(players).filter(p => p.status === 'lobby'); }
function getGamePlayers(gameId) { return Object.values(players).filter(p => p.gameId === gameId); }
function updateLobbyStatus() { const lobbyCount = getLobbyPlayers().length; io.to('lobby').emit('lobbyStatusUpdate', { count: lobbyCount, canStart: lobbyCount >= MIN_PLAYERS_TO_START }); console.log(`Lobby status updated: ${lobbyCount} players.`); }
function findGameRoomForSocket(socket) { const rooms = Array.from(socket.rooms); return rooms.find(room => room.startsWith('game_') && room !== socket.id); }

server.listen(PORT, () => { console.log(`Server listening on *:${PORT}`); });