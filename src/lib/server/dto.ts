/**
 * 拼读星球 PhonicsStar — 服务端 DTO 转换与 JSON 容错工具
 * 所有存库 JSON 字段（phonemes/graphemes/syllables/settings/errorTypes/examples）
 * 读写一律经过这里的 try/catch 容错解析。
 */
import type { Word, Rule, WordRule, ReviewCard } from "@prisma/client";
import type { Grapheme, ReviewCardDTO, WordDTO, WordRuleRef } from "@/lib/api-client";

/** 带 rules 的 Word（统一 include 形状） */
export type WordWithRules = Word & {
  rules: (WordRule & { rule: Rule })[];
};

/** Prisma include：词 + 规则关联 */
export const WORD_INCLUDE = {
  rules: {
    include: { rule: true },
  },
} as const;

/** 安全解析 JSON，失败返回 fallback */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

/** 解析 graphemes JSON：宽容旧格式 [g,p] / [g,p,x] */
export function parseGraphemes(raw: string | null | undefined): Grapheme[] {
  const arr = safeJsonParse<unknown[]>(raw, []);
  if (!Array.isArray(arr)) return [];
  const out: Grapheme[] = [];
  for (const item of arr) {
    if (Array.isArray(item)) {
      const g = typeof item[0] === "string" ? item[0] : "";
      const p = typeof item[1] === "string" ? item[1] : "";
      const x = item[2] === 1 || item[2] === true || p === "";
      out.push(x ? { g, p, x: true } : { g, p });
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const g = typeof obj.g === "string" ? obj.g : "";
      const p = typeof obj.p === "string" ? obj.p : "";
      const x = obj.x === true || obj.x === 1 || p === "";
      out.push(x ? { g, p, x: true } : { g, p });
    }
  }
  return out;
}

/** 解析字符串数组 JSON（phonemes / syllables） */
export function parseStringArray(raw: string | null | undefined): string[] {
  const arr = safeJsonParse<unknown>(raw, []);
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => (typeof v === "string" ? v : String(v)));
}

/** 规则引用排序：按规则 level 升序 */
function ruleRefs(word: WordWithRules): WordRuleRef[] {
  return word.rules
    .map((wr) => ({
      code: wr.rule.code,
      name: wr.rule.name,
      level: wr.rule.level,
    }))
    .sort((a, b) => a.level - b.level);
}

/** Word → WordDTO 统一转换（ipa 保持不带斜杠原样） */
export function wordToDTO(word: WordWithRules, withRules = true): WordDTO {
  return {
    id: word.id,
    headword: word.headword,
    ipa: word.ipa,
    phonemes: parseStringArray(word.phonemes),
    graphemes: parseGraphemes(word.graphemes),
    syllables: parseStringArray(word.syllables),
    translation: word.translation,
    category: word.category,
    isTricky: word.isTricky,
    difficulty: word.difficulty,
    frequency: word.frequency,
    cefr: word.cefr,
    ...(withRules ? { rules: ruleRefs(word) } : {}),
  };
}

/** ReviewCard → DTO（due 转 ISO 字符串） */
export function cardToDTO(card: ReviewCard): ReviewCardDTO {
  return {
    id: card.id,
    due: card.due.toISOString(),
    reps: card.reps,
    lapses: card.lapses,
    stability: card.stability,
    difficulty: card.difficulty,
  };
}
