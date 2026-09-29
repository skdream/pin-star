/**
 * GET /api/auth/me — 当前登录用户（未登录返回 401）
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { userToDTO } from "@/lib/server/user";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    if (!session) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    return NextResponse.json({ user: userToDTO(session.user) });
  } catch (e) {
    console.error("[GET /api/auth/me]", e);
    return NextResponse.json({ error: "获取用户信息失败" }, { status: 500 });
  }
}
