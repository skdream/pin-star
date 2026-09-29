/**
 * GET /api/stats — 家长报告统计
 * today(今日) / weekly(近7天曲线) / errorDistribution(错因分布) / streakDays / totalDictations / masteredWords / totalWords
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/server/auth";
import { recentShanghaiDates, shanghaiDate } from "@/lib/server/date";
import { errorTypeLabel } from "@/lib/server/labels";

function pct(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

export async function GET(req: NextRequest) {
  try {
    let user;
    try {
      user = await requireUser(req);
    } catch {
      return unauthorized();
    }
    const today = shanghaiDate();
    const week = recentShanghaiDates(7);

    const [stats7, errorLogs, totalWords, masteredGroup, totalDictAgg] = await Promise.all([
      db.dailyStat.findMany({
        where: { userId: user.id, date: { gte: week[0] } },
      }),
      db.errorLog.findMany({
        where: { userId: user.id, resolved: false },
        select: { errorType: true },
      }),
      db.word.count(),
      db.learningEvent.groupBy({
        by: ["wordId"],
        where: { userId: user.id, result: "CORRECT" },
      }),
      db.dailyStat.aggregate({
        where: { userId: user.id },
        _sum: { dictationCount: true, reviewCount: true },
      }),
    ]);

    const byDate = new Map(stats7.map((s) => [s.date, s]));

    const todayStat = byDate.get(today);
    const todayDTO = {
      dictationCount: todayStat?.dictationCount ?? 0,
      correctCount: todayStat?.correctCount ?? 0,
      reviewCount: todayStat?.reviewCount ?? 0,
      minutes: Math.round((todayStat?.minutes ?? 0) * 10) / 10,
      accuracy: pct(todayStat?.correctCount ?? 0, todayStat?.dictationCount ?? 0),
    };

    const weekly = week.map((date) => {
      const s = byDate.get(date);
      return {
        date,
        dictationCount: s?.dictationCount ?? 0,
        correctCount: s?.correctCount ?? 0,
        accuracy: pct(s?.correctCount ?? 0, s?.dictationCount ?? 0),
      };
    });

    // 错因分布
    const distMap = new Map<string, number>();
    for (const log of errorLogs) {
      distMap.set(log.errorType, (distMap.get(log.errorType) ?? 0) + 1);
    }
    const errorDistribution = [...distMap.entries()]
      .map(([errorType, count]) => ({ errorType, label: errorTypeLabel(errorType), count }))
      .sort((a, b) => b.count - a.count);

    // 连续打卡（今天起往回连续有学习记录的天数）
    const activeDays = new Set(
      stats7.filter((s) => s.dictationCount + s.reviewCount > 0).map((s) => s.date)
    );
    let streakDays = 0;
    const dayMs = 86_400_000;
    const todayStart = Date.parse(`${today}T00:00:00+08:00`);
    for (let i = 0; i < 7; i++) {
      const d = new Date(todayStart - i * dayMs).toISOString().slice(0, 10);
      if (activeDays.has(d)) {
        streakDays += 1;
      } else {
        break;
      }
    }

    return NextResponse.json({
      today: todayDTO,
      weekly,
      errorDistribution,
      streakDays,
      totalDictations: (totalDictAgg._sum.dictationCount ?? 0) + (totalDictAgg._sum.reviewCount ?? 0),
      masteredWords: masteredGroup.length,
      totalWords,
    });
  } catch (e) {
    console.error("[GET /api/stats]", e);
    return NextResponse.json({ error: "获取统计失败" }, { status: 500 });
  }
}
