"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Check, Lightbulb, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ERROR_TYPE_LABELS, type CheckResult } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { LetterFeedback } from "./LetterFeedback";
import { PhonemeBlocks } from "./PhonemeBlocks";
import { ERROR_TYPE_BADGE_CLS, randomPraise } from "./shared";

/**
 * 听写 / 复习共用的批改反馈区：
 * 对/错动画 + LetterFeedback + 近音词提示 + 错因 Badge + 讲解卡 + PhonemeBlocks + 释义。
 */
export function CheckFeedback({ result }: { result: CheckResult }) {
  const praise = useMemo(() => (result.correct ? randomPraise() : "差一点点～"), [result.correct]);

  return (
    <div className="flex flex-col gap-4">
      {/* 对 / 错 动画横幅 */}
      <div className="flex items-center gap-3">
        <motion.span
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 14 }}
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full text-white shadow-md",
            result.correct ? "bg-emerald-500" : "bg-rose-500"
          )}
          aria-hidden
        >
          {result.correct ? <Check className="size-7" strokeWidth={3} /> : <X className="size-7" strokeWidth={3} />}
        </motion.span>
        <div className="min-w-0">
          <p className={cn("text-lg font-extrabold", result.correct ? "text-emerald-600" : "text-rose-600")}>
            {praise}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {result.word?.headword ?? ""}
            {result.word?.ipa ? <span className="ml-1.5 font-mono">/{result.word.ipa}/</span> : null}
            {result.word?.isTricky ? (
              <Badge variant="secondary" className="ml-2 rounded-full bg-amber-100 text-[10px] text-amber-700">
                不规则词
              </Badge>
            ) : null}
          </p>
        </div>
      </div>

      {/* 近音词干扰命中：答案其实是另一个单词 */}
      {result.realWord ? (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700" role="note">
          有趣！你写的是另一个单词哦：<span className="font-mono font-bold">{result.realWord}</span>
        </div>
      ) : null}

      {/* 逐字母批改 */}
      <LetterFeedback feedback={result.letterFeedback ?? []} extra={result.extra} missing={result.missing} />

      {/* 错因列表 */}
      {result.errorTypes?.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="错因分析">
          {result.errorTypes.map((t) => (
            <Badge
              key={t}
              variant="secondary"
              className={cn("rounded-full border", ERROR_TYPE_BADGE_CLS[t] ?? "bg-secondary text-secondary-foreground")}
            >
              {ERROR_TYPE_LABELS[t] ?? t}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* 讲解 / 补救卡 */}
      {result.remediation ? (
        <Card className="rounded-2xl border-amber-200 bg-amber-50/70">
          <CardContent className="flex gap-2.5 p-4">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            <div className="min-w-0 text-sm">
              <p className="font-bold text-foreground">
                {result.remediation.ruleCode} · {result.remediation.ruleName}
              </p>
              <p className="mt-0.5 text-muted-foreground">{result.remediation.description}</p>
              {result.remediation.tip ? (
                <p className="mt-1.5 font-medium text-amber-700">口诀：{result.remediation.tip}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* 音素块讲解 + 释义 */}
      {result.word ? (
        <>
          <PhonemeBlocks word={result.word} size="sm" phonemeFeedback={result.phonemeFeedback} />
          {result.word.translation ? (
            <p className="text-sm text-muted-foreground">中文释义：{result.word.translation}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
