/**
 * POST /api/dictation/words — 生成听写词单
 * body { source: "unit"|"errorbook"|"custom", unitId?, wordIds?, count? }
 * unit: 按 UnitWord.ord 取该单元全部词
 * errorbook: 当前用户未 resolved 错词（去重，最多 50）
 * custom: 按 wordIds 取
 * 返回前随机打乱顺序。
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/server/auth";
import { wordToDTO, WORD_INCLUDE, type WordWithRules } from "@/lib/server/dto";

const ERRORBOOK_MAX = 50;

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    let body: {
      source?: string;
      unitId?: string;
      wordIds?: unknown;
      count?: unknown;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    }

    const source = body.source;
    if (source !== "unit" && source !== "errorbook" && source !== "custom") {
      return NextResponse.json(
        { error: "source 需为 unit / errorbook / custom" },
        { status: 400 }
      );
    }

    const countRaw = Number(body.count);
    const count =
      Number.isFinite(countRaw) && countRaw > 0 ? Math.min(Math.round(countRaw), 200) : null;

    let words: WordWithRules[] = [];

    if (source === "unit") {
      if (!body.unitId || typeof body.unitId !== "string") {
        return NextResponse.json({ error: "缺少 unitId" }, { status: 400 });
      }
      const unitWords = await db.unitWord.findMany({
        where: { unitId: body.unitId },
        orderBy: { ord: "asc" },
        include: { word: { include: WORD_INCLUDE } },
      });
      words = unitWords.map((uw) => uw.word as WordWithRules);
    } else if (source === "errorbook") {
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
      const seen = new Set<string>();
      const list: WordWithRules[] = [];
      for (const log of logs) {
        if (seen.has(log.wordId)) continue;
        seen.add(log.wordId);
        list.push(log.word as WordWithRules);
        if (list.length >= ERRORBOOK_MAX) break;
      }
      words = list;
    } else {
      // custom
      if (!Array.isArray(body.wordIds) || body.wordIds.length === 0) {
        return NextResponse.json({ error: "缺少 wordIds" }, { status: 400 });
      }
      const ids = body.wordIds.filter((v): v is string => typeof v === "string").slice(0, 200);
      if (ids.length === 0) {
        return NextResponse.json({ error: "wordIds 不合法" }, { status: 400 });
      }
      const found = await db.word.findMany({ where: { id: { in: ids } }, include: WORD_INCLUDE });
      const byId = new Map(found.map((w) => [w.id, w as WordWithRules]));
      words = ids.map((id) => byId.get(id)).filter((w): w is WordWithRules => Boolean(w));
    }

    if (count && count < words.length) {
      words = shuffle(words).slice(0, count);
    } else {
      words = shuffle(words);
    }

    return NextResponse.json({ words: words.map((w) => wordToDTO(w)) });
  } catch (e) {
    console.error("[POST /api/dictation/words]", e);
    return NextResponse.json({ error: "生成词单失败" }, { status: 500 });
  }
}
