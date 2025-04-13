const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('game-container');
const scoreDisplay = document.getElementById('score');
const livesDisplay = document.getElementById('lives');
const gameOverOverlay = document.getElementById('game-over-overlay');
const finalScoreDisplay = document.getElementById('final-score');
const highScoreDisplay = document.getElementById('high-score');
const restartButton = document.getElementById('restart-button');
const lobbyOverlay = document.getElementById('lobby-overlay');
const startGameButton = document.getElementById('start-game-button');
const lobbyStatus = document.getElementById('lobby-status');
const playerListUL = document.getElementById('player-list');
const roundDisplay = document.getElementById('round-info');
const roundTransitionOverlay = document.getElementById('round-transition-overlay');
const roundTransitionMessageDisplay = document.getElementById('round-transition-message');

canvas.width = 800;
canvas.height = 600;

const scaleFactor = 0.5;

const SERVER_URL = 'http://localhost:3000';
let socket;
let myPlayerId = null;
let otherPlayers = {};
let lobbyPlayers = {};
let currentLeaderId = null;

let player;
let projectiles = [];
let asteroids = new Map();
let stars = [];
let powerUps = new Map();
let effects = [];
let score = 0;
let lives = 3;
let highScore = localStorage.getItem('spaceAvoiderHighScore') || 0;
let isGameOver = false;
let isPaused = false;
let isGameRunning = false;
let lastTime = 0;
let settings = { minAsteroidSize: 15 * scaleFactor, maxAsteroidSize: 40 * scaleFactor, initialSpawnInterval: 1.5 };
const scorePerSecond = 10;
const scorePerAsteroid = 50;
const starCount = 150;
let playerUpdateTimer = 0;
let comboCounter = 0;
let comboTimer = 0;
const COMBO_TIMEOUT = 1.0;
const COMBO_BONUS_MULTIPLIER = 10;
let shootCooldownTimer = 0;
let baseShootCooldown = 0.15;
let currentWeaponLevel = 1;
let projectileDamage = 1;
const weaponUpgradeThresholds = [1000, 3000, 7000, 15000];
const weaponLevelStats = [ { level: 1, cooldown: 0.15, damage: 1 }, { level: 2, cooldown: 0.13, damage: 1 }, { level: 3, cooldown: 0.11, damage: 2 }, { level: 4, cooldown: 0.09, damage: 2 }, { level: 5, cooldown: 0.07, damage: 3 }, ];
const EXPLOSION_PARTICLE_COUNT = 15;
const EXPLOSION_PARTICLE_DURATION = 0.5;
const EXPLOSION_PARTICLE_SPEED = 150 * scaleFactor;
const DAMAGE_FLASH_DURATION = 0.3;
const CROWN_ICON = '👑';

const playerImage = { color: 'cyan', width: 40 * scaleFactor, height: 40 * scaleFactor };
const projectileImage = { color: 'yellow', width: 5 * scaleFactor, height: 15 * scaleFactor };
const powerUpVisuals = { shield: { color: 'lime', letter: 'S' }, rapidFire: { color: 'orange', letter: 'R' }, scoreMultiplier: { color: '#FFD700', letter: 'x2' } };

const sounds = { shoot: new Audio('shoot.wav'), explosion: new Audio('explosion.wav'), playerHit: new Audio('playerHit.wav'), };
function playSound(sound) { if (sounds[sound]) { sounds[sound].currentTime = 0; sounds[sound].play().catch(error => console.warn(`Playback error for ${sound}:`, error)); }}

class Player {
    constructor(x, y, id = null) { this.id = id; this.x = x; this.y = y; this.width = playerImage.width; this.height = playerImage.height; this.color = playerImage.color; this.lives = 3; this.hasShield = false; this.hasRapidFire = false; this.hasScoreMultiplier = false; this.rapidFireEndTime = 0; this.scoreMultiplierEndTime = 0; this.isInvincible = false; this.invincibilityTimer = 0; this.invincibilityDuration = 2.0; this.blinkOn = true; this.isTakingDamage = false; this.damageFlashTimer = 0; }
    draw(ctx) { ctx.globalAlpha = 1.0; if (this.hasShield) { ctx.strokeStyle = 'aqua'; ctx.lineWidth = 2 * scaleFactor; ctx.beginPath(); ctx.arc(this.x, this.y, (this.width / 2) * 1.4, 0, Math.PI * 2); ctx.stroke(); } let currentFillColor = this.color; if (this.isTakingDamage) { this.blinkOn = !this.blinkOn; currentFillColor = this.blinkOn ? 'red' : this.color; } else { this.blinkOn = true; } if (this.isInvincible && !this.isTakingDamage) { this.blinkOn = !this.blinkOn; if (!this.blinkOn) { ctx.globalAlpha = 1.0; return; } ctx.globalAlpha = 0.6; } ctx.fillStyle = currentFillColor; ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height); ctx.globalAlpha = 1.0; let iconYOffset = this.height / 2 + 10 * scaleFactor; let iconCount = 0; const iconSpacing = 15 * scaleFactor; if (this.hasRapidFire) { drawPowerupIcon(ctx, this.x + (iconCount * iconSpacing) - (iconSpacing/2 * ( (this.hasScoreMultiplier?1:0) )), this.y + iconYOffset, 'rapidFire'); iconCount++; } if (this.hasScoreMultiplier) { drawPowerupIcon(ctx, this.x + (iconCount * iconSpacing) - (iconSpacing/2 * ( (this.hasRapidFire?1:0) )), this.y + iconYOffset, 'scoreMultiplier'); iconCount++; } if (this.id === currentLeaderId && isGameRunning) { ctx.font = `${20 * scaleFactor}px Arial`; ctx.textAlign = 'center'; ctx.fillText(CROWN_ICON, this.x, this.y - this.height/2 - 12 * scaleFactor); }}
    shoot() { if (isGameOver || !isGameRunning || shootCooldownTimer > 0) return false; const projectile = new Projectile(this.x, this.y - this.height / 2 - (5 * scaleFactor)); projectiles.push(projectile); playSound('shoot'); const cooldown = this.hasRapidFire ? baseShootCooldown / 3.0 : baseShootCooldown; shootCooldownTimer = cooldown; if (socket && this.id === myPlayerId) socket.emit('shoot', { x: projectile.x, y: projectile.y }); return true; }
    hit() { if (this.isInvincible || isGameOver || !isGameRunning) return false; if (this.hasShield) { this.hasShield = false; playSound('playerHit'); createExplosionEffect(this.x, this.y, 'aqua', 10); return false; } if (socket && this.id === myPlayerId) { socket.emit('playerWasHit'); triggerScreenShake(); } this.lives--; livesDisplay.textContent = `Lives: ${this.lives}`; playSound('playerHit'); this.isTakingDamage = true; this.damageFlashTimer = DAMAGE_FLASH_DURATION; if (this.lives <= 0) { gameOver(); createExplosionEffect(this.x, this.y, this.color, 30); return true; } else { this.isInvincible = true; this.invincibilityTimer = this.invincibilityDuration; return false; }}
    update(deltaTime) { if (this.isInvincible) { this.invincibilityTimer -= deltaTime; if (this.invincibilityTimer <= 0) { this.isInvincible = false; this.blinkOn = true; }} if (this.isTakingDamage) { this.damageFlashTimer -= deltaTime; if (this.damageFlashTimer <= 0) { this.isTakingDamage = false; this.blinkOn = true; }} if (shootCooldownTimer > 0) { shootCooldownTimer -= deltaTime; } const now = Date.now(); if (this.hasRapidFire && this.rapidFireEndTime <= now) this.hasRapidFire = false; if (this.hasScoreMultiplier && this.scoreMultiplierEndTime <= now) this.hasScoreMultiplier = false; }
}
class Particle { constructor(x, y, color = 'orange') { this.x = x; this.y = y; const angle = Math.random() * Math.PI * 2; const speed = Math.random() * EXPLOSION_PARTICLE_SPEED + EXPLOSION_PARTICLE_SPEED * 0.5; this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed; this.life = EXPLOSION_PARTICLE_DURATION; this.size = (Math.random() * 2 + 1) * scaleFactor; this.color = color; this.alpha = 1.0; } update(deltaTime) { this.x += this.vx * deltaTime; this.y += this.vy * deltaTime; this.life -= deltaTime; this.alpha = Math.max(0, this.life / EXPLOSION_PARTICLE_DURATION); } draw(ctx) { ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0; }}
class PowerUp { constructor(id, x, y, type) { this.id = id; this.x = x; this.y = y; this.type = type; this.width = 25 * scaleFactor; this.height = 25 * scaleFactor; const visual = powerUpVisuals[type] || { color: 'magenta', letter: '?' }; this.color = visual.color; this.letter = visual.letter; this.bobOffset = Math.random() * Math.PI * 2; this.bobSpeed = 1.5 + Math.random(); } draw(ctx) { const drawY = this.y + Math.sin(this.bobOffset) * 3 * scaleFactor; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, drawY, this.width / 2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'black'; ctx.font = `bold ${this.letter === 'x2' ? 10 : 14 * scaleFactor}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.letter, this.x, drawY); } update(deltaTime) { this.bobOffset += this.bobSpeed * deltaTime; }}
class Projectile { constructor(x, y) { this.x = x; this.y = y; this.width = projectileImage.width; this.height = projectileImage.height; this.color = projectileImage.color; this.speed = 400; } draw(ctx) { ctx.fillStyle = this.color; ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height); } update(deltaTime) { this.y -= this.speed * deltaTime; }}
class Asteroid { constructor(id, x, y, velX, velY, type = 'normal', health = 1, sizeHint = undefined) { this.id = id; this.x = x; this.y = y; this.velX = velX; this.velY = velY; this.type = type; this.maxHealth = health; this.currentHealth = health; let baseSize; if (this.type === 'armored') { baseSize = (sizeHint || 60) * scaleFactor; } else { const sizeRange = settings.maxAsteroidSize - settings.minAsteroidSize; const validSizeRange = Math.max(0, sizeRange); baseSize = settings.minAsteroidSize + Math.random() * validSizeRange; } this.width = baseSize * (0.8 + Math.random() * 0.4); this.height = this.width; this.color = this.type === 'armored' ? '#777777' : 'brown'; this.damageColor = '#FFA500'; } draw(ctx) { let currentFillColor = this.color; const healthRatio = this.currentHealth / this.maxHealth; if (this.type === 'armored' && healthRatio < 1.0) { const r = parseInt(this.damageColor.substring(1, 3), 16) * (1 - healthRatio) + parseInt(this.color.substring(1, 3), 16) * healthRatio; const g = parseInt(this.damageColor.substring(3, 5), 16) * (1 - healthRatio) + parseInt(this.color.substring(3, 5), 16) * healthRatio; const b = parseInt(this.damageColor.substring(5, 7), 16) * (1 - healthRatio) + parseInt(this.color.substring(5, 7), 16) * healthRatio; currentFillColor = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`; } ctx.fillStyle = currentFillColor; ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height); } update(deltaTime) { this.x += this.velX * deltaTime; this.y += this.velY * deltaTime; } updateHealth(newHealth) { this.currentHealth = newHealth; }}
class Star { constructor() { this.x = Math.random() * canvas.width; this.y = Math.random() * canvas.height; this.size = (Math.random() * 1.5 + 0.5) * scaleFactor; this.speed = Math.random() * 10 + 5; this.color = `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.3})`; } draw(ctx) { ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); } update(deltaTime) { this.y += this.speed * deltaTime; if (this.y > canvas.height + this.size) { this.y = -this.size; this.x = Math.random() * canvas.width; }}}

let currentRound = 1; let asteroidsDestroyedThisRound = 0; let asteroidsNeededForRound = 10; let isRoundTransition = false; let roundTransitionMessage = "";

function updateLobbyUI() { playerListUL.innerHTML = ''; let count = 0; for (const id in lobbyPlayers) { const li = document.createElement('li'); li.textContent = `Player ${id.substring(0, 6)}`; li.dataset.id = id; if (id === myPlayerId) { li.classList.add('you'); li.textContent += ' (You)'; } playerListUL.appendChild(li); count++; } lobbyStatus.textContent = `Waiting for players (${count} connected)...`; }

function connectToServer() {
    if (socket) socket.disconnect();
    console.log(`Attempting to connect to server: ${SERVER_URL}`);
    lobbyStatus.textContent = 'Connecting...'; startGameButton.disabled = true;
    socket = io(SERVER_URL, { transports: ["websocket"] });
    socket.on('connect_error', (err) => { console.error("Connection Error:", err); lobbyStatus.textContent = `Connection Failed: ${err.message}`; startGameButton.disabled = true; });
    socket.on('connect', () => { console.log('Connected! Socket ID:', socket.id); lobbyStatus.textContent = 'Connected! Waiting for players...'; });
    socket.on('disconnect', () => { console.log('Disconnected.'); lobbyStatus.textContent = 'Disconnected. Please refresh.'; startGameButton.disabled = true; lobbyPlayers = {}; updateLobbyUI(); if (isGameRunning) { isGameOver = true; isGameRunning = false; gameContainer.style.display = 'none'; lobbyOverlay.style.display = 'flex'; }});
    socket.on('yourId', (id) => { myPlayerId = id; console.log("My Player ID:", id); if(player) player.id = id; updateLobbyUI(); });
    socket.on('lobbyState', (currentLobbyPlayers) => { console.log("Received lobby state:", currentLobbyPlayers); lobbyPlayers = {}; currentLobbyPlayers.forEach(p => { lobbyPlayers[p.id] = p; }); updateLobbyUI(); });
    socket.on('playerJoinedLobby', (newPlayer) => { if (newPlayer.id !== myPlayerId) { lobbyPlayers[newPlayer.id] = newPlayer; console.log("Player joined lobby:", newPlayer.id); updateLobbyUI(); }});
    socket.on('playerLeftLobby', (id) => { console.log("Player left lobby:", id); delete lobbyPlayers[id]; updateLobbyUI(); });
    socket.on('lobbyStatusUpdate', (status) => { console.log("Lobby status update:", status); const MIN_PLAYERS_TO_START = 2; startGameButton.disabled = !status.canStart; startGameButton.textContent = status.canStart ? "Start Game" : `Waiting (${status.count}/${MIN_PLAYERS_TO_START})...`; lobbyStatus.textContent = `Waiting for players (${status.count} connected)...`; });
    socket.on('gameStarting', (gameData) => { console.log("Game starting!", gameData); lobbyOverlay.style.display = 'none'; gameContainer.style.display = 'block'; roundTransitionOverlay.style.display = 'none'; isGameRunning = true; otherPlayers = {}; gameData.players.forEach(pData => { if (pData.id !== myPlayerId) otherPlayers[pData.id] = pData; }); asteroids.clear(); powerUps.clear(); effects = []; currentRound = gameData.round || 1; asteroidsNeededForRound = gameData.goal || calculateRoundGoal(currentRound); asteroidsDestroyedThisRound = 0; updateRoundUI(); initializeGameEntitiesAndLoop(); });
    socket.on('remotePlayerUpdate', (playerData) => { if (otherPlayers[playerData.id]) { otherPlayers[playerData.id].x = playerData.x; otherPlayers[playerData.id].y = playerData.y; if(playerData.lives !== undefined) otherPlayers[playerData.id].lives = playerData.lives; if(playerData.score !== undefined) otherPlayers[playerData.id].score = playerData.score; } else if (playerData.id !== myPlayerId) { otherPlayers[playerData.id] = playerData; }});
    socket.on('playerShot', (shotData) => { if (shotData.shooterId !== myPlayerId) console.log(`Player ${shotData.shooterId} shot`); });
    socket.on('scoreUpdate', (data) => { if (data.id === myPlayerId) { score = data.score; scoreDisplay.textContent = `Score: ${score}`; } else if (otherPlayers[data.id]) otherPlayers[data.id].score = data.score; });
    socket.on('livesUpdate', (data) => { if (data.id === myPlayerId && player) { player.lives = data.lives; livesDisplay.textContent = `Lives: ${player.lives}`; } else if (otherPlayers[data.id]) otherPlayers[data.id].lives = data.lives; });
    socket.on('playerDied', (id) => { if (id === myPlayerId && !isGameOver) { console.log("Server confirmed player death."); gameOver(); } else if (otherPlayers[id]) { console.log(`Player ${id} died.`); otherPlayers[id].isDead = true; otherPlayers[id].color = 'red'; }});
    socket.on('playerLeftGame', (id) => { console.log("Player left game:", id); delete otherPlayers[id]; });
    socket.on('asteroidSpawned', (astData) => { if (!asteroids.has(astData.id)) asteroids.set(astData.id, new Asteroid(astData.id, astData.x, astData.y, astData.velX, astData.velY, astData.type, astData.health, astData.sizeHint)); });
    socket.on('asteroidsUpdate', (serverAsteroids) => { for (const id in serverAsteroids) { if (asteroids.has(id)) { const localAst = asteroids.get(id); localAst.x = serverAsteroids[id].x; localAst.y = serverAsteroids[id].y; }}});
    socket.on('asteroidDestroyed', (asteroidId) => { if (asteroids.has(asteroidId)) { const ast = asteroids.get(asteroidId); if(ast) createExplosionEffect(ast.x, ast.y, ast.color); asteroids.delete(asteroidId); }});
    socket.on('asteroidDamaged', (data) => { if (asteroids.has(data.id)) asteroids.get(data.id).updateHealth(data.currentHealth); });
    socket.on('powerUpSpawned', (pUpData) => { if (!powerUps.has(pUpData.id)) powerUps.set(pUpData.id, new PowerUp(pUpData.id, pUpData.x, pUpData.y, pUpData.type)); });
    socket.on('powerUpsUpdate', (serverPowerUps) => { for (const id in serverPowerUps) { if (powerUps.has(id)) { powerUps.get(id).x = serverPowerUps[id].x; powerUps.get(id).y = serverPowerUps[id].y; } else { const pUpData = serverPowerUps[id]; powerUps.set(id, new PowerUp(id, pUpData.x, pUpData.y, pUpData.type)); }}});
    socket.on('powerUpCollected', (powerUpId) => { powerUps.delete(powerUpId); });
    socket.on('playerShieldOn', (data) => { if (data.id === myPlayerId && player) player.hasShield = true; else if (otherPlayers[data.id]) otherPlayers[data.id].hasShield = true; });
    socket.on('playerShieldOff', (data) => { if (data.id === myPlayerId && player) player.hasShield = false; else if (otherPlayers[data.id]) otherPlayers[data.id].hasShield = false; });
    socket.on('playerShieldUsed', (data) => { if (data.id === myPlayerId && player) player.hasShield = false; else if (otherPlayers[data.id]) otherPlayers[data.id].hasShield = false; });
    socket.on('playerPowerUpOn', (data) => { if (data.id === myPlayerId && player) { if (data.type === 'rapidFire') { player.hasRapidFire = true; player.rapidFireEndTime = data.endTime; } if (data.type === 'scoreMultiplier') { player.hasScoreMultiplier = true; player.scoreMultiplierEndTime = data.endTime; }} else if (otherPlayers[data.id]) { if (data.type === 'rapidFire') otherPlayers[data.id].hasRapidFire = true; if (data.type === 'scoreMultiplier') otherPlayers[data.id].hasScoreMultiplier = true; }});
    socket.on('gameOver', (data) => { if (!isGameOver) { isGameOver = true; isGameRunning = false; let message = "Game Over!"; let winnerText = "No winner."; if (data.winnerId) winnerText = (data.winnerId === myPlayerId) ? "You Win!" : `Player ${data.winnerId.substring(0,6)} Wins!`; message = `${winnerText}`; if (score > highScore) { highScore = score; localStorage.setItem('spaceAvoiderHighScore', highScore); } gameOverOverlay.querySelector('h1').textContent = message; finalScoreDisplay.textContent = `Your Score: ${score}`; highScoreDisplay.textContent = `High Score: ${highScore}`; gameOverOverlay.style.display = 'flex'; restartButton.textContent = "Back to Lobby"; }});
    socket.on('leaderUpdate', (data) => { currentLeaderId = data.leaderId; console.log("Current leader:", currentLeaderId); });
    socket.on('roundProgress', (data) => { asteroidsDestroyedThisRound = data.destroyed; asteroidsNeededForRound = data.needed; updateRoundUI(); });
    socket.on('roundOver', (data) => { console.log(`Round ${data.completedRound} over. Transition to round ${data.nextRound}.`); isRoundTransition = true; currentRound = data.nextRound; asteroidsNeededForRound = data.nextGoal; asteroidsDestroyedThisRound = 0; roundTransitionMessage = `Round ${data.completedRound} Complete!\nStarting Round ${data.nextRound}...\n(Goal: ${data.nextGoal} Asteroids)`; roundTransitionMessageDisplay.innerText = roundTransitionMessage; roundTransitionOverlay.style.display = 'flex'; updateRoundUI(); });
    socket.on('newRoundStarting', (data) => { console.log(`Server starting Round ${data.round}.`); isRoundTransition = false; roundTransitionOverlay.style.display = 'none'; });
    socket.on('clearEntities', () => { console.log("Clearing entities for new round."); asteroids.clear(); powerUps.clear(); projectiles = []; effects = []; });
}

function updateRoundUI() { if (roundDisplay) roundDisplay.textContent = `Round: ${currentRound} | Destroyed: ${asteroidsDestroyedThisRound} / ${asteroidsNeededForRound}`; }
function createExplosionEffect(x, y, color = 'orange', count = EXPLOSION_PARTICLE_COUNT) { for (let i = 0; i < count; i++) effects.push(new Particle(x, y, color)); }

function checkCollisions() {
    if (!player || isGameOver || !isGameRunning) return;
    for (let i = projectiles.length - 1; i >= 0; i--) { if(!projectiles[i]) continue; const proj = projectiles[i]; asteroids.forEach((ast, astId) => { if (!projectiles[i]) return; if (proj.x - proj.width / 2 < ast.x + ast.width / 2 && proj.x + proj.width / 2 > ast.x - ast.width / 2 && proj.y - proj.height / 2 < ast.y + ast.height / 2 && proj.y + proj.height / 2 > ast.y - ast.height / 2) { if (socket) socket.emit('dealDamage', { asteroidId: ast.id, damage: projectileDamage }); projectiles.splice(i, 1); playSound('explosion'); createExplosionEffect(ast.x, ast.y, ast.damageColor); comboCounter++; comboTimer = COMBO_TIMEOUT; score += comboCounter * COMBO_BONUS_MULTIPLIER; return; }}); }
    if (!player.isInvincible && !player.hasShield) { asteroids.forEach((ast, astId) => { if (!player || player.isInvincible || player.hasShield) return; if (player.x - player.width / 2 < ast.x + ast.width / 2 && player.x + player.width / 2 > ast.x - ast.width / 2 && player.y - player.height / 2 < ast.y + ast.height / 2 && player.y + player.height / 2 > ast.y - ast.height / 2) { playSound('explosion'); createExplosionEffect(ast.x, ast.y, ast.color); if(player.hit()) return; return; }}); }
    powerUps.forEach((pUp, pUpId) => { if (!player || isGameOver) return; const dx = player.x - pUp.x; const dy = player.y - pUp.y; const distance = Math.sqrt(dx*dx + dy*dy); const collisionDistance = (player.width / 2) + (pUp.width / 2); if (distance < collisionDistance) { if (socket) socket.emit('collectPowerUp', pUpId); powerUps.delete(pUpId); }});
}

function sendPlayerState() { if (socket && socket.connected && player && !isGameOver && isGameRunning) socket.emit('playerUpdate', { x: player.x, y: player.y }); }

function update(deltaTime) {
    if (isRoundTransition || isGameOver || isPaused || !isGameRunning) return;
    playerUpdateTimer += deltaTime; if (playerUpdateTimer >= 0.05) { sendPlayerState(); playerUpdateTimer = 0; }
    player?.update(deltaTime); if (isShooting && player) player.shoot();
    projectiles.forEach(p => p.update(deltaTime)); for (let i = projectiles.length - 1; i >= 0; i--) { if (projectiles[i].y < -projectiles[i].height) projectiles.splice(i, 1); }
    asteroids.forEach(ast => ast.update(deltaTime)); powerUps.forEach(pUp => pUp.update(deltaTime)); stars.forEach(star => star.update(deltaTime));
    for (let i = effects.length - 1; i >= 0; i--) { effects[i].update(deltaTime); if (effects[i].life <= 0) effects.splice(i, 1); }
    let updatedLevel = false; for (let i = weaponUpgradeThresholds.length - 1; i >= 0; i--) { if (score >= weaponUpgradeThresholds[i] && currentWeaponLevel <= i + 1) { if (currentWeaponLevel !== i + 2) { currentWeaponLevel = i + 2; updatedLevel = true; break; }}} if (!updatedLevel && score < weaponUpgradeThresholds[0] && currentWeaponLevel !== 1) { currentWeaponLevel = 1; updatedLevel = true; } if (updatedLevel) { const stats = weaponLevelStats.find(s => s.level === currentWeaponLevel) || weaponLevelStats[0]; baseShootCooldown = stats.cooldown; projectileDamage = stats.damage; console.log(`Level Up! Lvl ${currentWeaponLevel}. CD: ${baseShootCooldown}, DMG: ${projectileDamage}`); }
    score += Math.floor(deltaTime * scorePerSecond); scoreDisplay.textContent = `Score: ${score}`;
    if (comboTimer > 0) { comboTimer -= deltaTime; } else { comboCounter = 0; }
    checkCollisions();
}

function triggerScreenShake(duration = 0.1, intensity = 4) { if (!isGameRunning || isGameOver) return; const originalX = parseFloat(gameContainer.style.left || '0px'); const originalY = parseFloat(gameContainer.style.top || '0px'); let shakeTimer = duration; function shake() { if (shakeTimer > 0) { const offsetX = (Math.random() - 0.5) * 2 * intensity; const offsetY = (Math.random() - 0.5) * 2 * intensity; gameContainer.style.left = `${originalX + offsetX}px`; gameContainer.style.top = `${originalY + offsetY}px`; shakeTimer -= (1/60); requestAnimationFrame(shake); } else { gameContainer.style.left = `${originalX}px`; gameContainer.style.top = `${originalY}px`; }} shake(); }
function drawPowerupIcon(ctx, x, y, type) { const visual = powerUpVisuals[type]; if (!visual) return; const iconSize = 10 * scaleFactor; ctx.fillStyle = visual.color; ctx.globalAlpha = 0.8; ctx.fillRect(x - iconSize / 2, y - iconSize / 2, iconSize, iconSize); ctx.fillStyle = 'black'; ctx.font = `bold ${type === 'scoreMultiplier' ? 8 : 8 * scaleFactor}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(visual.letter, x, y); ctx.globalAlpha = 1.0; }

function render() {
    if (!ctx) return;
    ctx.fillStyle = 'black'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    stars.forEach(star => { star.draw(ctx); });
    const isLeader = player && player.id === currentLeaderId;
    if(isLeader && !isGameOver && isGameRunning){ ctx.strokeStyle = 'gold'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2); ctx.lineWidth = 1; }
    player?.draw(ctx);
    for (const id in otherPlayers) { const pData = otherPlayers[id]; if (!pData.isDead) { ctx.fillStyle = pData.color || 'orange'; const hasOtherShield = pData.hasShield || false; if (hasOtherShield) ctx.globalAlpha = 0.5; const otherWidth = playerImage.width; const otherHeight = playerImage.height; ctx.fillRect(pData.x - otherWidth / 2, pData.y - otherHeight / 2, otherWidth, otherHeight); ctx.globalAlpha = 1.0; if (hasOtherShield) { ctx.strokeStyle = 'aqua'; ctx.lineWidth = 2 * scaleFactor; ctx.beginPath(); ctx.arc(pData.x, pData.y, (otherWidth / 2) * 1.4, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; } const scoreToShow = pData.score !== undefined ? pData.score : 0; const livesToShow = pData.lives !== undefined ? pData.lives : '?'; let textToShow = `S: ${scoreToShow} | L: ${livesToShow}`; if (pData.id === currentLeaderId) textToShow = `👑 ${textToShow}`; ctx.font = `${12 * scaleFactor}px Arial`; ctx.fillStyle = 'white'; ctx.textAlign = 'center'; const textX = pData.x; const textY = pData.y - otherHeight / 2 - (5 * scaleFactor); ctx.fillText(textToShow, textX, textY); }}
    projectiles.forEach(p => { p.draw(ctx); }); asteroids.forEach(ast => { ast.draw(ctx); }); powerUps.forEach(pUp => { pUp.draw(ctx); }); effects.forEach(effect => effect.draw(ctx));
    if (comboCounter > 1) { ctx.font = `bold ${24 * scaleFactor}px Arial`; ctx.fillStyle = 'rgba(255, 165, 0, 0.8)'; ctx.textAlign = 'center'; ctx.fillText(`Combo x${comboCounter}!`, canvas.width / 2, 40 * scaleFactor); }
    if (player && isGameRunning) { let hudY = 50 * scaleFactor; const hudX = 10 * scaleFactor; const hudLineHeight = 15 * scaleFactor; ctx.font = `${12 * scaleFactor}px Arial`; ctx.textAlign = 'left'; ctx.fillStyle = 'white'; const now = Date.now(); if (player.hasRapidFire) { const remaining = Math.max(0, (player.rapidFireEndTime - now) / 1000); ctx.fillStyle = powerUpVisuals.rapidFire.color; ctx.fillText(`Rapid Fire: ${remaining.toFixed(1)}s`, hudX, hudY); hudY += hudLineHeight; } if (player.hasScoreMultiplier) { const remaining = Math.max(0, (player.scoreMultiplierEndTime - now) / 1000); ctx.fillStyle = powerUpVisuals.scoreMultiplier.color; ctx.fillText(`Score x2: ${remaining.toFixed(1)}s`, hudX, hudY); hudY += hudLineHeight; } if (player.hasShield) { ctx.fillStyle = powerUpVisuals.shield.color; ctx.fillText(`Shield Active`, hudX, hudY); hudY += hudLineHeight; }}
    if (player && isGameRunning) { let weaponHudX = canvas.width / 2; let weaponHudY = 30 * scaleFactor; ctx.font = `bold ${14 * scaleFactor}px Arial`; ctx.textAlign = 'center'; ctx.fillStyle = 'yellow'; ctx.fillText(`Weapon Lvl: ${currentWeaponLevel}`, weaponHudX, weaponHudY); }
}

function gameLoop(timestamp) { if (!isGameRunning) return; if (isGameOver && gameOverOverlay.style.display !== 'flex') return; if (isPaused) { requestAnimationFrame(gameLoop); return; } const deltaTime = Math.min(0.1, (timestamp - lastTime) / 1000); lastTime = timestamp; if(!isGameOver) { update(deltaTime); render(); } requestAnimationFrame(gameLoop); }
function gameOver() { if (isGameOver) return; isGameOver = true; isGameRunning = false; console.log("Game Over!"); if (score > highScore) { highScore = score; localStorage.setItem('spaceAvoiderHighScore', highScore); } finalScoreDisplay.textContent = `Your Score: ${score}`; highScoreDisplay.textContent = `High Score: ${highScore}`; gameOverOverlay.style.display = 'flex'; }
function resetGame() { console.log("Resetting game state for start/restart..."); score = 0; lives = 3; projectiles = []; asteroids.clear(); powerUps.clear(); effects = []; isGameOver = false; isPaused = false; shootCooldownTimer = 0; comboCounter = 0; comboTimer = 0; currentLeaderId = null; currentRound = 1; asteroidsDestroyedThisRound = 0; asteroidsNeededForRound = calculateRoundGoal(currentRound); isRoundTransition = false; roundTransitionOverlay.style.display = 'none'; updateRoundUI(); currentWeaponLevel = 1; const baseStats = weaponLevelStats[0]; baseShootCooldown = baseStats.cooldown; projectileDamage = baseStats.damage; player = new Player(canvas.width / 2, canvas.height - (60 * scaleFactor), myPlayerId); player.lives = lives; player.isTakingDamage = false; player.damageFlashTimer = 0; scoreDisplay.textContent = `Score: ${score}`; livesDisplay.textContent = `Lives: ${lives}`; gameOverOverlay.style.display = 'none'; }
function initStars() { stars = []; for (let i = 0; i < starCount; i++) stars.push(new Star()); }
function calculateRoundGoal(round) { const ROUND_BASE_GOAL = 10; const ROUND_GOAL_INCREASE = 5; return ROUND_BASE_GOAL + (round - 1) * ROUND_GOAL_INCREASE; }

startGameButton.addEventListener('click', () => { if (socket && socket.connected) { console.log("Requesting start game..."); socket.emit('requestStartGame'); startGameButton.disabled = true; startGameButton.textContent = "Starting..."; } else { console.error("Cannot start game, not connected to server."); lobbyStatus.textContent = "Error: Not connected to server."; }});
gameContainer.addEventListener('mousemove', (event) => { if (player && !isGameOver && isGameRunning && !isPaused) { const rect = canvas.getBoundingClientRect(); const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height; const mouseX = (event.clientX - rect.left) * scaleX; const mouseY = (event.clientY - rect.top) * scaleY; player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, mouseX)); player.y = Math.max(player.height / 2, Math.min(canvas.height - player.height / 2, mouseY)); }});
gameContainer.addEventListener('mousedown', (event) => { if (event.button === 0) isShooting = true; if (!isGameOver && isGameRunning && !isPaused && player && event.button === 0) player.shoot(); });
gameContainer.addEventListener('mouseup', (event) => { if (event.button === 0) isShooting = false; });
gameContainer.addEventListener('contextmenu', (event) => { event.preventDefault(); });
restartButton.addEventListener('click', () => { console.log("Restart button clicked - going back to lobby"); isGameOver = false; isGameRunning = false; gameOverOverlay.style.display = 'none'; gameContainer.style.display = 'none'; lobbyOverlay.style.display = 'flex'; if (socket && socket.connected) socket.emit('enterLobby'); else { lobbyStatus.textContent = "Disconnected. Please refresh."; startGameButton.disabled = true; }});

function initializeApp() { lobbyOverlay.style.display = 'flex'; gameContainer.style.display = 'none'; gameOverOverlay.style.display = 'none'; roundTransitionOverlay.style.display = 'none'; connectToServer(); console.log("App initialized, lobby screen ready."); }
function initializeGameEntitiesAndLoop() { console.log("Initializing game entities and starting loop..."); initStars(); resetGame(); lastTime = performance.now(); isGameRunning = true; requestAnimationFrame(gameLoop); console.log("Game loop started."); }

initializeApp();