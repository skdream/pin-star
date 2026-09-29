/**
 * 拼读星球 PhonicsStar — 服务端中文标签映射
 * 与前端 api-client.ts 的 ERROR_TYPE_LABELS 保持一致（服务端不 import 前端模块）。
 */

export const ERROR_TYPE_LABELS: Record<string, string> = {
  PHONEME: "音辨错误",
  SEGMENT: "切分错误",
  PATTERN: "拼式错误",
  IRREGULAR: "不规则词",
  SUFFIX: "后缀双写",
  MEMORY: "记忆遗忘",
  HANDWRITING: "书写错误",
};

export const ALL_ERROR_TYPES = Object.keys(ERROR_TYPE_LABELS);

export function errorTypeLabel(t: string): string {
  return ERROR_TYPE_LABELS[t] ?? "其他错误";
}
