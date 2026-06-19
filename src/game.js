import { CONFIG } from "./config.js";
import { Fish, distance, drawFish } from "./fish.js";
import { InputController } from "./input.js";

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const input = new InputController(canvas);

const ui = {
  overlay: document.querySelector("#overlay"),
  statusText: document.querySelector("#statusText"),
  startButton: document.querySelector("#startButton"),
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
  score: 0,
  eaten: 0,
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

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(CONFIG.world.minWidth, rect.width || window.innerWidth);
  const height = Math.max(CONFIG.world.minHeight, rect.height || window.innerHeight);
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
  state.score = 0;
  state.eaten = 0;
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

function startGame() {
  requestGameFullscreen();
  resetGame();
  state.mode = "playing";
  ui.overlay.classList.add("hidden");
  window.setTimeout(resizeCanvas, 250);
  updateUi();
}

function endGame(mode) {
  state.mode = mode;
  ui.overlay.classList.remove("hidden");
  ui.startButton.classList.add("hidden");
  ui.restartButton.classList.remove("hidden");
  ui.statusText.textContent = mode === "won" ? "长大啦！" : "被大鱼吃掉了";
  updateUi();
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

  updatePlayer(dt);
  updateFishes(dt);
  updateEffects(dt);
  spawnFishIfNeeded();
  handleCollisions();

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

    if (len > 5) {
      player.velocityX = (dx / len) * maxSpeed;
      player.velocityY = (dy / len) * maxSpeed;
    } else {
      player.velocityX *= 0.78;
      player.velocityY *= 0.78;
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
    fish.update(dt);
  }

  state.fishes = state.fishes.filter((fish) => !fish.isOffscreen(state.width));
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
  const kind = chooseFishKind();
  const side = Math.random() < 0.5 ? -1 : 1;
  const direction = side === -1 ? 1 : -1;
  const size = randomFishSize(kind);
  const length = CONFIG.world.fishBaseLength * size;
  const height = CONFIG.world.fishBaseHeight * size;
  const x = side === -1 ? -length : state.width + length;
  const y = randomSpawnY(height, kind);
  const speed = random(76, 136) + Math.min(42, state.elapsed * 1.1) + (kind === "danger" ? 18 : 0);
  const palette = kind === "danger" ? COLORS.danger : COLORS.small;

  return new Fish({
    x,
    y,
    size,
    direction,
    speed,
    kind,
    color: palette[Math.floor(Math.random() * palette.length)],
  });
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

  const dangerChance = isEarly
    ? CONFIG.spawning.dangerChanceEarly
    : CONFIG.spawning.dangerChanceMid;

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
    const hitDistance = player.collisionRadius + fish.collisionRadius;

    if (distance(player, fish) > hitDistance) {
      continue;
    }

    if (fish.size <= player.size * CONFIG.fishSize.smallMax) {
      eatFish(index, fish);
      continue;
    }

    if (fish.size >= player.size * CONFIG.fishSize.dangerMin) {
      endGame("lost");
      return;
    }
  }
}

function eatFish(index, fish) {
  state.fishes.splice(index, 1);
  state.eaten += 1;
  state.score += Math.round(fish.size * 100);
  state.player.size += growthForFish(fish);
  state.player.flash = 1;

  for (let i = 0; i < 7; i += 1) {
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

function growthForFish(fish) {
  const progress = currentGrowthProgress();
  const curve = progress * progress;
  const multiplier = lerp(CONFIG.growth.earlyMultiplier, CONFIG.growth.lateMultiplier, curve);
  const minGrowth = lerp(CONFIG.growth.earlyMinPerFish, CONFIG.growth.lateMinPerFish, curve);
  const maxGrowth = lerp(CONFIG.growth.earlyMaxPerFish, CONFIG.growth.lateMaxPerFish, curve);

  return clamp(fish.size * multiplier, minGrowth, maxGrowth);
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

  if (state.mode === "ready") {
    ui.overlay.classList.remove("hidden");
    ui.startButton.classList.remove("hidden");
    ui.restartButton.classList.add("hidden");
    ui.statusText.textContent = "大鱼吃小鱼";
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

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const y = random(min, max);

    if (Math.abs(y - state.player.y) >= CONFIG.spawning.dangerAvoidPlayerY) {
      return y;
    }
  }

  const topDistance = Math.abs(min - state.player.y);
  const bottomDistance = Math.abs(max - state.player.y);
  return topDistance > bottomDistance ? min : max;
}

function requestGameFullscreen() {
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
