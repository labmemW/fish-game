import { CONFIG } from "./config.js";

export class Fish {
  constructor({ x, y, size, direction = 1, speed = 0, kind = "small", color = "#f6c85f" }) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.direction = direction;
    this.speed = speed;
    this.kind = kind;
    this.color = color;
    this.baseVelocityX = direction * speed;
    this.baseVelocityY = 0;
    this.velocityX = direction * speed;
    this.velocityY = 0;
    this.flash = 0;
  }

  get length() {
    return CONFIG.world.fishBaseLength * this.size;
  }

  get height() {
    return CONFIG.world.fishBaseHeight * this.size;
  }

  get collisionRadiusX() {
    return this.length * CONFIG.collision.radiusXByLength;
  }

  get collisionRadiusY() {
    return this.height * CONFIG.collision.radiusYByHeight;
  }

  update(dt) {
    this.x += this.velocityX * dt;
    this.y += this.velocityY * dt;
    this.flash = Math.max(0, this.flash - dt * 6);

    if (Math.abs(this.velocityX) > 1) {
      this.direction = Math.sign(this.velocityX);
    }
  }

  isOffscreen(width) {
    const margin = this.length + CONFIG.spawning.sidePadding;
    return this.x < -margin || this.x > width + margin;
  }
}

export function drawFish(ctx, fish, options = {}) {
  const length = fish.length;
  const height = fish.height;
  const dir = fish.direction || 1;
  const eyeSize = Math.max(2.4, height * 0.12);
  const tailWidth = length * 0.28;
  const bodyLength = length * 0.78;
  const noseX = bodyLength * 0.38;
  const tailX = -bodyLength * 0.38;
  const pulse = options.pulse ?? 1;

  ctx.save();
  ctx.translate(fish.x, fish.y);
  ctx.scale(dir * pulse, pulse);

  ctx.fillStyle = fish.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyLength * 0.5, height * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shade(fish.color, -18);
  ctx.beginPath();
  ctx.moveTo(tailX, 0);
  ctx.lineTo(tailX - tailWidth, -height * 0.42);
  ctx.lineTo(tailX - tailWidth, height * 0.42);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.beginPath();
  ctx.ellipse(-bodyLength * 0.04, height * 0.08, bodyLength * 0.28, height * 0.22, 0, 0, Math.PI);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(noseX, -height * 0.14, eyeSize, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#10364a";
  ctx.beginPath();
  ctx.arc(noseX + eyeSize * 0.25, -height * 0.14, eyeSize * 0.48, 0, Math.PI * 2);
  ctx.fill();

  if (fish.kind === "danger") {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
    ctx.lineWidth = Math.max(1, height * 0.05);
    ctx.beginPath();
    ctx.moveTo(length * 0.16, -height * 0.22);
    ctx.lineTo(length * 0.02, height * 0.22);
    ctx.stroke();
  }

  if (fish.flash > 0) {
    ctx.globalAlpha = Math.min(0.5, fish.flash);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyLength * 0.54, height * 0.54, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function shade(hex, amount) {
  const value = hex.replace("#", "");
  const num = parseInt(value, 16);
  const r = clampColor((num >> 16) + amount);
  const g = clampColor(((num >> 8) & 0xff) + amount);
  const b = clampColor((num & 0xff) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function clampColor(value) {
  return Math.max(0, Math.min(255, value));
}
