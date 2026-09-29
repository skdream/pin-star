"use client";

import { cn } from "@/lib/utils";

export interface FeedbackItem {
  char: string;
  status: "correct" | "wrong" | "missing";
}

const SIZES = {
  sm: "size-7 rounded-md text-sm",
  md: "size-9 rounded-lg text-lg",
  lg: "size-11 rounded-xl text-2xl",
} as const;

interface LetterFeedbackProps {
  feedback: FeedbackItem[];
  extra?: string;
  missing?: string;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * 逐位批改渲染：
 * correct = emerald 底，wrong / missing = rose 底白字，
 * missing 用 "␣" 占位，并在下方附缺失 / 多写字母提示。
 */
export function LetterFeedback({ feedback, extra, missing, size = "md", className }: LetterFeedbackProps) {
  if (!feedback?.length) return null;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap gap-1.5" aria-label="逐字母批改结果">
        {feedback.map((f, i) => (
          <span
            key={i}
            className={cn(
              "inline-flex items-center justify-center font-mono font-bold shadow-sm",
              SIZES[size],
              f.status === "correct" && "bg-emerald-100 text-emerald-700",
              f.status === "wrong" && "bg-rose-500 text-white",
              f.status === "missing" && "bg-rose-400 text-white"
            )}
          >
            {f.status === "missing" ? "␣" : f.char || "␣"}
          </span>
        ))}
      </div>
      {missing ? <p className="text-xs text-rose-600">缺少的字母：{missing}</p> : null}
      {extra ? <p className="text-xs text-amber-600">多写的字母：{extra}</p> : null}
    </div>
  );
}

/**
 * 本地对比 expected / actual，生成逐位反馈（错词本等场景使用）：
 * 同位字符相同 → correct；不同 → wrong；expected 更长 → missing。
 */
export function diffLetters(expected: string, actual: string): FeedbackItem[] {
  const out: FeedbackItem[] = [];
  const n = Math.max(expected?.length ?? 0, actual?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const e = expected?.[i] ?? "";
    const a = actual?.[i] ?? "";
    if (!a) out.push({ char: e, status: "missing" });
    else if (a === e) out.push({ char: a, status: "correct" });
    else out.push({ char: a, status: "wrong" });
  }
  return out;
}
