/**
 * POST /api/dictation/check — 听写批改 + 错因诊断（核心）
 *
 * body { wordId, answer, mode: "DICTATION"|"REVIEW"|"LEARN", durationMs? }
 *
 * 诊断：src/lib/phonics/diagnose.ts（纯函数）
 * 写库（同一事务）：
 * - LearningEvent {mode, result, errorTypes JSON, durationMs}
 * - 错误 → ErrorLog(resolved:false)；正确 → 该词未 resolved ErrorLog 全部 resolved
 * - ReviewCard upsert（FSRS：对=3 / 错=1）
 * - DailyStat upsert（Asia/Shanghai 日期）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/server/auth";
import { parseGraphemes, parseStringArray, wordToDTO, WORD_INCLUDE, type WordWithRules } from "@/lib/server/dto";
import { getLexiconBundle } from "@/lib/server/lexicon";
import { shanghaiDate } from "@/lib/server/date";
import { diagnose, type DiagnoseRule, type DiagnoseWord } from "@/lib/phonics/diagnose";
import { schedule, type FSRSCard, type FSRating } from "@/lib/fsrs";

const VALID_MODES = new Set(["DICTATION", "REVIEW", "LEARN"]);

export async function POST(req: NextRequest) {
  try {
    let body: {
      wordId?: unknown;
      answer?: unknown;
      mode?: unknown;
      durationMs?: unknown;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    }

    const { wordId, mode } = body;
    const answer = typeof body.answer === "string" ? body.answer : "";
    if (typeof wordId !== "string" || !wordId) {
      return NextResponse.json({ error: "缺少 wordId" }, { status: 400 });
    }
    if (typeof mode !== "string" || !VALID_MODES.has(mode)) {
      return NextResponse.json(
        { error: "mode 需为 DICTATION / REVIEW / LEARN" },
        { status: 400 }
      );
    }
    const durationRaw = Number(body.durationMs);
    const durationMs =
      Number.isFinite(durationRaw) && durationRaw > 0
        ? Math.min(Math.round(durationRaw), 30 * 60 * 1000)
        : 0;

    let user;
    try {
      user = await requireUser(req);
    } catch {
      return unauthorized();
    }

    const word = (await db.word.findUnique({
      where: { id: wordId },
      include: WORD_INCLUDE,
    })) as unknown as WordWithRules | null;
    if (!word) {
      return NextResponse.json({ error: "词不存在" }, { status: 404 });
    }

    const { lexicon, exceptions } = await getLexiconBundle();

    // 组装诊断输入（规则按 WordRule.position 排序）
    const rules: DiagnoseRule[] = [...word.rules]
      .sort((a, b) => a.position - b.position)
      .map((wr) => ({
        code: wr.rule.code,
        name: wr.rule.name,
        pattern: wr.rule.pattern,
        description: wr.rule.description,
        tip: wr.rule.tip,
      }));
    const target: DiagnoseWord = {
      headword: word.headword,
      phonemes: parseStringArray(word.phonemes),
      graphemes: parseGraphemes(word.graphemes),
      isTricky: word.isTricky,
      rules,
    };

    const existingCard = await db.reviewCard.findUnique({
      where: { userId_wordId: { userId: user.id, wordId: word.id } },
    });

    const result = diagnose(target, answer, {
      lexicon,
      exceptions,
      reviewLastResult: existingCard?.lastResult,
    });

    const now = new Date();
    const rating: FSRating = result.correct ? 3 : 1;

    await db.$transaction(async (tx) => {
      // 1. 学习事件
      await tx.learningEvent.create({
        data: {
          userId: user.id,
          wordId: word.id,
          mode,
          result: result.correct ? "CORRECT" : "WRONG",
          errorTypes: JSON.stringify(result.errorTypes),
          durationMs,
        },
      });

      // 2. 错词本：错误记录 / 正确解锁
      if (!result.correct) {
        await tx.errorLog.create({
          data: {
            userId: user.id,
            wordId: word.id,
            expected: word.headword,
            actual: answer.trim().toLowerCase(),
            errorType: result.errorTypes[0] ?? "PATTERN",
            resolved: false,
          },
        });
      } else {
        await tx.errorLog.updateMany({
          where: { userId: user.id, wordId: word.id, resolved: false },
          data: { resolved: true, resolvedAt: now },
        });
      }

      // 3. ReviewCard upsert（FSRS 调度）
      const zeroCard: FSRSCard = {
        stability: 0,
        difficulty: 5,
        reps: 0,
        lapses: 0,
        lastReview: null,
        due: now,
        lastResult: "",
      };
      const baseCard: FSRSCard = existingCard
        ? {
            stability: existingCard.stability,
            difficulty: existingCard.difficulty,
            reps: existingCard.reps,
            lapses: existingCard.lapses,
            lastReview: existingCard.lastReview,
            due: existingCard.due,
            lastResult: existingCard.lastResult,
          }
        : zeroCard;
      const next = schedule(baseCard, rating, now);
      if (existingCard) {
        await tx.reviewCard.update({
          where: { id: existingCard.id },
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
      } else {
        await tx.reviewCard.create({
          data: {
            userId: user.id,
            wordId: word.id,
            stability: next.stability,
            difficulty: next.difficulty,
            due: next.due,
            reps: next.reps,
            lapses: next.lapses,
            lastReview: now,
            lastResult: next.lastResult,
          },
        });
      }

      // 4. 每日统计 upsert（东八区日期）
      const date = shanghaiDate(now);
      const isReview = mode === "REVIEW";
      const minutes = durationMs / 60000;
      await tx.dailyStat.upsert({
        where: { userId_date: { userId: user.id, date } },
        create: {
          userId: user.id,
          date,
          dictationCount: isReview ? 0 : 1,
          reviewCount: isReview ? 1 : 0,
          correctCount: result.correct ? 1 : 0,
          minutes,
        },
        update: {
          dictationCount: isReview ? { increment: 0 } : { increment: 1 },
          reviewCount: isReview ? { increment: 1 } : { increment: 0 },
          correctCount: result.correct ? { increment: 1 } : { increment: 0 },
          minutes: { increment: minutes },
        },
      });
    });

    return NextResponse.json({
      correct: result.correct,
      word: wordToDTO(word),
      letterFeedback: result.letterFeedback,
      missing: result.missing,
      extra: result.extra,
      phonemeFeedback: result.phonemeFeedback,
      errorTypes: result.errorTypes,
      remediation: result.remediation,
      realWord: result.realWord,
      isTricky: word.isTricky,
    });
  } catch (e) {
    console.error("[POST /api/dictation/check]", e);
    return NextResponse.json({ error: "批改失败，请稍后再试" }, { status: 500 });
  }
}
