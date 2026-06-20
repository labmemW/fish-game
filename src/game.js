import { CONFIG } from "./config.js";
import { AudioSystem } from "./audio.js";
import { Fish, drawFish } from "./fish.js";
import { InputController } from "./input.js";

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const input = new InputController(canvas);
const audio = new AudioSystem(CONFIG.audio);

const ui = {
  overlay: document.querySelector("#overlay"),
  statusText: document.querySelector("#statusText"),
  startButton: document.querySelector("#startButton"),
  pauseButton: document.querySelector("#pauseButton"),
  soundButton: document.querySelector("#soundButton"),
  resumeButton: document.querySelector("#resumeButton"),
  restartButton: document.querySelector("#restartButton"),
  fishCount: document.querySelector("#fishCount"),
  score: document.querySelector("#score"),
  timer: document.querySelector("#timer"),
};

const COLORS = {
  player: "#ffcf56",
  small: ["#ff8f70", "#7de0a6", "#f6d365", "#8fd6ff"],
  danger: ["#ef5b5b", "#b55bd8", "#f26d8f"],
};

const state = {
  mode: "ready",
  width: 0,
  height: 0,
  lastTime: 0,
  elapsed: 0,
  spawnTimer: 0,
  timeSinceEat: 0,
  comboEatTimes: [],
  growthBoostUntil: 0,
  growthBoostEatsRemaining: 0,
  score: 0,
  eaten: 0,
  dangerSpawned: 0,
  player: null,
  fishes: [],
  effects: [],
};

resizeCanvas();
resetGame();
updateUi();
requestAnimationFrame(loop);

window.addEventListener("resize", resizeCanvas);
ui.startButton.addEventListener("click", startGame);
ui.restartButton.addEventListener("click", startGame);
ui.pauseButton.addEventListener("click", pauseGame);
ui.resumeButton.addEventListener("click", resumeGame);
ui.soundButton.addEventListener("click", toggleSound);

function resizeCanvas() {
  const width = Math.max(CONFIG.world.minWidth, canvas.clientWidth || window.innerWidth);
  const height = Math.max(CONFIG.world.minHeight, canvas.clientHeight || window.innerHeight);
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

  canvas.logicalWidth = width;
  canvas.logicalHeight = height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  state.width = width;
  state.height = height;

  if (state.player) {
    clampPlayer();
  }
}

function resetGame() {
  state.elapsed = 0;
  state.spawnTimer = 0;
  state.timeSinceEat = 0;
  state.comboEatTimes = [];
  state.growthBoostUntil = 0;
  state.growthBoostEatsRemaining = 0;
  state.score = 0;
  state.eaten = 0;
  state.dangerSpawned = 0;
  state.fishes = [];
  state.effects = [];
  state.player = new Fish({
    x: state.width * CONFIG.player.startXRatio,
    y: state.height * CONFIG.player.startYRatio,
    size: CONFIG.player.initialSize,
    direction: 1,
    speed: 0,
    kind: "player",
    color: COLORS.player,
  });
}

async function startGame() {
  await audio.resume().catch(() => {});
  audio.playStart();
  audio.startMusic();
  requestGameFullscreen();
  resetGame();
  state.mode = "playing";
  ui.overlay.classList.add("hidden");
  ui.pauseButton.classList.remove("hidden");
  window.setTimeout(resizeCanvas, 250);
  updateUi();
}

function pauseGame() {
  if (state.mode !== "playing") {
    return;
  }

  state.mode = "paused";
  audio.playPause();
  audio.stopMusic();
  ui.overlay.classList.remove("hidden");
  updateUi();
}

function resumeGame() {
  if (state.mode !== "paused") {
    return;
  }

  state.mode = "playing";
  audio.playResume();
  audio.startMusic();
  ui.overlay.classList.add("hidden");
  ui.pauseButton.classList.remove("hidden");
  updateUi();
}

function endGame(mode) {
  state.mode = mode;
  audio.stopMusic();
  if (mode === "won") {
    audio.playWin();
  } else {
    audio.playLose();
  }
  ui.overlay.classList.remove("hidden");
  updateUi();
}

function toggleSound() {
  const muted = audio.toggleMuted();
  ui.soundButton.textContent = muted ? "×" : "♪";
  ui.soundButton.setAttribute("aria-label", muted ? "打开声音" : "关闭声音");

  if (!muted && state.mode === "playing") {
    audio.startMusic();
  }
}

function loop(time) {
  const dt = Math.min(0.033, (time - state.lastTime) / 1000 || 0);
  state.lastTime = time;

  if (state.mode === "playing") {
    update(dt);
  }

  draw();
  requestAnimationFrame(loop);
}

function update(dt) {
  state.elapsed += dt;
  state.spawnTimer += dt;
  state.timeSinceEat += dt;

  updatePlayerComboColor();
  updatePlayer(dt);
  updateFishes(dt);
  updateEffects(dt);
  spawnFishIfNeeded();
  handleCollisions();
  applyHungerDecay(dt);

  if (state.player.size >= currentTargetSize()) {
    endGame("won");
  }

  updateUi();
}

function updatePlayer(dt) {
  const player = state.player;
  const maxSpeed = currentPlayerSpeed();

  if (input.active && input.position) {
    const dx = input.position.x - player.x;
    const dy = input.position.y - player.y;
    const len = Math.hypot(dx, dy);

    if (len > CONFIG.player.stopRadius) {
      const speedScale = Math.min(
        1,
        (len - CONFIG.player.stopRadius) /
          (CONFIG.player.slowRadius - CONFIG.player.stopRadius),
      );
      const targetSpeed = maxSpeed * speedScale;

      player.velocityX = (dx / len) * targetSpeed;
      player.velocityY = (dy / len) * targetSpeed;
    } else {
      player.velocityX *= 0.62;
      player.velocityY *= 0.62;
    }
  } else {
    const slow = Math.pow(0.08, dt);
    player.velocityX *= slow;
    player.velocityY *= slow;
  }

  player.update(dt);
  clampPlayer();
}

function currentPlayerSpeed() {
  const loss = (state.player.size - CONFIG.player.initialSize) * CONFIG.player.speedLossPerSize;
  return Math.max(CONFIG.player.minSpeed, CONFIG.player.initialSpeed - loss);
}

function currentTargetSize() {
  const targetByWidth =
    (state.width * CONFIG.player.targetLengthRatio) / CONFIG.world.fishBaseLength;

  return Math.max(targetByWidth, CONFIG.player.minTargetSize);
}

function currentGrowthProgress() {
  const targetSize = currentTargetSize();
  const range = targetSize - CONFIG.player.initialSize;

  if (range <= 0) {
    return 1;
  }

  return clamp((state.player.size - CONFIG.player.initialSize) / range, 0, 1);
}

function clampPlayer() {
  const player = state.player;
  const marginX = player.length * 0.45;
  const marginY = player.height * 0.55;

  player.x = clamp(player.x, marginX, state.width - marginX);
  player.y = clamp(player.y, marginY, state.height - marginY);
}

function updateFishes(dt) {
  for (const fish of state.fishes) {
    updateSmallFishBehavior(fish);
    fish.update(dt);

    if (fish.kind !== "small") {
      clampFishVerticalPosition(fish);
    }
  }

  state.fishes = state.fishes.filter((fish) => !fish.isOffscreen(state.width));
}

function updateSmallFishBehavior(fish) {
  if (fish.kind !== "small") {
    return;
  }

  const dx = fish.x - state.player.x;
  const dy = fish.y - state.player.y;
  const distanceToPlayer = Math.hypot(dx, dy);
  const fleeRange =
    CONFIG.smallFishBehavior.fleeBaseRange +
    state.player.size * CONFIG.smallFishBehavior.fleeRangeByPlayerSize;

  if (distanceToPlayer > 0 && distanceToPlayer < fleeRange) {
    const sizeGap = Math.max(0, state.player.size - fish.size);
    const fleeSpeed = Math.min(
      CONFIG.smallFishBehavior.fleeMaxBonusSpeed,
      CONFIG.smallFishBehavior.fleeBaseSpeed +
        sizeGap * CONFIG.smallFishBehavior.fleeSpeedBySizeGap,
    );
    const strength = 1 - distanceToPlayer / fleeRange;
    const targetVelocityX = fish.baseVelocityX + (dx / distanceToPlayer) * fleeSpeed * strength;
    const targetVelocityY = fish.baseVelocityY + (dy / distanceToPlayer) * fleeSpeed * strength;

    fish.velocityX = lerp(fish.velocityX, targetVelocityX, CONFIG.smallFishBehavior.fleeSteering);
    fish.velocityY = lerp(fish.velocityY, targetVelocityY, CONFIG.smallFishBehavior.fleeSteering);
    return;
  }

  fish.velocityX = lerp(fish.velocityX, fish.baseVelocityX, CONFIG.smallFishBehavior.returnSteering);
  fish.velocityY = lerp(fish.velocityY, fish.baseVelocityY, CONFIG.smallFishBehavior.returnSteering);
}

function clampFishVerticalPosition(fish) {
  const margin = Math.max(12, fish.height * 0.5);

  if (fish.y < margin) {
    fish.y = margin;
    fish.velocityY = Math.abs(fish.velocityY) * 0.45;
  }

  if (fish.y > state.height - margin) {
    fish.y = state.height - margin;
    fish.velocityY = -Math.abs(fish.velocityY) * 0.45;
  }
}

function updateEffects(dt) {
  for (const effect of state.effects) {
    effect.age += dt;
    effect.y -= effect.speed * dt;
  }

  state.effects = state.effects.filter((effect) => effect.age < effect.life);
}

function spawnFishIfNeeded() {
  if (state.fishes.length >= CONFIG.spawning.maxFish || state.spawnTimer < CONFIG.spawning.interval) {
    return;
  }

  state.spawnTimer = 0;
  state.fishes.push(createFish());
}

function createFish() {
  let kind = chooseFishKind();
  const side = Math.random() < 0.5 ? -1 : 1;
  const direction = side === -1 ? 1 : -1;
  let size = randomFishSize(kind);
  let length = CONFIG.world.fishBaseLength * size;
  let height = CONFIG.world.fishBaseHeight * size;
  let y = randomSpawnY(height, kind);

  if (kind === "danger" && y === null) {
    kind = "small";
    size = randomFishSize(kind);
    length = CONFIG.world.fishBaseLength * size;
    height = CONFIG.world.fishBaseHeight * size;
    y = randomSpawnY(height, kind);
  }

  const x = side === -1 ? -length : state.width + length;
  const speed = randomFishSpeed(kind);
  const verticalSpeed = randomFishVerticalSpeed(kind);
  const fast = kind === "danger" && shouldSpawnFastDanger();
  const finalSpeed = fast ? speed * CONFIG.fishSpeed.fastDangerMultiplier : speed;

  if (kind === "danger") {
    state.dangerSpawned += 1;
  }

  const palette = kind === "danger" ? COLORS.danger : COLORS.small;

  return new Fish({
    x,
    y,
    size,
    direction,
    speed: finalSpeed,
    verticalSpeed,
    kind,
    fast,
    color: palette[Math.floor(Math.random() * palette.length)],
  });
}

function randomFishSpeed(kind) {
  const elapsedBonus = Math.min(
    CONFIG.fishSpeed.elapsedBonusMax,
    state.elapsed * CONFIG.fishSpeed.elapsedBonusPerSecond,
  );

  if (kind === "danger") {
    return random(CONFIG.fishSpeed.dangerMin, CONFIG.fishSpeed.dangerMax) + elapsedBonus;
  }

  return random(CONFIG.fishSpeed.smallMin, CONFIG.fishSpeed.smallMax) + elapsedBonus * 0.5;
}

function randomFishVerticalSpeed(kind) {
  if (kind !== "small") {
    return 0;
  }

  return random(-CONFIG.fishSpeed.smallVerticalDriftMax, CONFIG.fishSpeed.smallVerticalDriftMax);
}

function shouldSpawnFastDanger() {
  return (state.dangerSpawned + 1) % CONFIG.fishSpeed.fastDangerEvery === 0;
}

function chooseFishKind() {
  const canSpawnDanger = state.elapsed >= CONFIG.spawning.dangerDelay;
  const dangerCount = state.fishes.filter((fish) => fish.kind === "danger").length;
  const progress = currentGrowthProgress();

  if (!canSpawnDanger || progress >= CONFIG.spawning.dangerStopProgress) {
    return "small";
  }

  const isEarly = progress < CONFIG.spawning.dangerEarlyProgress;
  const dangerLimit = isEarly
    ? CONFIG.spawning.maxDangerFishEarly
    : CONFIG.spawning.maxDangerFishMid;

  if (dangerCount >= dangerLimit) {
    return "small";
  }

  let dangerChance = isEarly
    ? CONFIG.spawning.dangerChanceEarly
    : CONFIG.spawning.dangerChanceMid;

  if (isGrowthBoostActive()) {
    dangerChance = Math.min(
      CONFIG.combo.dangerChanceMax,
      dangerChance + CONFIG.combo.dangerChanceBonus,
    );
  }

  return Math.random() < dangerChance ? "danger" : "small";
}

function randomFishSize(kind) {
  const playerSize = state.player.size;

  if (kind === "danger") {
    return playerSize * random(CONFIG.fishSize.dangerMin, CONFIG.fishSize.dangerMax);
  }

  return playerSize * random(CONFIG.fishSize.smallMin, CONFIG.fishSize.smallMax);
}

function handleCollisions() {
  const player = state.player;

  for (let index = state.fishes.length - 1; index >= 0; index -= 1) {
    const fish = state.fishes[index];

    if (!ellipseCollision(player, fish)) {
      continue;
    }

    if (fish.size <= player.size * CONFIG.fishSize.smallMax) {
      eatFish(index, fish);
      continue;
    }

    if (fish.size >= player.size * CONFIG.fishSize.dangerMin) {
      if (isGrowthBoostActive()) {
        eatFish(index, fish, { comboDanger: true });
        continue;
      }

      endGame("lost");
      return;
    }
  }
}

function ellipseCollision(a, b) {
  const radiusX = a.collisionRadiusX + b.collisionRadiusX;
  const radiusY = a.collisionRadiusY + b.collisionRadiusY;
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  if (radiusX <= 0 || radiusY <= 0) {
    return false;
  }

  return (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY) <= 1;
}

function eatFish(index, fish, options = {}) {
  state.fishes.splice(index, 1);
  state.timeSinceEat = 0;
  const boosted = isGrowthBoostActive();
  const growthMultiplier = growthMultiplierForFish(fish, options, boosted);

  if (boosted) {
    consumeGrowthBoost();
  } else {
    registerComboEat();
  }

  state.eaten += 1;
  state.score += Math.round(fish.size * 100);
  state.player.size += growthForFish(fish) * growthMultiplier;
  state.player.flash = 1;
  updatePlayerComboColor();
  audio.playEat(fish.size);

  const bubbleCount = growthMultiplier > 1 || options.comboDanger ? 12 : 7;

  for (let i = 0; i < bubbleCount; i += 1) {
    state.effects.push({
      x: fish.x + random(-fish.length * 0.18, fish.length * 0.18),
      y: fish.y + random(-fish.height * 0.25, fish.height * 0.25),
      r: random(2, 6),
      age: 0,
      life: random(0.45, 0.8),
      speed: random(18, 48),
    });
  }
}

function registerComboEat() {
  const cutoff = state.elapsed - CONFIG.combo.windowSeconds;
  state.comboEatTimes = state.comboEatTimes.filter((time) => time >= cutoff);
  state.comboEatTimes.push(state.elapsed);

  if (state.comboEatTimes.length < CONFIG.combo.triggerEats) {
    return;
  }

  state.growthBoostUntil = state.elapsed + CONFIG.combo.boostDuration;
  state.growthBoostEatsRemaining = CONFIG.combo.boostEats;
  state.comboEatTimes = [];
}

function growthMultiplierForFish(fish, options, boosted) {
  if (!boosted) {
    return 1;
  }

  if (options.comboDanger || fish.kind === "danger") {
    return CONFIG.combo.dangerGrowthMultiplier;
  }

  return CONFIG.combo.growthMultiplier;
}

function consumeGrowthBoost() {
  state.growthBoostEatsRemaining = 0;
  state.growthBoostUntil = 0;
  state.comboEatTimes = [];
}

function isGrowthBoostActive() {
  return state.growthBoostEatsRemaining > 0 && state.elapsed <= state.growthBoostUntil;
}

function updatePlayerComboColor() {
  if (!isGrowthBoostActive()) {
    state.player.color = COLORS.player;
    return;
  }

  const remaining = state.growthBoostUntil - state.elapsed;

  if (remaining <= CONFIG.combo.warningSeconds) {
    const blinkPhase = Math.floor(state.elapsed * CONFIG.combo.warningFlashHz * 2);
    state.player.color = blinkPhase % 2 === 0 ? CONFIG.combo.boostColor : COLORS.player;
    return;
  }

  state.player.color = CONFIG.combo.boostColor;
}

function applyHungerDecay(dt) {
  if (
    state.timeSinceEat <= CONFIG.hunger.idleDelay ||
    currentGrowthProgress() >= CONFIG.spawning.dangerStopProgress ||
    state.player.size <= CONFIG.player.initialSize
  ) {
    return;
  }

  state.player.size = Math.max(
    CONFIG.player.initialSize,
    state.player.size - CONFIG.hunger.decayPerSecond * dt,
  );
}

function growthForFish(fish) {
  const progress = currentGrowthProgress();
  const curve = progress * progress;
  const multiplier = lerp(CONFIG.growth.earlyMultiplier, CONFIG.growth.lateMultiplier, curve);
  const minGrowth = lerp(CONFIG.growth.earlyMinPerFish, CONFIG.growth.lateMinPerFish, curve);
  const maxGrowth = lerp(CONFIG.growth.earlyMaxPerFish, CONFIG.growth.lateMaxPerFish, curve);
  const baseGrowth = clamp(fish.size * multiplier, minGrowth, maxGrowth);
  const postDangerProgress = clamp(
    (progress - CONFIG.spawning.dangerStopProgress) /
      (1 - CONFIG.spawning.dangerStopProgress),
    0,
    1,
  );
  const postDangerBoost = lerp(1, CONFIG.growth.postDangerMaxBoost, postDangerProgress);

  return baseGrowth * postDangerBoost;
}

function draw() {
  drawBackground();

  for (const fish of state.fishes) {
    drawFish(ctx, fish);
  }

  const pulse = state.player.flash > 0 ? 1 + state.player.flash * 0.04 : 1;
  drawFish(ctx, state.player, { pulse });
  drawEffects();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
  gradient.addColorStop(0, "#6bd3ef");
  gradient.addColorStop(0.52, "#1c93be");
  gradient.addColorStop(1, "#0b5d8e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 197 + state.elapsed * 18) % (state.width + 80)) - 40;
    const y = 28 + ((i * 61) % Math.max(1, state.height - 56));
    ctx.beginPath();
    ctx.arc(x, y, 1.8 + (i % 4), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255, 213, 114, 0.35)";
  ctx.fillRect(0, state.height - 12, state.width, 12);
}

function drawEffects() {
  for (const effect of state.effects) {
    const t = effect.age / effect.life;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = "#e8fbff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.r * (1 + t * 0.8), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function updateUi() {
  ui.fishCount.textContent = String(state.eaten);
  ui.score.textContent = String(state.score);
  ui.timer.textContent = `${Math.floor(state.elapsed)}s`;
  ui.startButton.classList.add("hidden");
  ui.resumeButton.classList.add("hidden");
  ui.restartButton.classList.add("hidden");
  ui.pauseButton.classList.toggle("hidden", state.mode !== "playing");

  if (state.mode === "ready") {
    ui.overlay.classList.remove("hidden");
    ui.startButton.classList.remove("hidden");
    ui.statusText.textContent = "大鱼吃小鱼";
    return;
  }

  if (state.mode === "paused") {
    ui.overlay.classList.remove("hidden");
    ui.resumeButton.classList.remove("hidden");
    ui.restartButton.classList.remove("hidden");
    ui.statusText.textContent = "暂停中";
    return;
  }

  if (state.mode === "won" || state.mode === "lost") {
    ui.overlay.classList.remove("hidden");
    ui.restartButton.classList.remove("hidden");
    ui.statusText.textContent = state.mode === "won" ? "长大啦！" : "被大鱼吃掉了";
  }
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function randomSpawnY(fishHeight, kind) {
  const margin = Math.max(24, fishHeight * 0.7);
  const min = margin;
  const max = Math.max(margin, state.height - margin);

  if (kind !== "danger" || !state.player) {
    return random(min, max);
  }

  for (let attempt = 0; attempt < CONFIG.spawning.dangerSpawnAttempts; attempt += 1) {
    const y = random(min, max);

    if (
      Math.abs(y - state.player.y) >= CONFIG.spawning.dangerAvoidPlayerY &&
      leavesSafeVerticalPassage(y, fishHeight)
    ) {
      return y;
    }
  }

  return null;
}

function leavesSafeVerticalPassage(candidateY, candidateHeight) {
  const requiredGap = state.player.height * CONFIG.spawning.dangerPassageByPlayerHeight;
  const intervals = state.fishes
    .filter((fish) => fish.kind === "danger")
    .map((fish) => dangerVerticalBand(fish.y, fish.height));

  intervals.push(dangerVerticalBand(candidateY, candidateHeight));
  intervals.sort((a, b) => a.start - b.start);

  let cursor = 0;

  for (const interval of intervals) {
    if (interval.start - cursor >= requiredGap) {
      return true;
    }

    cursor = Math.max(cursor, interval.end);
  }

  return state.height - cursor >= requiredGap;
}

function dangerVerticalBand(y, height) {
  const halfHeight = height * 0.55;

  return {
    start: clamp(y - halfHeight, 0, state.height),
    end: clamp(y + halfHeight, 0, state.height),
  };
}

function requestGameFullscreen() {
  if (isPseudoLandscapeMode()) {
    return;
  }

  const shell = document.querySelector(".game-shell");
  const requestFullscreen =
    shell.requestFullscreen ||
    shell.webkitRequestFullscreen ||
    shell.msRequestFullscreen;

  if (!requestFullscreen || document.fullscreenElement || document.webkitFullscreenElement) {
    return;
  }

  const result = requestFullscreen.call(shell);

  if (result && typeof result.catch === "function") {
    result.catch(() => {});
  }
}

function isPseudoLandscapeMode() {
  return window.matchMedia("(orientation: portrait) and (max-width: 700px)").matches;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
