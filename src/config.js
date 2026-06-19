export const CONFIG = {
  player: {
    initialSize: 1,
    initialSpeed: 260,
    minSpeed: 210,
    speedLossPerSize: 25,
    startXRatio: 0.28,
    startYRatio: 0.5,
    targetLengthRatio: 0.32,
    minTargetSize: 4.2,
    maxTargetSize: 6.2,
  },
  spawning: {
    maxFish: 10,
    interval: 0.9,
    dangerDelay: 10,
    smallChanceAfterDelay: 0.75,
    maxDangerFish: 1,
    dangerAvoidPlayerY: 120,
    sidePadding: 90,
  },
  fishSize: {
    smallMin: 0.45,
    smallMax: 0.8,
    dangerMin: 1.25,
    dangerMax: 1.55,
  },
  growth: {
    multiplier: 0.1,
    minPerFish: 0.04,
    maxPerFish: 0.1,
  },
  collision: {
    radiusByLength: 0.35,
  },
  timing: {
    victoryMinSeconds: 60,
    victoryMaxSeconds: 120,
  },
  world: {
    minWidth: 320,
    minHeight: 240,
    fishBaseLength: 44,
    fishBaseHeight: 22,
  },
};
