"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  ArrowLeft,
  Check,
  Flame,
  Home,
  Loader2,
  PartyPopper,
  Play,
  Repeat,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useSpeech } from "@/hooks/use-speech";
import {
  checkWord,
  getReviewToday,
  getStats,
  rateReview,
  type CheckResult,
  type ReviewCardDTO,
  type ReviewCardWithWord,
  type ReviewTodayDTO,
  type StatsDTO,
} from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { StatMiniCard } from "./shared";
import { CheckFeedback } from "./CheckFeedback";

type Stage = "idle" | "session" | "done";

interface SessionSummary {
  reviewed: number;
  correct: number;
  nextDue: string | null;
}

export function ReviewView() {
  const [data, setData] = useState<ReviewTodayDTO | null>(null);
  const [stats, setStats] = useState<StatsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  const setView = useAppStore((s) => s.setView);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [r, s] = await Promise.all([getReviewToday(), getStats()]);
      setData(r);
      setStats(s);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = () => {
    if (!data?.cards?.length) {
      toast("今天没有到期卡片哦～");
      return;
    }
    setSummary(null);
    setStage("session");
  };

  const handleDone = useCallback(
    (s: SessionSummary) => {
      setSummary(s);
      setStage("done");
      void load(); // 复习后刷新到期数
    },
    [load]
  );

  if (stage === "session" && data) {
    return <ReviewSession cards={data.cards} onDone={handleDone} onQuit={() => setStage("idle")} />;
  }

  if (stage === "done" && summary) {
    return <ReviewDone summary={summary} onHome={() => setView("home")} onBack={() => setStage("idle")} />;
  }

  /* ---- idle ---- */
  const dueCount = data?.dueCount ?? 0;
  const hasCards = (data?.cards?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">复习</h1>
        <p className="mt-1 text-sm text-muted-foreground">到了时间的单词会来找你，别放它们鸽子哦～</p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-44 rounded-2xl" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        </div>
      ) : error ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="font-bold">复习数据加载失败</p>
            <p className="text-sm text-muted-foreground">可能是后端还没准备好，稍后再试试。</p>
            <Button variant="outline" className="h-11 rounded-full" onClick={load}>
              重试
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Card className="rounded-2xl">
              <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                {dueCount > 0 ? (
                  <>
                    <span className="flex size-14 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                      <Repeat className="size-7" aria-hidden />
                    </span>
                    <p className="text-4xl font-extrabold text-primary">{dueCount}</p>
                    <p className="text-sm text-muted-foreground">个单词今天到期，趁热打铁复习一波！</p>
                    <Button
                      size="lg"
                      className="h-14 w-full max-w-xs rounded-2xl text-base font-bold"
                      onClick={start}
                      disabled={!hasCards}
                    >
                      <Play className="size-5" aria-hidden />
                      开始复习
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <PartyPopper className="size-7" aria-hidden />
                    </span>
                    <p className="text-xl font-extrabold">今日复习已完成 🎉</p>
                    <p className="text-sm text-muted-foreground">到期的单词都复习完啦，明天再来找它们玩～</p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* 最近复习统计 */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatMiniCard
              icon={Repeat}
              value={`${stats?.today.reviewCount ?? 0} 词`}
              label="今日已复习"
              iconClass="bg-emerald-100 text-emerald-600"
            />
            <StatMiniCard
              icon={Flame}
              value={`${stats?.streakDays ?? 0} 天`}
              label="连续打卡"
              iconClass="bg-orange-100 text-orange-600"
            />
            <StatMiniCard
              icon={Sparkles}
              value={`${stats?.masteredWords ?? 0} / ${stats?.totalWords ?? 0}`}
              label="已掌握 / 词库总量"
              iconClass="bg-amber-100 text-amber-600"
              className="col-span-2 lg:col-span-1"
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- 复习进行中 ---------- */

function ReviewSession({
  cards,
  onDone,
  onQuit,
}: {
  cards: ReviewCardWithWord[];
  onDone: (s: SessionSummary) => void;
  onQuit: () => void;
}) {
  const { speak, stop } = useSpeech();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  const dueListRef = useRef<string[]>([]);
  const correctCountRef = useRef(0);
  const ratedRef = useRef(false);
  const startRef = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const current = cards[index];
  const word = current?.word;
  const progress = ((index + (result ? 1 : 0)) / Math.max(1, cards.length)) * 100;

  /* 换卡时：自动播放发音 + 聚焦 */
  useEffect(() => {
    if (!word) return;
    ratedRef.current = false;
    startRef.current = Date.now();
    if (!result) void speak(word.headword, { speed: "normal" });
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [word, result, speak]);

  const submit = useCallback(async () => {
    const val = answer.trim();
    if (!val) {
      toast("先写一写再提交吧～");
      return;
    }
    if (checking || result || !word) return;
    setChecking(true);
    try {
      stop();
      const res = await checkWord({
        wordId: word.id,
        answer: val,
        mode: "REVIEW",
        durationMs: Date.now() - startRef.current,
      });
      setResult(res);
      if (res.correct) correctCountRef.current += 1;
      /* 自动评级：对 → Good(3)，错 → Again(1) */
      if (!ratedRef.current) {
        ratedRef.current = true;
        rateReview(word.id, res.correct ? 3 : 1)
          .then((r) => {
            if (r?.card?.due) dueListRef.current.push(r.card.due);
          })
          .catch(() => {
            /* 评级失败不打断复习 */
          });
      }
    } catch {
      toast.error("提交失败，请再试一次");
    } finally {
      setChecking(false);
    }
  }, [answer, checking, result, word, stop]);

  const next = useCallback(() => {
    if (index + 1 >= cards.length) {
      onDone({
        reviewed: cards.length,
        correct: correctCountRef.current,
        nextDue: dueListRef.current[dueListRef.current.length - 1] ?? null,
      });
      return;
    }
    setResult(null);
    setAnswer("");
    setIndex((i) => i + 1);
  }, [index, cards.length, onDone]);

  /* 答对 1.8s 后自动下一卡 */
  useEffect(() => {
    if (result?.correct) {
      const t = setTimeout(next, 1800);
      return () => clearTimeout(t);
    }
  }, [result, next]);

  if (!word || !current) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-full" onClick={onQuit} aria-label="退出复习">
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <Progress value={progress} className="h-2.5 flex-1" aria-label={`第 ${index + 1} 张，共 ${cards.length} 张`} />
        <span className="shrink-0 text-sm font-bold text-muted-foreground">
          第 {index + 1} / {cards.length} 张
        </span>
      </div>

      <motion.div key={word.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-5 p-6">
            <button
              type="button"
              onClick={() => void speak(word.headword)}
              aria-label={`重播 ${word.headword} 的发音`}
              className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 active:scale-95"
            >
              <Play className="size-7" aria-hidden />
            </button>
            <p className="-mt-2 text-xs text-muted-foreground">听发音，把单词拼出来（复习模式）</p>

            {!result ? (
              <>
                <Input
                  ref={inputRef}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  disabled={checking}
                  placeholder="输入单词"
                  className="h-14 rounded-2xl text-center font-mono text-2xl font-bold"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="复习拼写输入框"
                />
                <Button
                  className="h-13 w-full rounded-2xl py-4 text-base font-bold"
                  onClick={() => void submit()}
                  disabled={checking}
                >
                  {checking ? (
                    <>
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                      正在批改…
                    </>
                  ) : (
                    <>
                      <Check className="size-5" aria-hidden />
                      提交（按回车也行）
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full rounded-2xl border border-border/70 bg-card p-4"
                >
                  <CheckFeedback result={result} />
                </motion.div>
                <Button className="h-13 w-full rounded-2xl py-4 text-base font-bold" onClick={next} aria-label="下一张卡片">
                  {index + 1 >= cards.length ? "完成复习" : "下一卡"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

/* ---------- 复习完成页 ---------- */

function ReviewDone({
  summary,
  onHome,
  onBack,
}: {
  summary: SessionSummary;
  onHome: () => void;
  onBack: () => void;
}) {
  const nextDueText = (() => {
    if (!summary.nextDue) return null;
    const d = new Date(summary.nextDue);
    if (Number.isNaN(d.getTime())) return null;
    try {
      return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex flex-col items-center gap-6 pt-4 text-center">
      <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <PartyPopper className="size-8" aria-hidden />
        </span>
      </motion.div>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">今日复习完成 🎉</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          一共复习了 {summary.reviewed} 个单词，记忆又牢固了一层！
        </p>
        {nextDueText ? (
          <p className="mt-1 text-sm text-muted-foreground">下一批单词 {nextDueText} 到期，记得来哦～</p>
        ) : null}
      </div>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:max-w-sm">
        <Button variant="outline" className="h-12 flex-1 rounded-2xl text-base font-bold" onClick={onBack}>
          看看复习状态
        </Button>
        <Button className="h-12 flex-1 rounded-2xl text-base font-bold" onClick={onHome}>
          <Home className="size-4" aria-hidden />
          回首页
        </Button>
      </div>
    </div>
  );
}
