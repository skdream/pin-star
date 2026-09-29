/**
 * GET /api/curriculum — 全部级别概览（L0~L8）
 * 返回 { levels: [{ level, title, subtitle, ruleCount, wordCount }] }
 * wordCount = 该级规则关联词去重数量
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { LEVEL_META } from "@/lib/server/levels";

export async function GET() {
  try {
    // 一次取全部规则 + 关联词，内存里按级聚合（数据量小：56 规则 / 274 词）
    const rules = await db.rule.findMany({
      orderBy: { level: "asc" },
      include: { words: { select: { wordId: true } } },
    });

    const levels = LEVEL_META.map((meta) => {
      const levelRules = rules.filter((r) => r.level === meta.level);
      const wordIds = new Set<string>();
      for (const r of levelRules) {
        for (const wr of r.words) wordIds.add(wr.wordId);
      }
      return {
        level: meta.level,
        title: meta.title,
        subtitle: meta.subtitle,
        ruleCount: levelRules.length,
        wordCount: wordIds.size,
      };
    });

    return NextResponse.json({ levels });
  } catch (e) {
    console.error("[GET /api/curriculum]", e);
    return NextResponse.json({ error: "获取课程数据失败" }, { status: 500 });
  }
}
