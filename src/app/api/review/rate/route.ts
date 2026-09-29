/**
 * POST /api/review/rate — 手动评分更新 FSRS 状态
 * body { wordId, rating: 1|2|3|4 }（1=忘了 2=困难 3=良好 4=简单）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/server/auth";
import { cardToDTO } from "@/lib/server/dto";
import { schedule, type FSRSCard, type FSRating } from "@/lib/fsrs";

export async function POST(req: NextRequest) {
  try {
    let body: { wordId?: unknown; rating?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    }
    const { wordId } = body;
    const rating = Number(body.rating);
    if (typeof wordId !== "string" || !wordId) {
      return NextResponse.json({ error: "缺少 wordId" }, { status: 400 });
    }
    if (![1, 2, 3, 4].includes(rating)) {
      return NextResponse.json({ error: "rating 需为 1-4" }, { status: 400 });
    }

    let user;
    try {
      user = await requireUser(req);
    } catch {
      return unauthorized();
    }
    const card = await db.reviewCard.findUnique({
      where: { userId_wordId: { userId: user.id, wordId } },
    });
    if (!card) {
      return NextResponse.json({ error: "该词还没有复习卡，请先听写或复习" }, { status: 404 });
    }

    const now = new Date();
    const base: FSRSCard = {
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      lastReview: card.lastReview,
      due: card.due,
      lastResult: card.lastResult,
    };
    const next = schedule(base, rating as FSRating, now);

    const updated = await db.reviewCard.update({
      where: { id: card.id },
      data: {
        stability: next.stability,
        difficulty: next.difficulty,
        due: next.due,
        reps: next.reps,
        lapses: next.lapses,
        lastReview: now,
        lastResult: next.lastResult,
      },
    });

    return NextResponse.json({ card: cardToDTO(updated) });
  } catch (e) {
    console.error("[POST /api/review/rate]", e);
    return NextResponse.json({ error: "评分失败，请稍后再试" }, { status: 500 });
  }
}
