/**
 * POST /api/zh-dictation/pin — 「家长查看本词」密码管理（唯一写通道）
 *
 * 安全设计（防孩子随意改密码）：
 * - verify：默写中查看本词的验证（已设密码时必须 oldPin 匹配）
 * - set / clear：若已设密码，必须先通过验证，两种方式二选一：
 *   ① 输入当前家长密码（oldPin）
 *   ② 输入账号登录密码（loginPassword，家长掌握；孩子不知道登录密码即无法绕过）
 * - 未设密码时首次设置免验证（此时由家长先操作）
 * - PUT /api/user 通道已忽略 revealPin 字段，本路由是唯一修改入口
 */
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized, verifyPassword } from "@/lib/server/auth";
import { userToDTO } from "@/lib/server/user";
import { safeJsonParse } from "@/lib/server/dto";
import { normalizeRevealPin } from "@/lib/zh-dictation";

/** 恒时字符串比较（长度不同直接 false） */
function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser(req);
  } catch {
    return unauthorized();
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      action?: unknown;
      pin?: unknown;
      oldPin?: unknown;
      loginPassword?: unknown;
    } | null;
    const action = body?.action;
    if (action !== "verify" && action !== "set" && action !== "clear") {
      return NextResponse.json({ error: "action 需为 verify / set / clear" }, { status: 400 });
    }

    const stored = safeJsonParse<Record<string, unknown>>(user.settings, {});
    const zh = (stored.zhDictation ?? {}) as Record<string, unknown>;
    const current = normalizeRevealPin(zh.revealPin);

    /* ---- verify：默写中查看本词的门禁验证 ---- */
    if (action === "verify") {
      if (!current) return NextResponse.json({ ok: true }); // 未设密码：上层引导 setup
      const oldPin = typeof body?.oldPin === "string" ? body.oldPin.trim() : "";
      if (oldPin && safeEqualStr(normalizeRevealPin(oldPin), current)) {
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: "密码不对，请再试试" }, { status: 403 });
    }

    /* ---- set / clear：已设密码时必须验证身份 ---- */
    if (current) {
      const oldPin = typeof body?.oldPin === "string" ? body.oldPin.trim() : "";
      const loginPassword = typeof body?.loginPassword === "string" ? body.loginPassword : "";
      const byPin = !!oldPin && safeEqualStr(normalizeRevealPin(oldPin), current);
      const byLogin =
        !!loginPassword && !!user.passwordHash && verifyPassword(loginPassword, user.passwordHash);
      if (!byPin && !byLogin) {
        return NextResponse.json(
          { error: "验证未通过：请输入当前的家长密码，或改用账号登录密码验证" },
          { status: 403 }
        );
      }
    }

    /* ---- 执行变更 ---- */
    let nextRevealPin: string;
    if (action === "set") {
      const pin = normalizeRevealPin(typeof body?.pin === "string" ? body.pin.trim() : "");
      if (!pin) {
        return NextResponse.json({ error: "新密码需为 4~6 位数字" }, { status: 400 });
      }
      if (current && safeEqualStr(pin, current)) {
        return NextResponse.json({ error: "新密码与当前密码相同，换一个吧" }, { status: 400 });
      }
      nextRevealPin = pin;
    } else {
      nextRevealPin = ""; // clear
    }

    const nextSettings = JSON.stringify({
      ...stored,
      zhDictation: { ...zh, revealPin: nextRevealPin },
    });
    const updated = await db.user.update({
      where: { id: user.id },
      data: { settings: nextSettings },
    });

    return NextResponse.json({
      ok: true,
      user: userToDTO(updated),
      message: action === "set" ? "家长密码已保存" : "已清除家长密码",
    });
  } catch (e) {
    console.error("[POST /api/zh-dictation/pin]", e);
    return NextResponse.json({ error: "操作失败，请稍后再试" }, { status: 500 });
  }
}
