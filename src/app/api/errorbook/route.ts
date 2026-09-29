/**
 * GET /api/errorbook — 错词本（按错因分组聚合）
 * 只统计未 resolved 的 ErrorLog，同词同错因聚合成一条并计次数。
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/server/auth";
import { wordToDTO, WORD_INCLUDE, type WordWithRules } from "@/lib/server/dto";
import { errorTypeLabel } from "@/lib/server/labels";

export async function GET(req: NextRequest) {
  try {
    let user;
    try {
      user = await requireUser(req);
    } catch {
      return unauthorized();
    }

    const logs = await db.errorLog.findMany({
      where: { userId: user.id, resolved: false },
      orderBy: { createdAt: "desc" },
      include: { word: { include: WORD_INCLUDE } },
    });

    // 按 errorType → wordId 聚合
    const groupMap = new Map<string, Map<string, { count: number; lastAt: Date; wordId: string }>>();
    for (const log of logs) {
      let wordMap = groupMap.get(log.errorType);
      if (!wordMap) {
        wordMap = new Map();
        groupMap.set(log.errorType, wordMap);
      }
      const prev = wordMap.get(log.wordId);
      if (prev) {
        prev.count += 1;
        if (log.createdAt > prev.lastAt) prev.lastAt = log.createdAt;
      } else {
        wordMap.set(log.wordId, { count: 1, lastAt: log.createdAt, wordId: log.wordId });
      }
    }

    const groups = [...groupMap.entries()]
      .map(([errorType, wordMap]) => {
        const items = [...wordMap.values()]
          .map((v) => {
            const log = logs.find((l) => l.wordId === v.wordId && l.errorType === errorType)!;
            return {
              expected: log.expected,
              actual: log.actual,
              count: v.count,
              lastAt: v.lastAt.toISOString(),
              word: wordToDTO(log.word as unknown as WordWithRules),
            };
          })
          .sort((a, b) => b.count - a.count);
        const count = items.reduce((acc, it) => acc + it.count, 0);
        return { errorType, label: errorTypeLabel(errorType), count, items };
      })
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ groups });
  } catch (e) {
    console.error("[GET /api/errorbook]", e);
    return NextResponse.json({ error: "获取错词本失败" }, { status: 500 });
  }
}
