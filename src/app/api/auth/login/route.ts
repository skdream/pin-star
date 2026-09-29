/**
 * POST /api/auth/login — 登录：{ username, password }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, sessionCookieOptions, SESSION_COOKIE, verifyPassword } from "@/lib/server/auth";
import { userToDTO } from "@/lib/server/user";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      username?: unknown;
      password?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });

    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    const user = await db.user.findUnique({ where: { username } });
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "用户名或密码不对" }, { status: 401 });
    }

    const { token, expiresAt } = await createSession(user.id);
    const res = NextResponse.json({ user: userToDTO(user), sessionToken: token });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return res;
  } catch (e) {
    console.error("[POST /api/auth/login]", e);
    return NextResponse.json({ error: "登录失败，请稍后再试" }, { status: 500 });
  }
}
