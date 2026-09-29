/**
 * 拼读星球 PhonicsStar — FSRS-4.5 简化版间隔重复调度（纯函数）
 *
 * rating: 1=Again(遗忘) 2=Hard 3=Good 4=Easy
 * 输入卡片状态 + 评分 + 当前时间，输出下一状态。
 * 不含 fuzz / first-ratings 分支，适合单用户演示场景。
 */

/** FSRS-4.5 默认 17 参数 */
export const FSRS_W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const;

export type FSRating = 1 | 2 | 3 | 4;

export interface FSRSCard {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReview: Date | null;
  due: Date;
  lastResult: string;
}

export interface FSRSResult {
  stability: number;
  difficulty: number;
  due: Date;
  reps: number;
  lapses: number;
  lastResult: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 初始稳定性：第一次评分对应的 W[r-1] */
export function initStability(rating: FSRating): number {
  return FSRS_W[rating - 1];
}

/** 初始难度：D = W4 - (r-3)*W5，夹在 [1,10] */
export function initDifficulty(rating: FSRating): number {
  return clamp(FSRS_W[4] - (rating - 3) * FSRS_W[5], 1, 10);
}

/** 难度更新：D' = D + W6*(3 - r) */
export function nextDifficulty(d: number, rating: FSRating): number {
  return clamp(d + FSRS_W[6] * (3 - rating), 1, 10);
}

/** 可提取性：t 天后、稳定性 s 时的回忆概率 */
export function retrievability(tDays: number, s: number): number {
  return Math.pow(1 + (19 / 81) * (tDays / s), -0.5);
}

/** 回忆成功（rating>=2）后的新稳定性 */
export function nextStabilityRecall(
  s: number,
  d: number,
  r: number,
  rating: FSRating
): number {
  const hardPenalty = rating === 2 ? FSRS_W[15] : 1;
  const easyBonus = rating === 4 ? FSRS_W[16] : 1;
  return (
    s *
    (1 +
      Math.exp(FSRS_W[8]) *
        (11 - d) *
        Math.pow(s, -FSRS_W[9]) *
        (Math.exp(FSRS_W[10] * (1 - r)) - 1) *
        hardPenalty *
        easyBonus)
  );
}

/** 遗忘（rating=1）后的新稳定性 */
export function nextStabilityForget(s: number, d: number, r: number): number {
  return (
    FSRS_W[11] *
    Math.pow(d, -FSRS_W[12]) *
    (Math.pow(s + 1, FSRS_W[13]) - 1) *
    Math.exp(FSRS_W[14] * (1 - r))
  );
}

/**
 * 调度核心：
 * - 新卡（reps=0 或从未复习）→ 走 init 分支
 * - rating>=2 → 回忆成功公式；rating=1 → 遗忘公式，lapses+1
 * - interval = clamp(round(nextStability), 1, 365) 天
 * - lastResult：rating=1 → "WRONG"，否则 "CORRECT"
 */
export function schedule(card: FSRSCard, rating: FSRating, now: Date): FSRSResult {
  const isNew = card.reps <= 0 || !card.lastReview;
  let stability: number;
  let difficulty: number;

  if (isNew) {
    stability = initStability(rating);
    difficulty = initDifficulty(rating);
  } else {
    const elapsedDays = Math.max(
      0,
      (now.getTime() - card.lastReview!.getTime()) / DAY_MS
    );
    const r = retrievability(elapsedDays, Math.max(card.stability, 0.1));
    if (rating >= 2) {
      stability = nextStabilityRecall(Math.max(card.stability, 0.1), card.difficulty, r, rating);
    } else {
      stability = nextStabilityForget(card.stability, card.difficulty, r);
    }
    stability = clamp(stability, 0.1, 36500);
    difficulty = nextDifficulty(card.difficulty, rating);
  }

  const interval = clamp(Math.round(stability), 1, 365);
  // rating=1（Again/遗忘）：按 FSRS 标准语义几分钟内重现重学，而不是推到明天；
  // 稳定性仍按遗忘公式衰减，供下次成功回忆时使用。
  const due =
    rating === 1
      ? new Date(now.getTime() + 5 * 60 * 1000)
      : new Date(now.getTime() + interval * DAY_MS);
  const lapses = card.lapses + (rating === 1 ? 1 : 0);

  return {
    stability,
    difficulty,
    due,
    reps: card.reps + 1,
    lapses,
    lastResult: rating === 1 ? "WRONG" : "CORRECT",
  };
}
