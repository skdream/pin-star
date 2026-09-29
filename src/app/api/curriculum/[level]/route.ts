/**
 * GET /api/curriculum/[level] — 单级详情（规则 + 示例词 + 练习词）
 * Next.js 16：params 为 Promise，需 await。
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { levelMeta } from "@/lib/server/levels";
import { safeJsonParse, wordToDTO, WORD_INCLUDE, type WordWithRules } from "@/lib/server/dto";
import type { RuleDTO } from "@/lib/api-client";

const PRACTICE_LIMIT = 20;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ level: string }> }
) {
  try {
    const { level: levelStr } = await params;
    const level = Number(levelStr);
    if (!Number.isInteger(level) || level < 0 || level > 8) {
      return NextResponse.json({ error: "级别需为 0~8 的整数" }, { status: 400 });
    }
    const meta = levelMeta(level);
    if (!meta) {
      return NextResponse.json({ error: "未知级别" }, { status: 404 });
    }

    // 全量词一次取回（274 词，演示规模直接内存处理）
    const allWords = (await db.word.findMany({
      include: WORD_INCLUDE,
    })) as unknown as WordWithRules[];
    const byHeadword = new Map<string, WordWithRules>(
      allWords.map((w) => [w.headword, w])
    );
    const byId = new Map<string, WordWithRules>(allWords.map((w) => [w.id, w]));

    const rules = await db.rule.findMany({
      where: { level },
      orderBy: { id: "asc" },
      include: {
        words: { orderBy: { position: "asc" }, select: { wordId: true } },
      },
    });

    const ruleDTOs: RuleDTO[] = [];
    const practiceIds: string[] = [];
    const seenPractice = new Set<string>();

    for (const rule of rules) {
      // 示例词：按 Rule.examples JSON 里的 headword 从库中取词
      const exampleHeadwords = safeJsonParse<string[]>(rule.examples, []);
      const examples = exampleHeadwords
        .map((hw) => byHeadword.get(hw.trim().toLowerCase()))
        .filter((w): w is WordWithRules => Boolean(w))
        .map((w) => wordToDTO(w));

      ruleDTOs.push({
        id: rule.id,
        code: rule.code,
        level: rule.level,
        name: rule.name,
        pattern: rule.pattern,
        description: rule.description,
        tip: rule.tip,
        examples,
      });

      // 练习词池：该级规则的关联词去重（保持规则顺序）
      for (const wr of rule.words) {
        if (!seenPractice.has(wr.wordId)) {
          seenPractice.add(wr.wordId);
          practiceIds.push(wr.wordId);
        }
      }
    }

    let practiceWords = practiceIds
      .map((id) => byId.get(id))
      .filter((w): w is WordWithRules => Boolean(w));

    // 不足则补同级难度词：按关联词难度中位数就近、高频优先
    if (practiceWords.length < PRACTICE_LIMIT && practiceWords.length > 0) {
      const diffs = practiceWords.map((w) => w.difficulty).sort((a, b) => a - b);
      const median = diffs[Math.floor(diffs.length / 2)];
      const chosen = new Set(practiceWords.map((w) => w.id));
      const candidates = allWords
        .filter((w) => !chosen.has(w.id))
        .sort((a, b) => {
          const da = Math.abs(a.difficulty - median);
          const db_ = Math.abs(b.difficulty - median);
          if (da !== db_) return da - db_;
          return b.frequency - a.frequency;
        });
      for (const c of candidates) {
        if (practiceWords.length >= PRACTICE_LIMIT) break;
        practiceWords.push(c);
      }
    }

    return NextResponse.json({
      level: meta.level,
      title: meta.title,
      subtitle: meta.subtitle,
      rules: ruleDTOs,
      practiceWords: practiceWords.map((w) => wordToDTO(w)),
    });
  } catch (e) {
    console.error("[GET /api/curriculum/[level]]", e);
    return NextResponse.json({ error: "获取课程详情失败" }, { status: 500 });
  }
}
