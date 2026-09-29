"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  PencilLine,
  Play,
  Quote,
  RotateCcw,
  Trophy,
  Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurriculumLevel, getCurriculumLevels, type LevelDetailDTO, type LevelsDTO, type WordDTO } from "@/lib/api-client";
import { useSpeech } from "@/hooks/use-speech";
import { cn } from "@/lib/utils";
import { AccuracyRing, enterFadeUp, ErrorState, LoadingBlock } from "./shared";
import { PhonemeBlocks } from "./PhonemeBlocks";

/* ---------- 工具 ---------- */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** L0~L8 难度渐进配色：amber → orange → rose */
const LEVEL_COLORS = [
  "bg-amber-400",
  "bg-amber-500",
  "bg-orange-400",
  "bg-orange-500",
  "bg-orange-600",
  "bg-amber-600",
  "bg-orange-700",
  "bg-rose-400",
  "bg-rose-500",
];
function levelColor(level: number): string {
  return LEVEL_COLORS[level] ?? "bg-orange-500";
}

/* ---------- 主视图 ---------- */

export function LearnView() {
  const [levels, setLevels] = useState<LevelsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [activeLevel, setActiveLevel] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getCurriculumLevels();
      setLevels(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (activeLevel !== null) {
    return <LevelDetail level={activeLevel} onBack={() => setActiveLevel(null)} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <motion.section {...enterFadeUp()}>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">学拼读</h1>
        <p className="mt-1 text-sm text-muted-foreground">从 L0 到 L8，一级一级解锁自然拼读的超能力！</p>
      </motion.section>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState title="课程列表加载失败" onRetry={load} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(levels?.levels ?? []).map((lv, i) => (
            <motion.button
              key={lv.level}
              type="button"
              {...enterFadeUp(0.04 * i)}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              className="text-left"
              onClick={() => setActiveLevel(lv.level)}
              aria-label={`进入 ${lv.title}`}
            >
              <Card className="h-full rounded-2xl transition-colors hover:border-primary/40">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-center justify-between">
                    <Badge className={cn("rounded-full px-3 text-white", levelColor(lv.level))}>
                      L{lv.level}
                    </Badge>
                    <span className="text-xs font-medium text-muted-foreground">
                      {lv.ruleCount} 条规则 · {lv.wordCount} 词
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-lg font-extrabold">{lv.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{lv.subtitle}</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-primary">
                    <Play className="size-4" aria-hidden />
                    开始学习
                  </span>
                </CardContent>
              </Card>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- 级详情 ---------- */

function LevelDetail({ level, onBack }: { level: number; onBack: () => void }) {
  const [detail, setDetail] = useState<LevelDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openRuleId, setOpenRuleId] = useState<string | null>(null);
  const [practicing, setPracticing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getCurriculumLevel(level);
      setDetail(data);
      setOpenRuleId(data.rules?.[0]?.id ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [level]);

  useEffect(() => {
    void load();
  }, [load]);

  if (practicing && detail) {
    return (
      <PracticeSession
        words={detail.practiceWords ?? []}
        distractorPool={[...(detail.practiceWords ?? []), ...detail.rules.flatMap((r) => r.examples ?? [])]}
        onExit={() => setPracticing(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="size-11 rounded-full" onClick={onBack} aria-label="返回课程列表">
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-extrabold md:text-2xl">
            L{level} · {detail?.title ?? "加载中…"}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{detail?.subtitle ?? ""}</p>
        </div>
      </div>

      {loading ? (
        <LoadingBlock label="正在打开课程…" />
      ) : error ? (
        <ErrorState title="课程内容加载失败" onRetry={load} />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {(detail?.rules ?? []).map((rule, i) => (
              <motion.div key={rule.id} {...enterFadeUp(0.04 * i)}>
                <Collapsible
                  open={openRuleId === rule.id}
                  onOpenChange={(o) => setOpenRuleId(o ? rule.id : null)}
                >
                  <Card className="rounded-2xl">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex w-full items-center justify-between gap-3 p-4 text-left">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Badge variant="secondary" className="shrink-0 rounded-full bg-orange-100 font-mono text-xs text-orange-700">
                            {rule.pattern}
                          </Badge>
                          <p className="truncate font-bold">{rule.name}</p>
                        </div>
                        <ChevronDown
                          className={cn(
                            "size-5 shrink-0 text-muted-foreground transition-transform",
                            openRuleId === rule.id && "rotate-180"
                          )}
                          aria-hidden
                        />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="flex flex-col gap-4 border-t border-dashed px-4 pb-4 pt-4">
                        <p className="text-sm leading-relaxed text-muted-foreground">{rule.description}</p>
                        {rule.tip ? (
                          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5">
                            <Quote className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                            <p className="text-sm font-medium text-amber-700">口诀：{rule.tip}</p>
                          </div>
                        ) : null}
                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                            示例词（点喇叭听发音）
                          </p>
                          {(rule.examples ?? []).map((w) => (
                            <ExampleWordRow key={w.id} word={w} />
                          ))}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              </motion.div>
            ))}
          </div>

          {detail?.practiceWords?.length ? (
            <Button size="lg" className="h-12 rounded-2xl text-base font-bold" onClick={() => setPracticing(true)}>
              <PencilLine className="size-5" aria-hidden />
              开始拼读小练习
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function ExampleWordRow({ word }: { word: WordDTO }) {
  const { speak } = useSpeech();
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-base font-bold">
            {word.headword}
            <span className="ml-2 text-xs font-normal text-muted-foreground">/{word.ipa}/</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">{word.translation}</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-9 shrink-0 rounded-full"
          onClick={() => void speak(word.headword)}
          aria-label={`播放 ${word.headword} 的发音`}
        >
          <Volume2 className="size-4" aria-hidden />
        </Button>
      </div>
      {word.graphemes?.length ? <PhonemeBlocks word={word} size="sm" /> : null}
    </div>
  );
}

/* ---------- 拼读小练习（4 选 1） ---------- */

interface PracticeResult {
  word: WordDTO;
  correct: boolean;
}

function PracticeSession({
  words,
  distractorPool,
  onExit,
}: {
  words: WordDTO[];
  distractorPool: WordDTO[];
  onExit: () => void;
}) {
  const { speak } = useSpeech();
  const questions = useMemo(() => shuffle(words).slice(0, 8), [words]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<WordDTO | null>(null);
  const [results, setResults] = useState<PracticeResult[]>([]);

  const current = questions[index];
  const finished = index >= questions.length;
  const correctCount = results.filter((r) => r.correct).length;

  const options = useMemo(() => {
    if (!current) return [];
    const seen = new Set<string>();
    const pool = distractorPool.filter((w) => {
      if (w.id === current.id || seen.has(w.headword)) return false;
      seen.add(w.headword);
      return true;
    });
    const sameLen = shuffle(pool.filter((w) => w.headword.length === current.headword.length));
    const others = shuffle(pool.filter((w) => w.headword.length !== current.headword.length));
    const picks = [...sameLen, ...others].slice(0, 3);
    return shuffle([current, ...picks]);
    // 每题生成一次选项即可
  }, [current, distractorPool]);

  /* 出题后自动播放发音 */
  useEffect(() => {
    if (current && !selected) void speak(current.headword);
  }, [current, selected, speak]);

  const choose = (w: WordDTO) => {
    if (selected || !current) return;
    setSelected(w);
    setResults((r) => [...r, { word: current, correct: w.id === current.id }]);
  };

  const next = () => {
    setSelected(null);
    setIndex((i) => i + 1);
  };

  const restart = () => {
    setResults([]);
    setSelected(null);
    setIndex(0);
  };

  if (finished) {
    const accuracy = results.length ? Math.round((correctCount / results.length) * 100) : 0;
    const wrongList = results.filter((r) => !r.correct);
    return (
      <div className="flex flex-col items-center gap-6">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <Trophy className="size-7" aria-hidden />
          </span>
          <h2 className="text-2xl font-extrabold">练习完成！</h2>
          <AccuracyRing percent={accuracy} subLabel={`答对 ${correctCount} / ${results.length} 题`} />
        </motion.div>

        {wrongList.length > 0 ? (
          <Card className="w-full rounded-2xl">
            <CardContent className="p-4">
              <p className="mb-3 font-bold">错题回看（点喇叭重听）</p>
              <div className="flex flex-col gap-2">
                {wrongList.map((r) => (
                  <WrongReviewRow key={r.word.id} word={r.word} />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Button variant="outline" className="h-12 flex-1 rounded-2xl text-base font-bold" onClick={restart}>
            <RotateCcw className="size-5" aria-hidden />
            再练一次
          </Button>
          <Button className="h-12 flex-1 rounded-2xl text-base font-bold" onClick={onExit}>
            返回课程
          </Button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="icon" className="size-11 rounded-full" onClick={onExit} aria-label="退出练习">
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <Progress value={(index / questions.length) * 100} className="h-2.5 flex-1" aria-label={`第 ${index + 1} 题，共 ${questions.length} 题`} />
        <span className="shrink-0 text-sm font-bold text-muted-foreground">
          {index + 1} / {questions.length}
        </span>
      </div>

      <motion.div key={current.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-5 p-6">
            <p className="text-sm text-muted-foreground">听发音，选出正确的单词</p>
            <Button
              size="icon"
              className="size-16 rounded-full shadow-md"
              onClick={() => void speak(current.headword)}
              aria-label="再听一遍发音"
            >
              <Play className="size-7" aria-hidden />
            </Button>

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {options.map((w) => {
                const isAnswer = w.id === current.id;
                const isPicked = selected?.id === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => choose(w)}
                    disabled={!!selected}
                    aria-label={`选项 ${w.headword}`}
                    className={cn(
                      "min-h-12 rounded-2xl border-2 px-4 py-3 font-mono text-lg font-bold transition-colors",
                      !selected && "border-border bg-card hover:border-primary hover:bg-accent",
                      selected && isAnswer && "border-emerald-500 bg-emerald-50 text-emerald-700",
                      selected && isPicked && !isAnswer && "border-rose-500 bg-rose-50 text-rose-600",
                      selected && !isAnswer && !isPicked && "border-border bg-card opacity-50"
                    )}
                  >
                    {w.headword}
                  </button>
                );
              })}
            </div>

            {selected ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full">
                <div
                  className={cn(
                    "mb-3 rounded-xl px-3 py-2 text-sm font-bold",
                    selected.id === current.id ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
                  )}
                >
                  {selected.id === current.id ? "答对啦，就是这么拼！" : `正确答案是 ${current.headword}，再听一遍找找不同～`}
                </div>
                {current.graphemes?.length ? <PhonemeBlocks word={current} size="sm" /> : null}
                <p className="mt-2 text-sm text-muted-foreground">
                  {current.translation}
                  {current.ipa ? <span className="ml-2 font-mono">/{current.ipa}/</span> : null}
                </p>
                <Button className="mt-4 h-12 w-full rounded-2xl text-base font-bold" onClick={next}>
                  下一题
                </Button>
              </motion.div>
            ) : null}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function WrongReviewRow({ word }: { word: WordDTO }) {
  const { speak } = useSpeech();
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-mono font-bold">
          {word.headword}
          <span className="ml-2 text-xs font-normal text-muted-foreground">/{word.ipa}/</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">{word.translation}</p>
      </div>
      <Button
        variant="outline"
        size="icon"
        className="size-9 shrink-0 rounded-full"
        onClick={() => void speak(word.headword)}
        aria-label={`重听 ${word.headword}`}
      >
        <Volume2 className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
