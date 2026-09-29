/**
 * GET /api/books — 教材列表（含单元与词数）
 * 返回 { books: [{ id, publisher, grade, volume, units: [{ id, name, ord, wordCount }] }] }
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { UnitDTO } from "@/lib/api-client";

export async function GET() {
  try {
    const books = await db.book.findMany({
      orderBy: [{ grade: "asc" }, { volume: "asc" }],
      include: {
        units: {
          orderBy: { ord: "asc" },
          include: { words: { select: { wordId: true } } },
        },
      },
    });

    return NextResponse.json({
      books: books.map((b) => ({
        id: b.id,
        publisher: b.publisher,
        grade: b.grade,
        volume: b.volume,
        units: b.units.map(
          (u): UnitDTO => ({
            id: u.id,
            name: u.name,
            ord: u.ord,
            wordCount: u.words.length,
          })
        ),
      })),
    });
  } catch (e) {
    console.error("[GET /api/books]", e);
    return NextResponse.json({ error: "获取教材数据失败" }, { status: 500 });
  }
}
