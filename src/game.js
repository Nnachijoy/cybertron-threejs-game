import * as THREE from 'three';
import { getCurrentUser, getGuest, onUserChange, signIn, saveScore, getLeaderboard, START_NG } from './platform.js';

// --- 1. SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.Fog(0x050510, 20, 90);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 3.5, 6);
camera.lookAt(0, 1, -10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- 2. LIGHTING ---
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const playerLight = new THREE.PointLight(0x00ffff, 2, 20);
scene.add(playerLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);

// --- 3. PLAYER ---
const playerGroup = new THREE.Group();

const bodyGeo = new THREE.CapsuleGeometry(0.45, 0.7, 4, 8);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x005555 });
const body = new THREE.Mesh(bodyGeo, bodyMat);
body.castShadow = true;
body.position.y = 1.4;
playerGroup.add(body);

const visorGeo = new THREE.BoxGeometry(0.55, 0.18, 0.1);
const visorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff });
const visor = new THREE.Mesh(visorGeo, visorMat);
visor.position.set(0, 1.95, 0.45);
playerGroup.add(visor);

const legGeo = new THREE.CapsuleGeometry(0.14, 0.5, 4, 8);
const legMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x004444 });
const leftLegPivot = new THREE.Group();
leftLegPivot.position.set(-0.18, 0.85, 0);
const leftLeg = new THREE.Mesh(legGeo, legMat);
leftLeg.position.y = -0.35;
leftLeg.castShadow = true;
leftLegPivot.add(leftLeg);
playerGroup.add(leftLegPivot);

const rightLegPivot = new THREE.Group();
rightLegPivot.position.set(0.18, 0.85, 0);
const rightLeg = new THREE.Mesh(legGeo, legMat);
rightLeg.position.y = -0.35;
rightLeg.castShadow = true;
rightLegPivot.add(rightLeg);
playerGroup.add(rightLegPivot);

const armGeo = new THREE.CapsuleGeometry(0.11, 0.5, 4, 8);
const armMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x004444 });
const leftArmPivot = new THREE.Group();
leftArmPivot.position.set(-0.5, 1.75, 0);
const leftArm = new THREE.Mesh(armGeo, armMat);
leftArm.position.y = -0.3;
leftArm.castShadow = true;
leftArmPivot.add(leftArm);
playerGroup.add(leftArmPivot);

const rightArmPivot = new THREE.Group();
rightArmPivot.position.set(0.5, 1.75, 0);
const rightArm = new THREE.Mesh(armGeo, armMat);
rightArm.position.y = -0.3;
rightArm.castShadow = true;
rightArmPivot.add(rightArm);
playerGroup.add(rightArmPivot);

scene.add(playerGroup);

// --- 4. WORLD ---
const ROAD_WIDTH = 8;
const ROAD_LENGTH = 400;
const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH);
const roadMat = new THREE.MeshStandardMaterial({ color: 0x0a0a1a, roughness: 0.9 });
const road = new THREE.Mesh(roadGeo, roadMat);
road.rotation.x = -Math.PI / 2;
scene.add(road);

const railMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00aaaa });
for (const x of [-ROAD_WIDTH / 2, ROAD_WIDTH / 2]) {
    const railGeo = new THREE.BoxGeometry(0.15, 0.05, ROAD_LENGTH);
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(x, 0.03, 0);
    scene.add(rail);
}

const stripeMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00aaaa });
const stripes = [];
const STRIPE_COUNT = 60;
const STRIPE_SPACING = 4;
for (let i = 0; i < STRIPE_COUNT; i++) {
    const geo = new THREE.BoxGeometry(0.08, 0.02, 1.4);
    const stripe = new THREE.Mesh(geo, stripeMat);
    stripe.position.set(0, 0.02, -i * STRIPE_SPACING);
    scene.add(stripe);
    stripes.push(stripe);
}
const STRIPE_LOOP_LENGTH = STRIPE_COUNT * STRIPE_SPACING;

// --- 5. GAME STATE ---
let gameState = 'menu';
const LANE_X = [-2.5, 0, 2.5];
let currentLane = 1;
let isJumping = false;
let jumpVelocity = 0;
const GRAVITY = 0.02;
const JUMP_FORCE = 0.35;
let targetX = LANE_X[currentLane];

let score = 0;
let coins = 0;
let bestScore = parseInt(localStorage.getItem('bestScore') || '0');

let gameSpeed = 0.25;
let obstacleGap = 25;
let coinGap = 22;
const BASE_SPEED = 0.25;
const MAX_SPEED = 0.65;
const BASE_OBSTACLE_GAP = 25;
const MIN_OBSTACLE_GAP = 10;

let distanceSinceLastSpawn = 0;
let distanceSinceLastCoin = 0;

// --- 6. INPUT ---
function moveLeft() {
    if (currentLane > 0) currentLane--;
    targetX = LANE_X[currentLane];
}
function moveRight() {
    if (currentLane < 2) currentLane++;
    targetX = LANE_X[currentLane];
}
function jump() {
    if (!isJumping) {
        isJumping = true;
        jumpVelocity = JUMP_FORCE;
        playSound(jumpSound);
    }
}

function pauseGame() {
    if (gameState === 'playing') {
        gameState = 'paused';
        musicPlayer.pause();
        updateMusicButtons();
        showPauseOverlay();
    }
}

function resumeGame() {
    if (gameState === 'paused') {
        gameState = 'playing';
        hidePauseOverlay();
        musicPlayer.play().catch(() => {});
        updateMusicButtons();
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (gameState === 'playing') pauseGame();
        else if (gameState === 'paused') resumeGame();
        return;
    }
    if (e.key === 'p' || e.key === 'P') {
        if (gameState === 'playing') pauseGame();
        else if (gameState === 'paused') resumeGame();
        else togglePlayPause();
        return;
    }
    if (gameState !== 'playing') return;
    if (e.key === 'a' || e.key === 'ArrowLeft') moveLeft();
    if (e.key === 'd' || e.key === 'ArrowRight') moveRight();
    if (e.key === 'w' || e.key === 'ArrowUp' || e.key === ' ') jump();
    if (e.key === 'm' || e.key === 'M') toggleMute();
});

// --- 7. TOUCH INPUT ---
let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
const SWIPE_THRESHOLD = 30;
const TAP_TIME = 250;

document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
}, { passive: true });

document.addEventListener('touchend', (e) => {
    if (gameState !== 'playing') return;
    if (e.target.tagName === 'BUTTON' || e.target.closest('#music-panel') || e.target.closest('#pause-btn')) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (absX < SWIPE_THRESHOLD && absY < SWIPE_THRESHOLD && dt < TAP_TIME) { jump(); return; }
    if (absX > absY) {
        if (dx > SWIPE_THRESHOLD) moveRight();
        else if (dx < -SWIPE_THRESHOLD) moveLeft();
    } else {
        if (dy < -SWIPE_THRESHOLD) jump();
    }
}, { passive: true });

// --- 8. SOUND ---
const jumpSound = new Audio('music/jump.mp3');
const coinSound = new Audio('music/coin.mp3');
const crashSound = new Audio('music/crash.mp3');
jumpSound.volume = 0.4;
coinSound.volume = 0.5;
crashSound.volume = 0.6;
jumpSound.preload = 'auto';
coinSound.preload = 'auto';
crashSound.preload = 'auto';

function playSound(sound) {
    try {
        sound.currentTime = 0;
        const p = sound.play();
        if (p && p.catch) p.catch(() => {});
    } catch (err) {}
}

function unlockAudio() {
    [jumpSound, coinSound, crashSound].forEach(s => {
        const oldVol = s.volume;
        s.volume = 0;
        const p = s.play();
        if (p && p.then) {
            p.then(() => {
                s.pause();
                s.currentTime = 0;
                s.volume = oldVol;
            }).catch(() => {
                s.volume = oldVol;
            });
        } else {
            s.volume = oldVol;
        }
    });
    document.removeEventListener('touchstart', unlockAudio);
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
}
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

// --- 9. OBSTACLES & COINS ---
const obstacles = [];
const coinObjects = [];

let lastSpawnLanes = [false, false, false];

function spawnObstacle() {
    const available = [0, 1, 2].filter(i => !lastSpawnLanes[i]);
    if (available.length === 0) return;

    const laneIndex = available[Math.floor(Math.random() * available.length)];
    lastSpawnLanes[laneIndex] = true;
    setTimeout(() => { lastSpawnLanes[laneIndex] = false; }, 500);

    const x = LANE_X[laneIndex];
    const type = Math.random() < 0.7 ? 'wall' : 'barrier';
    let mesh;
    if (type === 'wall') {
        const geo = new THREE.BoxGeometry(1.8, 2.4, 0.6);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x660000 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, 1.2, playerGroup.position.z - 45);
    } else {
        const geo = new THREE.BoxGeometry(1.8, 0.7, 0.6);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff9900, emissive: 0x663300 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, 0.35, playerGroup.position.z - 45);
    }
    mesh.castShadow = true;
    scene.add(mesh);
    obstacles.push({ mesh, type, lane: laneIndex });
}

function spawnCoin() {
    const laneIndex = Math.floor(Math.random() * 3);
    const x = LANE_X[laneIndex];
    const geo = new THREE.TorusGeometry(0.35, 0.12, 8, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xaa7700 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1, playerGroup.position.z - 45);
    mesh.rotation.x = Math.PI / 2;
    scene.add(mesh);
    coinObjects.push({ mesh, lane: laneIndex });
}

// --- 10. START.NG USER INTERFACE ---
const userDisplay = document.getElementById('ui');
const loginBtn = document.getElementById('login-btn');
let hatMesh = null;
let accessoryMesh = null;
let hairMesh = null;
let currentUserName = 'Guest';

// Default guest style so the game always looks nice, even off start.ng.
const DEFAULT_GUEST_STYLE = {
    primaryColor: '#ff6b6b',
    secondaryColor: '#2b2f4a',
    skinColor: '#8d5524',
    hairColor: '#17120f',
    hair: 'short',
    hat: 'tophat',
    accessory: 'glasses'
};

function applyUserStyle(user) {
    const s = (user && user.style) ? user.style : DEFAULT_GUEST_STYLE;

    // Clear old hair
    if (hairMesh) { playerGroup.remove(hairMesh); hairMesh = null; }

    if (s.primaryColor) {
        bodyMat.color.set(s.primaryColor);
        legMat.color.set(s.primaryColor);
        armMat.color.set(s.primaryColor);
        playerLight.color.set(s.primaryColor);
    }
    if (s.secondaryColor) bodyMat.emissive.set(s.secondaryColor);

    // --- HAIR (drawn before hat so hat sits on top) ---
    if (s.hair && s.hair !== 'bald') {
        const hairColor = s.hairColor || '#17120f';
        const hairMat = new THREE.MeshStandardMaterial({ color: hairColor });
        let hairGeo;
        if (s.hair === 'afro') {
            hairGeo = new THREE.SphereGeometry(0.55, 16, 12);
            hairMesh = new THREE.Mesh(hairGeo, hairMat);
            hairMesh.position.y = 2.15;
        } else if (s.hair === 'braids' || s.hair === 'dreads' || s.hair === 'ponytail') {
            hairGeo = new THREE.SphereGeometry(0.52, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65);
            hairMesh = new THREE.Mesh(hairGeo, hairMat);
            hairMesh.position.y = 2.1;
        } else if (s.hair === 'bun') {
            hairGeo = new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
            hairMesh = new THREE.Mesh(hairGeo, hairMat);
            hairMesh.position.y = 2.1;
            const bun = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), hairMat);
            bun.position.set(0, 2.55, -0.15);
            playerGroup.add(bun);
        } else {
            // short (default)
            hairGeo = new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
            hairMesh = new THREE.Mesh(hairGeo, hairMat);
            hairMesh.position.y = 2.15;
        }
        if (hairMesh) playerGroup.add(hairMesh);
    }

    // --- HAT ---
    if (hatMesh) { playerGroup.remove(hatMesh); hatMesh = null; }
    if (s.hat && s.hat !== 'none') {
        let hatGeo;
        const hatMat = new THREE.MeshStandardMaterial({ color: s.primaryColor || 0xffffff });
        if (s.hat === 'cap') {
            hatGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16);
            hatMesh = new THREE.Mesh(hatGeo, hatMat);
            hatMesh.position.set(0, 2.3, 0);
            const brim = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.05, 0.35), hatMat);
            brim.position.set(0, 2.28, 0.3);
            playerGroup.add(brim);
        } else if (s.hat === 'beanie') {
            hatGeo = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
            hatMesh = new THREE.Mesh(hatGeo, hatMat);
            hatMesh.position.y = 2.3;
        } else if (s.hat === 'tophat') {
            hatGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.55, 16);
            hatMesh = new THREE.Mesh(hatGeo, hatMat);
            hatMesh.position.y = 2.6;
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 16), hatMat);
            brim.position.y = 2.3;
            playerGroup.add(brim);
        } else if (s.hat === 'crown') {
            hatGeo = new THREE.CylinderGeometry(0.45, 0.5, 0.2, 16);
            hatMesh = new THREE.Mesh(hatGeo, new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0x332200 }));
            hatMesh.position.y = 2.35;
        } else {
            hatGeo = new THREE.ConeGeometry(0.45, 0.45, 16);
            hatMesh = new THREE.Mesh(hatGeo, hatMat);
            hatMesh.position.y = 2.45;
        }
        if (hatMesh) playerGroup.add(hatMesh);
    }

    // --- ACCESSORY ---
    if (accessoryMesh) { playerGroup.remove(accessoryMesh); accessoryMesh = null; }
    if (s.accessory && s.accessory !== 'none') {
        if (s.accessory === 'glasses') {
            accessoryMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.75, 0.12, 0.12),
                new THREE.MeshStandardMaterial({ color: 0x111111 })
            );
            accessoryMesh.position.set(0, 2.0, 0.45);
        } else if (s.accessory === 'backpack') {
            accessoryMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.55, 0.7, 0.3),
                new THREE.MeshStandardMaterial({ color: s.secondaryColor || 0x333333 })
            );
            accessoryMesh.position.set(0, 1.4, -0.5);
        } else if (s.accessory === 'scarf') {
            accessoryMesh = new THREE.Mesh(
                new THREE.TorusGeometry(0.35, 0.07, 8, 20),
                new THREE.MeshStandardMaterial({ color: s.secondaryColor || 0xff0000 })
            );
            accessoryMesh.position.set(0, 2.15, 0);
            accessoryMesh.rotation.x = Math.PI / 2;
        } else if (s.accessory === 'earrings') {
            const earringMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0x332200 });
            const lEar = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), earringMat);
            lEar.position.set(-0.5, 2.0, 0);
            playerGroup.add(lEar);
            const rEar = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), earringMat);
            rEar.position.set(0.5, 2.0, 0);
            playerGroup.add(rEar);
            accessoryMesh = lEar;
        } else if (s.accessory === 'beard') {
            accessoryMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.4),
                new THREE.MeshStandardMaterial({ color: s.hairColor || '#17120f' })
            );
            accessoryMesh.position.set(0, 1.75, 0.15);
        }
        if (accessoryMesh && s.accessory !== 'earrings') playerGroup.add(accessoryMesh);
    }
}

// Apply the default look immediately so the character is styled from frame one.
applyUserStyle(null);
userDisplay.innerText = 'PILOT: Guest';

onUserChange((user, guest) => {
    if (user) {
        currentUserName = user.name;
        userDisplay.innerText = `PILOT: ${user.name}`;
        if (loginBtn) loginBtn.style.display = 'none';
        applyUserStyle(user);
    } else {
        currentUserName = 'Guest';
        userDisplay.innerText = 'PILOT: Guest';
        if (START_NG && loginBtn) loginBtn.style.display = 'block';
        else if (loginBtn) loginBtn.style.display = 'none';
        applyUserStyle(guest);
    }
    if (menuModal && menuModal.style.display !== 'none') updateMenuUserInfo();
});
if (loginBtn) {
    loginBtn.addEventListener('click', (e) => { e.stopPropagation(); signIn(); });
}

// --- 11. HUD ---
const hud = document.createElement('div');
hud.style.cssText = 'position:absolute;top:15px;right:15px;color:#fff;font-family:monospace;font-size:16px;text-align:right;text-shadow:0 0 8px #00ffff;line-height:1.5;z-index:10;background:rgba(5,5,16,0.55);padding:10px 16px;border:1px solid rgba(0,255,255,0.4);';
document.body.appendChild(hud);
function updateHUD() {
    hud.innerHTML = `SCORE: ${Math.floor(score)}<br>COINS: ${coins}<br>BEST: ${bestScore}`;
}
updateHUD();

// --- 11b. PAUSE BUTTON (below the PILOT text) ---
const pauseBtn = document.createElement('button');
pauseBtn.id = 'pause-btn';
pauseBtn.innerText = '⏸ PAUSE';
pauseBtn.style.cssText = 'position:absolute;top:60px;left:15px;padding:8px 14px;background:rgba(5,5,16,0.7);color:#00ffff;border:1px solid #00ffff;font-family:monospace;font-weight:bold;font-size:12px;cursor:pointer;z-index:15;display:none;letter-spacing:1px;';
document.body.appendChild(pauseBtn);
pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (gameState === 'playing') pauseGame();
    else if (gameState === 'paused') resumeGame();
});

// --- 11c. PAUSE OVERLAY ---
let pauseOverlay = null;

function showPauseOverlay() {
    pauseOverlay = document.createElement('div');
    pauseOverlay.id = 'pause-overlay';
    pauseOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(5,5,16,0.75);display:flex;align-items:center;justify-content:center;z-index:25;backdrop-filter:blur(4px);';
    pauseOverlay.innerHTML = `
        <div style="background:rgba(5,5,16,0.98);border:2px solid #00ffff;box-shadow:0 0 40px rgba(0,255,255,0.5);color:#fff;font-family:monospace;padding:40px 60px;text-align:center;min-width:320px;max-width:90vw;">
            <div style="font-size:38px;color:#00ffff;text-shadow:0 0 15px #00ffff;margin-bottom:10px;">PAUSED</div>
            <div style="font-size:13px;color:#888;margin-bottom:25px;">Take a breath. Hydrate. Stretch.</div>
            <button id="resume-btn" style="display:block;width:100%;padding:14px;background:#ffd700;color:#000;border:none;font-family:monospace;font-weight:bold;font-size:16px;cursor:pointer;letter-spacing:2px;margin-bottom:10px;">▶ RESUME</button>
            <button id="quit-btn" style="display:block;width:100%;padding:10px;background:transparent;color:#ff6b6b;border:1px solid #ff6b6b;font-family:monospace;font-weight:bold;font-size:12px;cursor:pointer;">QUIT TO MENU</button>
        </div>
    `;
    document.body.appendChild(pauseOverlay);

    document.getElementById('resume-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        resumeGame();
    });
    document.getElementById('quit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        hidePauseOverlay();
        resetGame();
    });
}

function hidePauseOverlay() {
    if (pauseOverlay) {
        pauseOverlay.remove();
        pauseOverlay = null;
    }
}

// --- 12. MUSIC ---
const playlist = [
    { name: 'Cyber Track 1', file: 'music/song1.mp3' },
    { name: 'Cyber Track 2', file: 'music/song2.mp3' },
];
let currentSongIndex = 0;
let isMuted = false;

const musicPlayer = document.createElement('audio');
musicPlayer.loop = true;
musicPlayer.volume = 0.5;
musicPlayer.src = playlist[currentSongIndex].file;
document.body.appendChild(musicPlayer);

const musicPanel = document.createElement('div');
musicPanel.id = 'music-panel';
musicPanel.style.cssText = 'position:absolute;bottom:15px;left:15px;display:flex;gap:5px;align-items:center;padding:6px;background:rgba(5,5,16,0.8);border:1px solid #00ffff;box-shadow:0 0 10px rgba(0,255,255,0.3);font-family:monospace;z-index:10;';
document.body.appendChild(musicPanel);
const musicLabel = document.createElement('span');
musicLabel.style.cssText = 'color:#00ffff;font-size:11px;margin-right:6px;';
musicPanel.appendChild(musicLabel);

function makeMusicBtn(text, tooltip) {
    const b = document.createElement('button');
    b.innerText = text;
    b.title = tooltip;
    b.style.cssText = 'padding:5px 8px;background:rgba(0,255,255,0.15);color:#00ffff;border:1px solid #00ffff;cursor:pointer;font-family:monospace;font-weight:bold;font-size:12px;';
    b.addEventListener('click', (e) => e.stopPropagation());
    musicPanel.appendChild(b);
    return b;
}
const prevBtn = makeMusicBtn('⏮', 'Previous song');
const playBtn = makeMusicBtn('⏸', 'Play / Pause');
const nextBtn = makeMusicBtn('⏭', 'Next song');
const muteBtn = makeMusicBtn('🔊', 'Mute / Unmute');

function updateMusicButtons() {
    musicLabel.innerText = playlist[currentSongIndex].name;
    playBtn.innerText = musicPlayer.paused ? '▶' : '⏸';
    muteBtn.innerText = isMuted ? '🔇' : '🔊';
}
updateMusicButtons();

function playSong() {
    musicPlayer.src = playlist[currentSongIndex].file;
    musicPlayer.play().catch(() => {});
    updateMusicButtons();
}
prevBtn.addEventListener('click', () => { currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length; playSong(); });
nextBtn.addEventListener('click', () => { currentSongIndex = (currentSongIndex + 1) % playlist.length; playSong(); });
playBtn.addEventListener('click', () => { musicPlayer.paused ? musicPlayer.play().catch(()=>{}) : musicPlayer.pause(); updateMusicButtons(); });
muteBtn.addEventListener('click', () => { isMuted = !isMuted; musicPlayer.muted = isMuted; updateMusicButtons(); });

function toggleMute() { isMuted = !isMuted; musicPlayer.muted = isMuted; updateMusicButtons(); }
function togglePlayPause() { musicPlayer.paused ? musicPlayer.play().catch(()=>{}) : musicPlayer.pause(); updateMusicButtons(); }

// --- 13. MENU MODAL ---
const menuModal = document.createElement('div');
menuModal.id = 'menu-modal';
menuModal.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(5,5,16,0.95);border:2px solid #00ffff;box-shadow:0 0 40px rgba(0,255,255,0.5);color:#fff;font-family:monospace;padding:30px 40px;text-align:center;z-index:20;min-width:320px;max-width:90vw;';
menuModal.innerHTML = `
    <div style="font-size:38px;letter-spacing:5px;text-shadow:0 0 15px #00ffff;">CYBERTRON</div>
    <div style="font-size:38px;letter-spacing:5px;color:#ff6b6b;text-shadow:0 0 15px #ff0000;">RUNNER</div>
    <div style="font-size:12px;color:#00ffff;margin-top:8px;">DODGE. JUMP. COLLECT.</div>
    <div id="menu-user" style="margin-top:20px;font-size:14px;color:#00ffff;"></div>
    <button id="play-guest" style="display:block;width:100%;margin-top:15px;padding:12px;background:#ffd700;color:#000;border:none;font-family:monospace;font-weight:bold;font-size:14px;cursor:pointer;letter-spacing:2px;">▶ PLAY AS GUEST</button>
    <button id="sign-in-startng" style="display:none;width:100%;margin-top:8px;padding:12px;background:#00ffff;color:#000;border:none;font-family:monospace;font-weight:bold;font-size:14px;cursor:pointer;letter-spacing:2px;">SIGN IN WITH START.NG</button>
    <div style="display:flex;gap:8px;margin-top:15px;">
        <button id="how-to-play-btn" style="flex:1;padding:8px;background:transparent;color:#00ffff;border:1px solid #00ffff;font-family:monospace;font-weight:bold;font-size:11px;cursor:pointer;">HOW TO PLAY</button>
        <button id="leaderboard-btn" style="flex:1;padding:8px;background:transparent;color:#00ffff;border:1px solid #00ffff;font-family:monospace;font-weight:bold;font-size:11px;cursor:pointer;">LEADERBOARD</button>
    </div>
    <div style="font-size:9px;color:#666;margin-top:15px;">Press <b style="color:#00ffff">Esc</b> or <b style="color:#00ffff">P</b> to pause</div>
`;
document.body.appendChild(menuModal);

function updateMenuUserInfo() {
    const el = document.getElementById('menu-user');
    const signInBtn = document.getElementById('sign-in-startng');
    if (!el) return;
    if (currentUserName === 'Guest') {
        el.innerText = 'Not signed in — playing as guest';
        el.style.color = '#ff9900';
        if (signInBtn) signInBtn.style.display = START_NG ? 'block' : 'none';
    } else {
        el.innerText = `Signed in as ${currentUserName}`;
        el.style.color = '#00ffff';
        if (signInBtn) signInBtn.style.display = 'none';
    }
}
updateMenuUserInfo();

document.getElementById('play-guest').addEventListener('click', (e) => { e.stopPropagation(); startGame(); });
document.getElementById('sign-in-startng').addEventListener('click', (e) => { e.stopPropagation(); signIn(); });
document.getElementById('how-to-play-btn').addEventListener('click', (e) => { e.stopPropagation(); showHowToPlay(); });
document.getElementById('leaderboard-btn').addEventListener('click', (e) => { e.stopPropagation(); showLeaderboard(); });

function startGame() {
    if (gameState === 'menu') {
        gameState = 'playing';
        menuModal.style.display = 'none';
        pauseBtn.style.display = 'block';
        musicPlayer.play().catch(() => {});
        updateMusicButtons();
    }
}

// --- 14. HOW TO PLAY ---
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        || ('ontouchstart' in window && window.innerWidth < 1024);
}

function showHowToPlay() {
    const mobile = isMobileDevice();
    const controlsHtml = mobile
        ? `<b style="color:#00ffff;">Swipe LEFT / RIGHT</b> — Change lane<br>
           <b style="color:#00ffff;">Swipe UP</b> or <b style="color:#00ffff;">TAP</b> — Jump<br>
           <b style="color:#00ffff;">Tap the ⏸ button</b> — Pause`
        : `<b style="color:#00ffff;">A / D</b> or <b style="color:#00ffff;">← / →</b> — Change lane<br>
           <b style="color:#00ffff;">W / ↑ / Space</b> — Jump<br>
           <b style="color:#00ffff;">Esc / P</b> — Pause`;

    const modal = document.createElement('div');
    modal.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(5,5,16,0.98);border:2px solid #00ffff;box-shadow:0 0 40px rgba(0,255,255,0.5);color:#fff;font-family:monospace;padding:30px 40px;text-align:left;z-index:30;min-width:320px;max-width:90vw;';
    modal.innerHTML = `
        <div style="font-size:24px;text-align:center;color:#00ffff;margin-bottom:15px;">HOW TO PLAY</div>
        <div style="font-size:13px;line-height:1.7;">
            ${controlsHtml}
            <hr style="border-color:#333;margin:12px 0;">
            <b style="color:#ff3333;">🔴 Red Walls</b> — Switch lanes to dodge<br>
            <b style="color:#ff9900;">🟠 Orange Barriers</b> — Jump over them<br>
            <b style="color:#ffd700;">🟡 Gold Rings</b> — Collect for points
        </div>
        <button id="close-how" style="display:block;width:100%;margin-top:20px;padding:10px;background:#ffd700;color:#000;border:none;font-family:monospace;font-weight:bold;font-size:13px;cursor:pointer;">GOT IT</button>
    `;
    document.body.appendChild(modal);
    document.getElementById('close-how').addEventListener('click', (e) => { e.stopPropagation(); modal.remove(); });
}

// --- 15. LEADERBOARD ---
function showLeaderboard() {
    const lb = JSON.parse(localStorage.getItem('leaderboard') || '[]');
    let listHtml = '';
    if (lb.length === 0) {
        listHtml = '<div style="text-align:center;color:#666;padding:20px;">NO LOCAL SCORES YET. GO SET ONE!</div>';
    } else {
        listHtml = lb.map((entry, i) => `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #222;">
                <span style="color:#00ffff;">#${i + 1} ${entry.name}</span>
                <span>${entry.score} pts · ${entry.coins} coins</span>
            </div>
        `).join('');
    }
    const modal = document.createElement('div');
    modal.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(5,5,16,0.98);border:2px solid #00ffff;box-shadow:0 0 40px rgba(0,255,255,0.5);color:#fff;font-family:monospace;padding:30px 40px;text-align:left;z-index:30;min-width:320px;max-width:90vw;';
    modal.innerHTML = `
        <div style="font-size:24px;text-align:center;color:#00ffff;margin-bottom:15px;">LEADERBOARD</div>
        <div style="font-size:11px;color:#888;text-align:center;margin-bottom:10px;">Your scores on this device</div>
        <div style="font-size:13px;">${listHtml}</div>
        <div id="global-board" style="font-size:13px;margin-top:15px;"></div>
        <button id="close-lb" style="display:block;width:100%;margin-top:20px;padding:10px;background:#ffd700;color:#000;border:none;font-family:monospace;font-weight:bold;font-size:13px;cursor:pointer;">BACK</button>
    `;
    document.body.appendChild(modal);
    document.getElementById('close-lb').addEventListener('click', (e) => { e.stopPropagation(); modal.remove(); });

    getLeaderboard(10).then((reply) => {
        const container = document.getElementById('global-board');
        if (!container) return;
        if (reply && reply.ok && Array.isArray(reply.entries) && reply.entries.length > 0) {
            const rows = reply.entries.map((entry) => {
                const stats = entry.stats || {};
                const scoreVal = stats.score ?? entry.score ?? 0;
                const coinsVal = stats.coins ?? 0;
                return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #222;">
                    <span style="color:#00ffff;">#${entry.rank} ${entry.name}</span>
                    <span>${scoreVal} pts · ${coinsVal} coins</span>
                </div>`;
            }).join('');
            container.innerHTML = `
                <div style="font-size:11px;color:#888;text-align:center;margin-top:10px;margin-bottom:10px;">🌍 Global start.ng leaderboard</div>
                ${rows}
            `;
        } else {
            container.innerHTML = `<div style="font-size:11px;color:#888;text-align:center;margin-top:10px;">Play on start.ng to appear on the global board.</div>`;
        }
    }).catch(() => {});
}

// --- 16. COLLISION & GAME OVER ---
function checkCollisions() {
    const pz = playerGroup.position.z;
    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        const dz = Math.abs(obs.mesh.position.z - pz);
        if (dz < 1.0) {
            if (currentLane === obs.lane) {
                if (obs.type === 'wall') { gameOver(); return; }
                if (obs.type === 'barrier' && playerGroup.position.y < 1.0) { gameOver(); return; }
            }
        }
    }
    for (let i = coinObjects.length - 1; i >= 0; i--) {
        const c = coinObjects[i];
        const dz = Math.abs(c.mesh.position.z - pz);
        if (dz < 1.0 && currentLane === c.lane) {
            scene.remove(c.mesh);
            coinObjects.splice(i, 1);
            coins++;
            updateHUD();
            playSound(coinSound);
        }
    }
}

function saveToLeaderboard(name, score, coins) {
    const lb = JSON.parse(localStorage.getItem('leaderboard') || '[]');
    lb.push({ name, score: Math.floor(score), coins });
    lb.sort((a, b) => b.score - a.score);
    lb.splice(5);
    localStorage.setItem('leaderboard', JSON.stringify(lb));
}

function gameOver() {
    gameState = 'gameover';
    pauseBtn.style.display = 'none';
    musicPlayer.pause();
    updateMusicButtons();
    playSound(crashSound);

    if (score > bestScore) {
        bestScore = Math.floor(score);
        localStorage.setItem('bestScore', bestScore.toString());
    }
    updateHUD();
    saveToLeaderboard(currentUserName, score, coins);

    saveScore({ score: Math.floor(score), coins: coins }).then((result) => {
        console.log('start.ng score save:', result);
    }).catch(() => {});

    setTimeout(() => {
        const overDiv = document.createElement('div');
        overDiv.id = 'game-over';
        overDiv.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(5,5,16,0.95);border:2px solid #ff3333;box-shadow:0 0 40px rgba(255,0,0,0.5);color:#fff;font-family:monospace;padding:30px 40px;text-align:center;z-index:30;min-width:320px;max-width:90vw;';
        overDiv.innerHTML = `
            <div style="font-size:30px;color:#ff3333;text-shadow:0 0 15px #ff0000;">GAME OVER</div>
            <div style="font-size:16px;margin-top:15px;">Score: <b style="color:#ffd700;">${Math.floor(score)}</b></div>
            <div style="font-size:16px;">Coins: <b style="color:#ffd700;">${coins}</b></div>
            <div style="font-size:12px;color:#00ffff;margin-top:15px;">Best: ${bestScore}</div>
            <button id="restart-btn" style="display:block;width:100%;margin-top:20px;padding:12px;background:#ffd700;color:#000;border:none;font-family:monospace;font-weight:bold;font-size:14px;cursor:pointer;letter-spacing:2px;">PLAY AGAIN</button>
            <button id="menu-btn" style="display:block;width:100%;margin-top:8px;padding:8px;background:transparent;color:#00ffff;border:1px solid #00ffff;font-family:monospace;font-weight:bold;font-size:11px;cursor:pointer;">MAIN MENU</button>
        `;
        document.body.appendChild(overDiv);

        document.getElementById('restart-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            overDiv.remove();
            resetGame();
            startGame();
        });
        document.getElementById('menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            overDiv.remove();
            resetGame();
        });
    }, 700);
}

function resetGame() {
    obstacles.forEach(o => scene.remove(o.mesh));
    obstacles.length = 0;
    coinObjects.forEach(c => scene.remove(c.mesh));
    coinObjects.length = 0;

    playerGroup.position.set(0, 0, 0);
    currentLane = 1;
    targetX = LANE_X[1];
    isJumping = false;
    jumpVelocity = 0;

    road.position.z = playerGroup.position.z;
    for (let i = 0; i < stripes.length; i++) {
        stripes[i].position.z = playerGroup.position.z - i * STRIPE_SPACING;
    }

    score = 0;
    coins = 0;
    gameSpeed = BASE_SPEED;
    obstacleGap = BASE_OBSTACLE_GAP;
    coinGap = 22;
    distanceSinceLastSpawn = 0;
    distanceSinceLastCoin = 0;
    lastSpawnLanes = [false, false, false];

    updateHUD();
    gameState = 'menu';
    menuModal.style.display = 'block';
    pauseBtn.style.display = 'none';
    hidePauseOverlay();
    updateMenuUserInfo();
}

// --- 17. ANIMATION LOOP ---
let runTime = 0;
function animate() {
    requestAnimationFrame(animate);

    if (gameState === 'playing') {
        playerGroup.position.z -= gameSpeed;
        playerGroup.position.x += (targetX - playerGroup.position.x) * 0.2;

        if (isJumping) {
            playerGroup.position.y += jumpVelocity;
            jumpVelocity -= GRAVITY;
            if (playerGroup.position.y <= 0) {
                playerGroup.position.y = 0;
                isJumping = false;
                jumpVelocity = 0;
            }
            leftLegPivot.rotation.x = -0.6;
            rightLegPivot.rotation.x = -0.6;
            leftArmPivot.rotation.x = 0.8;
            rightArmPivot.rotation.x = 0.8;
        } else {
            runTime += 0.35;
            const swing = Math.sin(runTime) * 0.9;
            leftLegPivot.rotation.x = swing;
            rightLegPivot.rotation.x = -swing;
            leftArmPivot.rotation.x = -swing;
            rightArmPivot.rotation.x = swing;
            playerGroup.position.y = Math.abs(Math.sin(runTime * 0.5)) * 0.05;
        }

        score += gameSpeed;

        gameSpeed = Math.min(MAX_SPEED, BASE_SPEED + score * 0.0003);
        obstacleGap = Math.max(MIN_OBSTACLE_GAP, BASE_OBSTACLE_GAP - score * 0.012);
        coinGap = Math.max(15, 22 - score * 0.005);

        updateHUD();

        road.position.z = playerGroup.position.z - ROAD_LENGTH / 2 + 50;

        for (const stripe of stripes) {
            if (stripe.position.z > playerGroup.position.z + 5) {
                stripe.position.z -= STRIPE_LOOP_LENGTH;
            }
        }

        distanceSinceLastSpawn += gameSpeed;
        distanceSinceLastCoin += gameSpeed;
        if (distanceSinceLastSpawn > obstacleGap) { spawnObstacle(); distanceSinceLastSpawn = 0; }
        if (distanceSinceLastCoin > coinGap) { spawnCoin(); distanceSinceLastCoin = 0; }

        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obs = obstacles[i];
            if (obs.mesh.position.z > playerGroup.position.z + 15) {
                scene.remove(obs.mesh);
                obstacles.splice(i, 1);
            }
        }
        for (let i = coinObjects.length - 1; i >= 0; i--) {
            const c = coinObjects[i];
            c.mesh.rotation.z += 0.1;
            if (c.mesh.position.z > playerGroup.position.z + 15) {
                scene.remove(c.mesh);
                coinObjects.splice(i, 1);
            }
        }

        checkCollisions();
    }

    playerLight.position.copy(playerGroup.position);
    playerLight.position.y += 2;

    camera.position.x = playerGroup.position.x * 0.4;
    camera.position.y = 3.5 + playerGroup.position.y * 0.3;
    camera.position.z = playerGroup.position.z + 6;
    camera.lookAt(playerGroup.position.x * 0.4, 1.5, playerGroup.position.z - 15);

    renderer.render(scene, camera);
}
animate();