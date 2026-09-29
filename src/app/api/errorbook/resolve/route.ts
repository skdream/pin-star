/**
 * POST /api/errorbook/resolve — 标记已掌握
 * body { wordId } → 该用户该词全部未 resolved 错误记录置为已解决
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  try {
    let body: { wordId?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    }
    const { wordId } = body;
    if (typeof wordId !== "string" || !wordId) {
      return NextResponse.json({ error: "缺少 wordId" }, { status: 400 });
    }

    let user;
    try {
      user = await requireUser(req);
    } catch {
      return unauthorized();
    }
    const result = await db.errorLog.updateMany({
      where: { userId: user.id, wordId, resolved: false },
      data: { resolved: true, resolvedAt: new Date() },
    });

    return NextResponse.json({ ok: true, resolved: result.count });
  } catch (e) {
    console.error("[POST /api/errorbook/resolve]", e);
    return NextResponse.json({ error: "操作失败，请稍后再试" }, { status: 500 });
  }
}
