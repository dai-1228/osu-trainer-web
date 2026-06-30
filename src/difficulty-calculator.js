import { Beatmap, GameMode } from './osu-parser.js';

export function clamp(v, min, max) {
  return v > max ? max : v < min ? min : v;
}

function approachRateToMs(ar) {
  if (ar <= 5) return 1800.0 - ar * 120.0;
  return 1200.0 - (ar - 5) * 150.0;
}

function msToApproachRate(ms) {
  let smallestDiff = 100000.0;
  for (let AR = 0; AR <= 110; AR++) {
    const newDiff = Math.abs(approachRateToMs(AR / 10.0) - ms);
    if (newDiff < smallestDiff) {
      smallestDiff = newDiff;
    } else {
      return (AR - 1) / 10.0;
    }
  }
  return 300;
}

function overallDifficultyToMs(od) {
  return -6.0 * od + 79.5;
}

function msToOverallDifficulty(ms) {
  return (79.5 - ms) / 6.0;
}

export function calculateMultipliedAR(beatmap, multiplier) {
  const newMs = approachRateToMs(beatmap.approachRate) / multiplier;
  const newAR = msToApproachRate(newMs);
  return clamp(newAR, 0, 11);
}

export function calculateMultipliedOD(beatmap, multiplier) {
  const newMs = overallDifficultyToMs(beatmap.overallDifficulty) / multiplier;
  let newOD = msToOverallDifficulty(newMs);
  newOD = Math.round(newOD * 10.0) / 10.0;
  return clamp(newOD, 0, 11);
}

export function calculateStarRating(beatmap) {
  if (!beatmap || !beatmap.hitObjects || beatmap.hitObjects.length === 0) {
    return { stars: 0, aim: 0, speed: 0 };
  }

  if (beatmap.mode !== GameMode.osu) {
    return { stars: 0, aim: 0, speed: 0 };
  }

  try {
    return computeStandardStars(beatmap);
  } catch (e) {
    console.warn('Star rating calculation failed:', e);
    return { stars: 0, aim: 0, speed: 0 };
  }
}

function computeStandardStars(beatmap) {
  const cs = beatmap.circleSize;
  const ar = beatmap.approachRate;
  const od = beatmap.overallDifficulty;

  const radius = 54.4 - 4.48 * cs;

  const approachTime = ar <= 5
    ? 1800 - ar * 120
    : 1200 - (ar - 5) * 150;

  const hitWindow300 = 79.5 - 6 * od;

  const objects = beatmap.hitObjects.filter(h => !h.isSpinner);
  if (objects.length < 2) {
    return { stars: 0, aim: 0, speed: 0 };
  }

  const aimStrains = computeAimStrains(objects, radius, approachTime);

  const speedStrains = computeSpeedStrains(objects, hitWindow300);

  const aimStars = Math.sqrt(aimStrains.peak) * 1.06;
  const speedStars = Math.sqrt(speedStrains.peak) * 1.06;

  const totalStars = Math.sqrt(
    aimStars * aimStars * 1.06 +
    speedStars * speedStars * 1.06
  ) * 1.06;

  const safe = (n) => isFinite(n) && !isNaN(n) ? n : 0;

  return {
    stars: safe(clamp(totalStars, 0, 15)),
    aim: safe(aimStars),
    speed: safe(speedStars),
  };
}

function computeAimStrains(objects, radius, approachTime) {
  let currentStrain = 0;
  let peakStrain = 0;
  const strainDecay = 0.15;

  let prevPrev = null;
  let prev = objects[0];

  for (let i = 1; i < objects.length; i++) {
    const cur = objects[i];
    const dt = Math.max(cur.time - prev.time, 1);
    const strainTime = Math.min(dt, approachTime);
    const decay = Math.pow(strainDecay, dt / 1000);

    let strain = 0;
    if (prevPrev) {

      const dist = Math.hypot(cur.x - prevPrev.x, cur.y - prevPrev.y);

      const normDist = Math.max(dist - radius, 0);
      strain = normDist / strainTime;
    } else {
      const dist = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      strain = Math.max(dist - radius, 0) / strainTime;
    }

    currentStrain = currentStrain * decay + strain;
    if (currentStrain > peakStrain) peakStrain = currentStrain;

    prevPrev = prev;
    prev = cur;
  }

  peakStrain *= (1.0 + Math.max(0, 8000 - approachTime) / 8000);

  return { peak: peakStrain };
}

function computeSpeedStrains(objects, hitWindow300) {
  let currentStrain = 0;
  let peakStrain = 0;
  const strainDecay = 0.3;

  let prev = objects[0];

  for (let i = 1; i < objects.length; i++) {
    const cur = objects[i];
    const dt = Math.max(cur.time - prev.time, 25);
    const strainTime = Math.min(dt, 1000);

    const decay = Math.pow(strainDecay, dt / 1000);

    const strain = (1000 / strainTime) * (1.0 + Math.max(0, 200 - hitWindow300) / 200);

    currentStrain = currentStrain * decay + strain;
    if (currentStrain > peakStrain) peakStrain = currentStrain;

    prev = cur;
  }

  return { peak: peakStrain };
}

export const DifficultyColors = {
  Easy: '#88b300',
  Normal: '#66ccff',
  Hard: '#ffcc22',
  Insane: '#ff66aa',
  Expert: '#aa88ff',
  ExpertPlus: '#5a4a8a',
};

export function getDifficultyColor(stars) {
  if (stars < 2) return DifficultyColors.Easy;
  if (stars < 2.7) return DifficultyColors.Normal;
  if (stars < 4) return DifficultyColors.Hard;
  if (stars < 5.3) return DifficultyColors.Insane;
  if (stars < 6.5) return DifficultyColors.Expert;
  return DifficultyColors.ExpertPlus;
}
