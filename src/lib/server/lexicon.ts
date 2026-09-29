/**
 * 拼读星球 PhonicsStar — 词库音素索引（供错因诊断使用）
 * lexicon: headword → phonemes（近音词命中 + g2p 整词例外）
 * exceptions: isTricky 词 headword → phonemes（g2p 例外词表）
 * 30s 模块级缓存，避免每次 check 全表扫描。
 */
import { db } from "@/lib/db";
import { parseStringArray } from "@/lib/server/dto";

export interface LexiconBundle {
  lexicon: Record<string, string[]>;
  exceptions: Record<string, string[]>;
}

let cache: { bundle: LexiconBundle; fetchedAt: number } | null = null;
const TTL_MS = 30_000;

export async function getLexiconBundle(): Promise<LexiconBundle> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.bundle;

  const words = await db.word.findMany({
    select: { headword: true, phonemes: true, isTricky: true },
  });
  const lexicon: Record<string, string[]> = {};
  const exceptions: Record<string, string[]> = {};
  for (const w of words) {
    const phonemes = parseStringArray(w.phonemes);
    if (phonemes.length === 0) continue;
    lexicon[w.headword] = phonemes;
    if (w.isTricky) exceptions[w.headword] = phonemes;
  }

  const bundle = { lexicon, exceptions };
  cache = { bundle, fetchedAt: Date.now() };
  return bundle;
}
