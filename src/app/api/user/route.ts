/**
 * GET /api/user  — 当前登录用户
 * PUT /api/user  — 部分更新（nickname/grade/accentPref/ttsEngine/settings 浅合并）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/server/auth";
import { mergeSettings, userToDTO } from "@/lib/server/user";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return NextResponse.json(userToDTO(user));
  } catch (e) {
    if (e instanceof Error && e.message === "请先登录") return unauthorized();
    console.error("[GET /api/user]", e);
    return NextResponse.json({ error: "获取用户信息失败" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser(req);
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    }

    const data: {
      nickname?: string;
      grade?: number;
      accentPref?: string;
      ttsEngine?: string;
      settings?: string;
    } = {};

    if (body.nickname !== undefined) {
      const nickname = String(body.nickname).trim();
      if (!nickname || nickname.length > 20) {
        return NextResponse.json({ error: "昵称需为 1~20 个字符" }, { status: 400 });
      }
      data.nickname = nickname;
    }
    if (body.grade !== undefined) {
      const grade = Number(body.grade);
      if (!Number.isInteger(grade) || grade < 1 || grade > 9) {
        return NextResponse.json({ error: "年级需为 1~9 的整数" }, { status: 400 });
      }
      data.grade = grade;
    }
    if (body.accentPref !== undefined) {
      if (body.accentPref !== "en-US" && body.accentPref !== "en-GB") {
        return NextResponse.json({ error: "accentPref 仅支持 en-US / en-GB" }, { status: 400 });
      }
      data.accentPref = body.accentPref;
    }
    if (body.ttsEngine !== undefined) {
      if (body.ttsEngine !== "browser" && body.ttsEngine !== "server") {
        return NextResponse.json({ error: "ttsEngine 仅支持 browser / server" }, { status: 400 });
      }
      data.ttsEngine = body.ttsEngine;
    }
    if (body.settings !== undefined) {
      if (body.settings === null || typeof body.settings !== "object") {
        return NextResponse.json({ error: "settings 需为对象" }, { status: 400 });
      }
      data.settings = mergeSettings(user, body.settings as Record<string, unknown>);
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data,
    });
    return NextResponse.json(userToDTO(updated));
  } catch (e) {
    if (e instanceof Error && e.message === "请先登录") return unauthorized();
    console.error("[PUT /api/user]", e);
    return NextResponse.json({ error: "更新用户信息失败" }, { status: 500 });
  }
}
