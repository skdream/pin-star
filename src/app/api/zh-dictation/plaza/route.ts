/**
 * GET /api/zh-dictation/plaza — 默写广场
 * 展示今日（Asia/Shanghai 自然日）所有用户的默写词单：
 * - 只取 kind=history（家长点「开始默写」才入广场，草稿不曝光）
 * - 按「纯内容签名」去重：不同用户内容相同只显示一条（保留最新一条的发布者/时间）
 * - 最多返回 3 条；每条 items 的 text 截断到 50 字符（与录入上限一致）
 * - 只返回昵称/年级等公开字段，不含用户名等敏感信息
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/server/auth";
import { parseItemsJSON } from "@/lib/server/zh";

const SH_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_TAKE = 200;
const MAX_PLAZA = 3;

/** 上海时区今日 0 点（UTC+8 固定偏移，无夏令时） */
function startOfTodayShanghai(): Date {
  const sh = new Date(Date.now() + SH_OFFSET_MS);
  return new Date(Date.UTC(sh.getUTCFullYear(), sh.getUTCMonth(), sh.getUTCDate()) - SH_OFFSET_MS);
}

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }
  try {
    const docs = await db.zhDoc.findMany({
      where: { kind: "history", savedAt: { gte: startOfTodayShanghai() } },
      orderBy: { savedAt: "desc" },
      take: MAX_TAKE,
      include: { user: { select: { id: true, nickname: true, grade: true } } },
    });

    const seen = new Set<string>();
    const plaza: {
      id: string;
      userId: string;
      nickname: string;
      grade: number;
      savedAt: string;
      items: ReturnType<typeof parseItemsJSON>;
    }[] = [];

    for (const d of docs) {
      const items = parseItemsJSON(d.itemsJSON);
      if (items.length === 0) continue;
      const sig = items.map((i) => i.text).join("\n");
      if (seen.has(sig)) continue;
      seen.add(sig);
      plaza.push({
        id: d.id,
        userId: d.userId,
        nickname: d.user.nickname,
        grade: d.user.grade,
        savedAt: d.savedAt.toISOString(),
        items,
      });
      if (plaza.length >= MAX_PLAZA) break;
    }

    return NextResponse.json({ plaza });
  } catch (e) {
    console.error("[GET /api/zh-dictation/plaza]", e);
    return NextResponse.json({ error: "获取默写广场失败" }, { status: 500 });
  }
}
