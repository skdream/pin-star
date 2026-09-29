/**
 * 拼读星球 PhonicsStar — 用户服务
 * userToDTO / mergeSettings；认证相关见 auth.ts。
 */
import { db } from "@/lib/db";
import type { User } from "@prisma/client";
import type { Accent, TtsEngine, UserDTO, UserSettings } from "@/lib/api-client";
import { safeJsonParse } from "@/lib/server/dto";
import { WRITE_TIME_OPTIONS, clampReads } from "@/lib/zh-dictation";

/** 默认扩展设置（与前端 DEFAULT_USER 对齐） */
export const DEFAULT_SETTINGS: UserSettings = {
  playCount: 2,
  speed: "normal",
  hintLevel: "none",
  autoNext: true,
};

/** User 表记录 → UserDTO（settings JSON 容错解析）
 * 安全：zhDictation.revealPin 明文永不下发，只输出 revealPinSet 布尔 */
export function userToDTO(user: User): UserDTO {
  const parsedSettings = safeJsonParse<UserSettings>(user.settings, {});
  const settings: UserSettings = { ...DEFAULT_SETTINGS, ...parsedSettings };
  if (settings.zhDictation && typeof settings.zhDictation === "object") {
    const zh = { ...settings.zhDictation } as Record<string, unknown>;
    zh.revealPinSet = typeof zh.revealPin === "string" && zh.revealPin !== "";
    delete zh.revealPin;
    settings.zhDictation = zh as UserSettings["zhDictation"];
  }
  return {
    id: user.id,
    nickname: user.nickname,
    grade: user.grade,
    accentPref: (user.accentPref === "en-GB" ? "en-GB" : "en-US") as Accent,
    ttsEngine: (user.ttsEngine === "server" ? "server" : "browser") as TtsEngine,
    settings,
  };
}

/** settings 深度受限合并：只接受已知键，类型不合法丢弃 */
export function mergeSettings(
  current: User,
  patch: Record<string, unknown> | undefined
): string {
  const base: Record<string, unknown> = {
    ...DEFAULT_SETTINGS,
    ...safeJsonParse<Record<string, unknown>>(current.settings, {}),
  };
  if (patch && typeof patch === "object") {
    if (typeof patch.playCount === "number" && patch.playCount >= 1 && patch.playCount <= 5) {
      base.playCount = Math.round(patch.playCount);
    }
    if (patch.speed === "normal" || patch.speed === "slow") base.speed = patch.speed;
    if (
      patch.hintLevel === "none" ||
      patch.hintLevel === "first" ||
      patch.hintLevel === "chinese" ||
      patch.hintLevel === "phonemes"
    ) {
      base.hintLevel = patch.hintLevel;
    }
    if (typeof patch.autoNext === "boolean") base.autoNext = patch.autoNext;
    /* 报听写教材/单元选择：限长字符串（空串=未选），防脏数据落库 */
    if (typeof patch.dictBookId === "string") {
      base.dictBookId = patch.dictBookId.trim().slice(0, 64);
    }
    if (typeof patch.dictUnitId === "string") {
      base.dictUnitId = patch.dictUnitId.trim().slice(0, 64);
    }
    if (patch.zhDictation && typeof patch.zhDictation === "object") {
      const zh = patch.zhDictation as Record<string, unknown>;
      const cur = (base.zhDictation ?? {}) as Record<string, unknown>;
      const next: Record<string, unknown> = { ...cur };
      if (zh.speed === "normal" || zh.speed === "slow") next.speed = zh.speed;
      if (zh.pace === "compact" || zh.pace === "standard" || zh.pace === "relaxed") {
        next.pace = zh.pace;
      }
      if (typeof zh.announceIndex === "boolean") next.announceIndex = zh.announceIndex;
      if (zh.readsPerItem !== undefined) next.readsPerItem = clampReads(zh.readsPerItem);
      if (zh.writeTime === "auto") {
        next.writeTime = "auto";
      } else if (
        typeof zh.writeTime === "number" &&
        (WRITE_TIME_OPTIONS as readonly number[]).includes(zh.writeTime)
      ) {
        next.writeTime = zh.writeTime;
      }
      /* revealPin 只能走 POST /api/zh-dictation/pin（需验证旧密码或登录密码），
       * PUT /api/user 通道一律忽略该字段，防止孩子绕过验证直接改密码 */
      base.zhDictation = next;
    }
  }
  return JSON.stringify(base);
}
