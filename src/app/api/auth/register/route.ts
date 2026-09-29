/**
 * POST /api/auth/register — 注册：{ username, nickname?, password, grade }
 * 成功后自动登录（种下会话 cookie）。
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, hashPassword, sessionCookieOptions, SESSION_COOKIE } from "@/lib/server/auth";
import { userToDTO } from "@/lib/server/user";

const USERNAME_RE = /^[0-9A-Za-z_\u4e00-\u9fa5]{4,20}$/;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      username?: unknown;
      nickname?: unknown;
      password?: unknown;
      grade?: unknown;
    } | null;
    if (!body) return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });

    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
    const grade = Number(body.grade);

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json({ error: "用户名需为 4~20 位字母、数字、下划线或中文" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    }
    if (!Number.isInteger(grade) || grade < 1 || grade > 9) {
      return NextResponse.json({ error: "年级需为 1~9 的整数" }, { status: 400 });
    }

    const exists = await db.user.findUnique({ where: { username } });
    if (exists) {
      return NextResponse.json({ error: "这个用户名已被使用，换一个试试" }, { status: 409 });
    }

    const user = await db.user.create({
      data: {
        username,
        nickname: nickname || username,
        grade,
        passwordHash: hashPassword(password),
        accentPref: "en-US",
        ttsEngine: "server",
      },
    });

    const { token, expiresAt } = await createSession(user.id);
    const res = NextResponse.json({ user: userToDTO(user), sessionToken: token });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    return res;
  } catch (e) {
    console.error("[POST /api/auth/register]", e);
    return NextResponse.json({ error: "注册失败，请稍后再试" }, { status: 500 });
  }
}
