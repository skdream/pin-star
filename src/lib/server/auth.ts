/**
 * 拼读星球 PhonicsStar — 会话认证
 * - 密码：scrypt(salt+hash) 存储，timingSafeEqual 比较
 * - 会话：48 字节随机 token 存 Session 表，httpOnly cookie 30 天
 * - 双通道：支持 cookie（同源直连）与 Authorization: Bearer / X-Session-Token 请求头
 *   （预览面板 iframe 场景下浏览器会拦截第三方 cookie，请求头通道保证登录态可用）
 * - requireUser(req)：解析当前用户；未登录抛 UnauthorizedError（路由层转 401）
 */
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";

export const SESSION_COOKIE = "ps_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

/* ============ 密码 ============ */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/* ============ 会话 ============ */

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await db.session.create({ data: { token, userId, expiresAt } });
  return { token, expiresAt };
}

/** cookie 参数（开发环境为 http，secure 关闭） */
export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

/** 提取会话 token：优先 Authorization: Bearer / X-Session-Token 请求头，回退 httpOnly cookie */
export function extractToken(req: NextRequest): string | undefined {
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const header = req.headers.get("x-session-token");
  if (header && header.trim()) return header.trim();
  return req.cookies.get(SESSION_COOKIE)?.value;
}

/** 从请求解析有效会话（token 过期即视为未登录） */
export async function getSession(req: NextRequest): Promise<{ user: User; sessionId: string } | null> {
  const token = extractToken(req);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  /* 滑动续期：剩余不足一半时向后延长 30 天 */
  if (session.expiresAt.getTime() - Date.now() < SESSION_MS / 2) {
    await db.session
      .update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + SESSION_MS) } })
      .catch(() => undefined);
  }
  return { user: session.user, sessionId: session.id };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("请先登录");
    this.name = "UnauthorizedError";
  }
}

/** 路由守卫：未登录抛 UnauthorizedError，由调用方 catch 后返回 unauthorized() */
export async function requireUser(req: NextRequest): Promise<User> {
  const session = await getSession(req);
  if (!session) throw new UnauthorizedError();
  return session.user;
}

/** 统一 401 响应 */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "请先登录" }, { status: 401 });
}
