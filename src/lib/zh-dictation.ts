/**
 * 语文默写：纯逻辑工具（输入解析 / 停顿算法 / 用时估算 / 本地存储）
 * 家长逐行录入词语或句子，一行一条；播放侧策略见 use-zh-dictation。
 */

export type ZhItemKind = "word" | "sentence";

export interface ZhDictationItem {
  text: string;
  /** 码点数（中文一个字算一个） */
  chars: number;
  kind: ZhItemKind;
}

/** 停顿节奏档位 */
export type ZhPace = "compact" | "standard" | "relaxed";

export interface ZhDictationSettings {
  speed: "normal" | "slow";
  pace: ZhPace;
  /** 每条开始前先报"第几个" */
  announceIndex: boolean;
  /** 每条读几遍（1~5，默认 3） */
  readsPerItem: number;
  /** 书写倒计时："auto"＝按内容长短自适应，或固定秒数（见 WRITE_TIME_OPTIONS） */
  writeTime: "auto" | number;
  /** 「家长查看本词」门禁密码（4~6 位数字；空串＝未设置）
   * ⚠️ 仅服务端内部使用：明文永不下发，前端只能拿到 revealPinSet */
  revealPin: string;
  /** 服务端下发：是否已设置查看密码（前端据此展示徽章与门禁提示） */
  revealPinSet?: boolean;
}

export const DEFAULT_ZH_SETTINGS: ZhDictationSettings = {
  speed: "normal",
  pace: "standard",
  announceIndex: true,
  readsPerItem: 3,
  writeTime: "auto",
  revealPin: "",
  revealPinSet: false,
};

/** 每条遍数的取值范围 */
export const ZH_READS_OPTIONS = [1, 2, 3, 4, 5] as const;

/** 书写倒计时可选的固定秒数 */
export const WRITE_TIME_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120] as const;

/** 遍数容错钳制（1~5，非法回退 3） */
export function clampReads(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 3;
  const r = Math.round(n);
  return Math.min(5, Math.max(1, r));
}

/** 书写倒计时容错：非法/越界回退 "auto" */
export function clampWriteTime(v: unknown): "auto" | number {
  if (typeof v !== "number" || !Number.isFinite(v)) return "auto";
  return (WRITE_TIME_OPTIONS as readonly number[]).includes(v) ? v : "auto";
}

/** 家长查看密码容错：仅接受 4~6 位数字，其余回退空串（未设置） */
export function normalizeRevealPin(v: unknown): string {
  return typeof v === "string" && /^\d{4,6}$/.test(v) ? v : "";
}

/** 设置容错归一化：任意来源（localStorage / 服务端 JSON / 旧版数据）→ 合法设置 */
export function normalizeZhSettings(
  raw: Partial<ZhDictationSettings> | null | undefined
): ZhDictationSettings {
  const r = raw ?? {};
  let writeTime: "auto" | number = "auto";
  if (typeof r.writeTime === "number" && (WRITE_TIME_OPTIONS as readonly number[]).includes(r.writeTime)) {
    writeTime = r.writeTime;
  }
  return {
    speed: r.speed === "slow" ? "slow" : "normal",
    pace: r.pace === "compact" || r.pace === "relaxed" ? r.pace : "standard",
    announceIndex: r.announceIndex !== false,
    readsPerItem: clampReads(r.readsPerItem),
    writeTime,
    revealPin: normalizeRevealPin(r.revealPin),
    revealPinSet: (typeof r.revealPin === "string" && r.revealPin !== "") || r.revealPinSet === true,
  };
}

export const ZH_MAX_ITEMS = 50;
export const ZH_MAX_LINE_CHARS = 50;

/** 判定为"句子"的标点（含中文标点与常见西文标点） */
const SENTENCE_PUNCT = /[，。！？；：、""''《》（）(),.!?;:]/;

/** 行首序号（家长从课本/文档粘贴时常见）：1、 2. （3） 4： 十、 等 */
const LEADING_INDEX = /^[（(]?[0-9０-９一二三四五六七八九十]{1,3}[）)]?[、.．,，:：]\s*/;

export interface ParseResult {
  items: ZhDictationItem[];
  /** 被跳过的行及原因 */
  warnings: string[];
}

export function parseZhDictationInput(raw: string): ParseResult {
  const items: ZhDictationItem[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  raw.split(/\r?\n/).forEach((lineRaw, i) => {
    const text = lineRaw.trim().replace(LEADING_INDEX, "").trim();
    if (!text) return;
    const chars = [...text].length;
    if (chars > ZH_MAX_LINE_CHARS) {
      warnings.push(`第 ${i + 1} 行超过 ${ZH_MAX_LINE_CHARS} 字，已跳过`);
      return;
    }
    if (seen.has(text)) return;
    seen.add(text);
    const kind: ZhItemKind = SENTENCE_PUNCT.test(text) || chars >= 8 ? "sentence" : "word";
    items.push({ text, chars, kind });
  });

  if (items.length > ZH_MAX_ITEMS) {
    warnings.push(`最多支持 ${ZH_MAX_ITEMS} 条，已只保留前 ${ZH_MAX_ITEMS} 条`);
    items.length = ZH_MAX_ITEMS;
  }
  return { items, warnings };
}

const PACE_MULT: Record<ZhPace, number> = { compact: 0.7, standard: 1, relaxed: 1.4 };

/**
 * 每遍朗读之间的停顿（＝书写倒计时）时长：
 * - 设置为固定秒数时：直接使用该秒数（停顿节奏档位不参与）。
 * - "auto"：按内容长短决定——基础 6 秒，超过 4 字每字加 1 秒（写句子需要更久），
 *   下限 5 秒、上限 20 秒，再乘节奏档位（紧凑 0.7 / 标准 1.0 / 从容 1.4）。
 * 例（自动）：2 字词 ≈ 6s；4 字词 ≈ 6s；10 字句 ≈ 12s；20 字句 ≈ 20s。
 */
export function computeGapMs(chars: number, pace: ZhPace, writeTime: "auto" | number = "auto"): number {
  if (typeof writeTime === "number" && (WRITE_TIME_OPTIONS as readonly number[]).includes(writeTime)) {
    return writeTime * 1000;
  }
  const raw = Math.min(20000, Math.max(5000, 6000 + Math.max(0, chars - 4) * 1000));
  return Math.round(raw * PACE_MULT[pace]);
}

/** 估算整场用时（毫秒）：每条 = 报序号(≈1.6s) + N×朗读 + N×书写倒计时 + 起始 0.4s */
export function estimateSessionMs(items: ZhDictationItem[], settings: ZhDictationSettings): number {
  const reads = clampReads(settings.readsPerItem);
  const perCharSpeak = settings.speed === "slow" ? 650 : 420;
  return items.reduce((sum, it) => {
    const speakMs = Math.max(1200, it.chars * perCharSpeak);
    const gap = computeGapMs(it.chars, settings.pace, settings.writeTime);
    return sum + (settings.announceIndex ? 1600 : 0) + speakMs * reads + gap * reads + 400;
  }, 0);
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m} 分 ${String(s).padStart(2, "0")} 秒` : `${s} 秒`;
}

/* ============ 中文数字（报序号用） ============ */

const ZH_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function zhNumber(n: number): string {
  if (!Number.isInteger(n) || n <= 0) return String(n);
  if (n < 10) return ZH_DIGITS[n];
  if (n === 10) return "十";
  if (n < 20) return `十${ZH_DIGITS[n % 10]}`;
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return `${ZH_DIGITS[t]}十${o ? ZH_DIGITS[o] : ""}`;
  }
  return String(n);
}

/* ============ 本地存储（草稿 / 设置 / 最近词单） ============ */

const DRAFT_KEY = "zh-dictation:draft";
const SETTINGS_KEY = "zh-dictation:settings";
const HISTORY_KEY = "zh-dictation:history";

export interface ZhHistoryEntry {
  id: string;
  savedAt: number;
  items: ZhDictationItem[];
}

export function loadZhDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveZhDraft(raw: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, raw);
  } catch {
    /* 忽略隐私模式等存储异常 */
  }
}

export function loadZhSettings(): ZhDictationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_ZH_SETTINGS;
    return normalizeZhSettings(JSON.parse(raw) as Partial<ZhDictationSettings>);
  } catch {
    return DEFAULT_ZH_SETTINGS;
  }
}

export function saveZhSettings(s: ZhDictationSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 忽略 */
  }
}

export function loadZhHistory(): ZhHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as ZhHistoryEntry[]) : [];
    return Array.isArray(list) ? list.slice(0, 5) : [];
  } catch {
    return [];
  }
}

/** 开始默写时自动存入最近词单（去重，最新在前，最多 5 份） */
export function pushZhHistory(items: ZhDictationItem[]): ZhHistoryEntry[] {
  if (items.length === 0) return loadZhHistory();
  const signature = items.map((i) => i.text).join("\n");
  const prev = loadZhHistory().filter((e) => e.items.map((i) => i.text).join("\n") !== signature);
  const next = [{ id: `zh-${Date.now()}`, savedAt: Date.now(), items }, ...prev].slice(0, 5);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* 忽略 */
  }
  return next;
}

export function removeZhHistory(id: string): ZhHistoryEntry[] {
  const next = loadZhHistory().filter((e) => e.id !== id);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* 忽略 */
  }
  return next;
}
