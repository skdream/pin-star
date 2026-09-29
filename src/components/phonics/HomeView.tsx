"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  BookX,
  ChevronRight,
  Flame,
  Languages,
  PencilLine,
  Quote,
  Repeat,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getReviewToday, getStats, pct, type ReviewTodayDTO, type StatsDTO } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { dailyQuote, DAILY_QUOTES, enterFadeUp, ErrorState, greetingFor } from "./shared";

const MODE_CARDS: { view: "learn" | "dictation" | "zhdictation" | "errors"; title: string; desc: string; icon: LucideIcon; cls: string }[] = [
  {
    view: "learn",
    title: "学拼读",
    desc: "像搭积木一样，把音和字母拼起来",
    icon: BookOpen,
    cls: "bg-amber-100 text-amber-600",
  },
  {
    view: "dictation",
    title: "报听写",
    desc: "AI 替爸爸妈妈报听写，随时开练",
    icon: PencilLine,
    cls: "bg-orange-100 text-orange-600",
  },
  {
    view: "zhdictation",
    title: "语文默写",
    desc: "生字句子听默写，家长轻松陪练",
    icon: Languages,
    cls: "bg-emerald-100 text-emerald-600",
  },
  {
    view: "errors",
    title: "错词本",
    desc: "错过的词要亲手赢回来",
    icon: BookX,
    cls: "bg-rose-100 text-rose-600",
  },
];

export function HomeView() {
  const nickname = useAppStore((s) => s.user.nickname);
  const setView = useAppStore((s) => s.setView);

  const [stats, setStats] = useState<StatsDTO | null>(null);
  const [review, setReview] = useState<ReviewTodayDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [greet, setGreet] = useState("你好呀");
  const [quote, setQuote] = useState(DAILY_QUOTES[0]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [s, r] = await Promise.all([getStats(), getReviewToday()]);
      setStats(s);
      setReview(r);
    } catch {
      /* 接口未就绪：展示错误空态，可重试 */
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const now = new Date();
    setGreet(greetingFor(now));
    setQuote(dailyQuote(now));
  }, []);

  const dueCount = review?.dueCount ?? 0;
  const dictationCount = stats?.today.dictationCount ?? 0;
  const correctCount = stats?.today.correctCount ?? 0;
  const streakDays = stats?.streakDays ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* 问候语 + 连续打卡 */}
      <motion.section {...enterFadeUp()} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
            {greet}，{nickname}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">今天也要和单词做朋友哦～</p>
        </div>
        <div
          className="flex items-center gap-1.5 rounded-full bg-orange-100 px-4 py-2 text-orange-600"
          aria-label={`连续打卡 ${streakDays} 天`}
        >
          <Flame className="size-5" aria-hidden />
          <span className="text-sm font-bold">连续打卡 {streakDays} 天</span>
        </div>
      </motion.section>

      {/* 今日任务 */}
      <motion.section {...enterFadeUp(0.05)}>
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <Repeat className="size-4 text-primary" aria-hidden />
              今日任务
            </h2>
            {loading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ) : error ? (
              <ErrorState title="任务数据拿不到啦" onRetry={load} />
            ) : (
              <div className="flex flex-col gap-3">
                {/* 复习任务 */}
                <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-emerald-700">今日复习</p>
                    <p className="truncate text-xs text-emerald-600/80">
                      {dueCount > 0 ? `${dueCount} 个单词到时间啦，趁热打铁！` : "今天的复习都完成啦，太棒了！"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="h-10 shrink-0 rounded-full bg-emerald-600 hover:bg-emerald-600/90"
                    onClick={() => setView("review")}
                  >
                    去复习
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                </div>
                {/* 听写任务 */}
                <div className="flex items-center justify-between gap-3 rounded-xl bg-orange-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-orange-700">今日听写</p>
                    <p className="truncate text-xs text-orange-600/80">
                      {dictationCount > 0
                        ? `已听写 ${dictationCount} 个，答对 ${correctCount} 个，正确率 ${pct(stats?.today.accuracy)}%`
                        : "今天还没听写哦，来一轮热热身！"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="h-10 shrink-0 rounded-full"
                    onClick={() => setView("dictation")}
                  >
                    去听写
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {/* 学习模式快捷入口 */}
      <motion.section {...enterFadeUp(0.1)} aria-label="学习模式入口">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODE_CARDS.map((m) => {
            const Icon = m.icon;
            return (
              <motion.button
                key={m.view}
                type="button"
                onClick={() => setView(m.view)}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                className="group text-left"
                aria-label={`进入${m.title}`}
              >
                <Card className="h-full rounded-2xl transition-colors group-hover:border-primary/40">
                  <CardContent className="flex h-full flex-col gap-3 p-5">
                    <span className={cn("flex size-12 items-center justify-center rounded-2xl", m.cls)}>
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <div className="flex-1">
                      <p className="text-lg font-extrabold">{m.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{m.desc}</p>
                    </div>
                    <span className="flex items-center gap-1 text-sm font-bold text-primary">
                      开始
                      <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </CardContent>
                </Card>
              </motion.button>
            );
          })}
        </div>
      </motion.section>

      {/* 每日一句 */}
      <motion.section {...enterFadeUp(0.15)}>
        <Card className="rounded-2xl border-amber-200/70 bg-amber-50/60">
          <CardContent className="flex items-start gap-3 p-4">
            <Quote className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            <div>
              <p className="text-sm font-bold text-amber-700">每日一句</p>
              <p className="mt-0.5 text-sm text-amber-700/90">{quote}</p>
            </div>
          </CardContent>
        </Card>
      </motion.section>
    </div>
  );
}
