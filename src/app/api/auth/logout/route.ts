/**
 * POST /api/auth/logout — 退出登录：删除会话 + 清 cookie
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clearSessionCookie, extractToken } from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  try {
    const token = extractToken(req);
    if (token) {
      await db.session.deleteMany({ where: { token } });
    }
  } catch (e) {
    console.error("[POST /api/auth/logout]", e);
  }
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
