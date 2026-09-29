/**
 * GET /api/review/today — FSRS 今日复习队列
 * 返回全部到期数 dueCount + 最多 20 张卡（按 due 升序）。
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/server/auth";
import { cardToDTO, wordToDTO, WORD_INCLUDE, type WordWithRules } from "@/lib/server/dto";

export async function GET(req: NextRequest) {
  try {
    let user;
    try {
      user = await requireUser(req);
    } catch {
      return unauthorized();
    }
    const now = new Date();

    const dueCount = await db.reviewCard.count({
      where: { userId: user.id, due: { lte: now } },
    });

    const cards = await db.reviewCard.findMany({
      where: { userId: user.id, due: { lte: now } },
      orderBy: { due: "asc" },
      take: 20,
      include: { word: { include: WORD_INCLUDE } },
    });

    return NextResponse.json({
      dueCount,
      cards: cards.map((c) => ({
        card: cardToDTO(c),
        word: wordToDTO(c.word as unknown as WordWithRules),
      })),
    });
  } catch (e) {
    console.error("[GET /api/review/today]", e);
    return NextResponse.json({ error: "获取复习队列失败" }, { status: 500 });
  }
}
