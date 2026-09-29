/**
 * POST /api/zh-dictation/draft — 页面关闭/切走时的草稿补传（navigator.sendBeacon 专用）
 * sendBeacon 只能发 POST，body 为 JSON Blob：{ raw }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  try {
    const body = (await req.json().catch(() => null)) as { raw?: unknown } | null;
    const raw = typeof body?.raw === "string" ? body.raw.slice(0, 5000) : "";
    const existing = await db.zhDoc.findFirst({
      where: { userId: user.id, kind: "draft" },
      orderBy: { savedAt: "desc" },
    });
    if (existing) {
      await db.zhDoc.update({ where: { id: existing.id }, data: { itemsJSON: raw, savedAt: new Date() } });
    } else {
      await db.zhDoc.create({ data: { userId: user.id, kind: "draft", itemsJSON: raw, savedAt: new Date() } });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/zh-dictation/draft]", e);
    return NextResponse.json({ error: "保存草稿失败" }, { status: 500 });
  }
}
