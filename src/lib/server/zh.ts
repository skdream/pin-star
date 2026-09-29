/**
 * 语文默写服务端工具：itemsJSON 序列化/校验
 * - history 文档：itemsJSON = JSON 数组 [{text, chars, kind}]
 * - draft 文档：itemsJSON = 家长输入框原文文本
 */
import type { ZhDictationItem, ZhItemKind } from "@/lib/zh-dictation";

const MAX_ITEMS = 50;
const MAX_TEXT_CHARS = 50;

/** 容错解析 history 文档的 itemsJSON */
export function parseItemsJSON(raw: string): ZhDictationItem[] {
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: ZhDictationItem[] = [];
    for (const it of arr) {
      if (!it || typeof it !== "object") continue;
      const o = it as Record<string, unknown>;
      if (typeof o.text !== "string" || !o.text.trim()) continue;
      const text = o.text.slice(0, MAX_TEXT_CHARS);
      const kind: ZhItemKind = o.kind === "sentence" ? "sentence" : "word";
      out.push({
        text,
        chars: typeof o.chars === "number" && Number.isFinite(o.chars) ? Math.round(o.chars) : [...text].length,
        kind,
      });
    }
    return out.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

/** 校验并规范化客户端提交的词单（开始默写/保存最近词单用） */
export function sanitizeItems(input: unknown): ZhDictationItem[] | null {
  if (!Array.isArray(input)) return null;
  const out: ZhDictationItem[] = [];
  for (const it of input.slice(0, MAX_ITEMS)) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (typeof o.text !== "string" || !o.text.trim()) continue;
    const text = o.text.trim().slice(0, MAX_TEXT_CHARS);
    if ([...text].length === 0) continue;
    const kind: ZhItemKind = o.kind === "sentence" ? "sentence" : "word";
    out.push({ text, chars: [...text].length, kind });
  }
  return out;
}
