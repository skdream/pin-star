/**
 * /api/zh-dictation — 语文默写文档（草稿 + 最近词单），全部随登录账号隔离
 * GET    → { draft: string, history: {id, savedAt, items}[] }
 * PUT    → { raw } 更新草稿（输入防抖自动保存）
 * POST   → { items } 存一份最近词单（按内容签名去重，最多 5 份）→ { history }
 * DELETE → { id } 删除一份最近词单 → { history }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/server/auth";
import { parseItemsJSON, sanitizeItems } from "@/lib/server/zh";

const HISTORY_MAX = 5;

async function listHistory(userId: string) {
  const docs = await db.zhDoc.findMany({
    where: { userId, kind: "history" },
    orderBy: { savedAt: "desc" },
    take: HISTORY_MAX,
  });
  return docs.map((d) => ({
    id: d.id,
    savedAt: d.savedAt.toISOString(),
    items: parseItemsJSON(d.itemsJSON),
  }));
}

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  try {
    const [draftDoc, history] = await Promise.all([
      db.zhDoc.findFirst({
        where: { userId: user.id, kind: "draft" },
        orderBy: { savedAt: "desc" },
      }),
      listHistory(user.id),
    ]);
    return NextResponse.json({
      draft: draftDoc?.itemsJSON ?? "",
      history,
    });
  } catch (e) {
    console.error("[GET /api/zh-dictation]", e);
    return NextResponse.json({ error: "获取默写数据失败" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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
    console.error("[PUT /api/zh-dictation]", e);
    return NextResponse.json({ error: "保存草稿失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  try {
    const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
    const items = sanitizeItems(body?.items);
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "词单不能为空" }, { status: 400 });
    }
    const signature = items.map((i) => i.text).join("\n");

    /* 内容签名相同的旧词单先删掉（最新在前，最多 5 份） */
    const existing = await db.zhDoc.findMany({
      where: { userId: user.id, kind: "history" },
      orderBy: { savedAt: "desc" },
    });
    const dupIds = existing
      .filter((d) => parseItemsJSON(d.itemsJSON).map((i) => i.text).join("\n") === signature)
      .map((d) => d.id);
    if (dupIds.length > 0) {
      await db.zhDoc.deleteMany({ where: { id: { in: dupIds } } });
    }
    const keep = existing.filter((d) => !dupIds.includes(d.id)).slice(0, HISTORY_MAX - 1);
    const dropIds = existing.filter((d) => !keep.includes(d) && !dupIds.includes(d.id)).map((d) => d.id);
    if (dropIds.length > 0) {
      await db.zhDoc.deleteMany({ where: { id: { in: dropIds } } });
    }

    await db.zhDoc.create({
      data: { userId: user.id, kind: "history", itemsJSON: JSON.stringify(items), savedAt: new Date() },
    });
    return NextResponse.json({ history: await listHistory(user.id) });
  } catch (e) {
    console.error("[POST /api/zh-dictation]", e);
    return NextResponse.json({ error: "保存词单失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  try {
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    await db.zhDoc.deleteMany({ where: { id, userId: user.id, kind: "history" } });
    return NextResponse.json({ history: await listHistory(user.id) });
  } catch (e) {
    console.error("[DELETE /api/zh-dictation]", e);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
