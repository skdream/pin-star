/**
 * GET /api/words?q=&category=&limit= — 词库模糊搜索
 * headword / translation 双 contains；category 精确过滤；limit 默认 50。
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wordToDTO, WORD_INCLUDE, type WordWithRules } from "@/lib/server/dto";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") ?? "").trim();
    const category = (sp.get("category") ?? "").trim();
    const limitRaw = Number(sp.get("limit") ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.round(limitRaw), 1), 200) : 50;

    const where: Prisma.WordWhereInput = {};
    if (q) {
      // SQLite 不支持 mode:"insensitive"，headword 本身全小写；中文释义大小写不敏感
      where.OR = [
        { headword: { contains: q.toLowerCase() } },
        { translation: { contains: q } },
      ];
    }
    if (category) where.category = category;

    const words = (await db.word.findMany({
      where,
      include: WORD_INCLUDE,
      orderBy: [{ headword: "asc" }],
      take: limit,
    })) as unknown as WordWithRules[];

    return NextResponse.json({ words: words.map((w) => wordToDTO(w)) });
  } catch (e) {
    console.error("[GET /api/words]", e);
    return NextResponse.json({ error: "搜索词库失败" }, { status: 500 });
  }
}
