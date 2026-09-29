"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  BookX,
  Check,
  Home,
  Loader2,
  PencilLine,
  Play,
  RefreshCw,
  Search,
  Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSpeech } from "@/hooks/use-speech";
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  checkWord,
  getBooks,
  getWords,
  postDictationWords,
  updateUserApi,
  type BookDTO,
  type CheckResult,
  type DictationWordsReq,
  type HintLevel,
  type Speed,
  type WordDTO,
} from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CheckFeedback } from "./CheckFeedback";
import { PhonemeBlocks } from "./PhonemeBlocks";
import { AccuracyRing, ErrorState, LoadingBlock } from "./shared";

type Stage = "setup" | "writing" | "result";

interface Attempt {
  word: WordDTO;
  correct: boolean;
  result: CheckResult;
}

export function DictationView() {
  const [stage, setStage] = useState<Stage>("setup");
  const [queue, setQueue] = useState<WordDTO[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [starting, setStarting] = useState(false);

  const setView = useAppStore((s) => s.setView);

  const handleStart = useCallback(async (req: DictationWordsReq) => {
    setStarting(true);
    try {
      const { words } = await postDictationWords(req);
      if (!words?.length) {
        toast("这个词单里还没有单词，换一个试试～");
        return;
      }
      setQueue(words);
      setAttempts([]);
      setStage("writing");
    } catch {
      toast.error("获取听写词单失败，请稍后再试");
    } finally {
      setStarting(false);
    }
  }, []);

  const handleFinish = useCallback((a: Attempt[]) => {
    setAttempts(a);
    setStage("result");
  }, []);

  const retryWrong = useCallback(() => {
    const seen = new Set<string>();
    const wrongWords: WordDTO[] = [];
    for (const a of attempts) {
      if (!a.correct && !seen.has(a.word.id)) {
        seen.add(a.word.id);
        wrongWords.push(a.word);
      }
    }
    if (!wrongWords.length) return;
    setQueue(wrongWords);
    setStage("writing");
  }, [attempts]);

  const backToSetup = useCallback(() => {
    setQueue([]);
    setAttempts([]);
    setStage("setup");
  }, []);

  if (stage === "writing") {
    return (
      <WritingStage
        key={queue.map((w) => w.id).join(",")}
        words={queue}
        onFinish={handleFinish}
        onQuit={backToSetup}
      />
    );
  }

  if (stage === "result") {
    return (
      <ResultStage
        attempts={attempts}
        onRetryWrong={retryWrong}
        onChangeList={backToSetup}
        onHome={() => setView("home")}
      />
    );
  }

  return <SetupStage starting={starting} onStart={handleStart} />;
}

/* ============================================================
 * 阶段一：setup 选词单 + 设置
 * ============================================================ */

function volumeLabel(v: number | string): string {
  if (v === 1 || v === "1") return "上册";
  if (v === 2 || v === "2") return "下册";
  return String(v);
}

function SetupStage({ starting, onStart }: { starting: boolean; onStart: (req: DictationWordsReq) => void }) {
  const [tab, setTab] = useState<"unit" | "errorbook" | "custom">("unit");

  /* 设置直接读写 store（与「设置」页共享默认值），并防抖落库（PUT /api/user） */
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const playCount = user.settings.playCount ?? 2;
  const speed = user.settings.speed ?? "normal";
  const hintLevel = user.settings.hintLevel ?? "none";
  const autoNext = user.settings.autoNext ?? true;

  /* 本地即时生效 + 累积补丁 600ms 防抖落库；直接调 updateUserApi（不走 store.updateUser），
   * 避免响应回写覆盖本地较新的选择；落库失败保留本地值，下次改动会重试 */
  const pendingPatch = useRef<Partial<typeof user.settings>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushPatch = useCallback(() => {
    if (!Object.keys(pendingPatch.current).length) return;
    const patch = { settings: { ...pendingPatch.current } };
    pendingPatch.current = {};
    updateUserApi(patch).catch(() => {
      Object.assign(pendingPatch.current, patch.settings);
    });
  }, []);
  const patchSettings = (p: Partial<typeof user.settings>) => {
    setUser({ ...user, settings: { ...user.settings, ...p } });
    Object.assign(pendingPatch.current, p);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushPatch, 600);
  };
  /* 组件卸载时把尚未落库的补丁立即发出 */
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (Object.keys(pendingPatch.current).length) {
        updateUserApi({ settings: { ...pendingPatch.current } }).catch(() => {});
        pendingPatch.current = {};
      }
    },
    []
  );

  /* ---- 教材同步（选择随账号持久化：User.settings.dictBookId/dictUnitId） ---- */
  const [books, setBooks] = useState<BookDTO[] | null>(null);
  const [booksError, setBooksError] = useState(false);

  const loadBooks = useCallback(async () => {
    setBooksError(false);
    try {
      const data = await getBooks();
      setBooks(data.books ?? []);
    } catch {
      setBooksError(true);
    }
  }, []);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  /* 选中值直接从 settings 派生：保存的 id 已失效（教材下架/换设备）则回退未选 */
  const savedBookId = user.settings.dictBookId ?? "";
  const savedUnitId = user.settings.dictUnitId ?? "";
  const bookId = books?.some((b) => b.id === savedBookId) ? savedBookId : "";
  const book = books?.find((b) => b.id === bookId);
  const unitId = book?.units?.some((u) => u.id === savedUnitId) ? savedUnitId : "";

  const selectBook = (v: string) => patchSettings({ dictBookId: v, dictUnitId: "" });
  const selectUnit = (v: string) => patchSettings({ dictUnitId: v });

  /* ---- 自由选词 ---- */
  const [customWords, setCustomWords] = useState<WordDTO[] | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const reqSeq = useRef(0);

  const loadCustom = useCallback(async () => {
    const seq = ++reqSeq.current;
    setCustomLoading(true);
    setCustomError(false);
    try {
      const data = await getWords({
        q: query || undefined,
        category: category === "all" ? undefined : category,
        limit: 50,
      });
      if (seq === reqSeq.current) setCustomWords(data.words ?? []);
    } catch {
      if (seq === reqSeq.current) setCustomError(true);
    } finally {
      if (seq === reqSeq.current) setCustomLoading(false);
    }
  }, [query, category]);

  useEffect(() => {
    const t = setTimeout(() => void loadCustom(), 300);
    return () => clearTimeout(t);
  }, [loadCustom]);

  const toggleWord = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ---- 开始 ---- */
  const tryStart = () => {
    let req: DictationWordsReq | null = null;
    if (tab === "unit") {
      if (!bookId || !unitId) {
        toast("先选好教材和单元哦～");
        return;
      }
      req = { source: "unit", unitId };
    } else if (tab === "errorbook") {
      req = { source: "errorbook" };
    } else {
      if (selectedIds.size === 0) {
        toast("至少勾选 1 个单词哦～");
        return;
      }
      req = { source: "custom", wordIds: [...selectedIds] };
    }
    onStart(req);
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">报听写</h1>
        <p className="mt-1 text-sm text-muted-foreground">AI 来报听写，爸爸妈妈可以休息啦！</p>
      </div>

      {/* 词单选择 */}
      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <BookOpen className="size-4 text-primary" aria-hidden />
            选择词单
          </h2>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="mb-4 grid h-11 w-full grid-cols-3 rounded-xl">
              <TabsTrigger value="unit" className="rounded-lg text-sm">教材同步</TabsTrigger>
              <TabsTrigger value="errorbook" className="rounded-lg text-sm">错词本</TabsTrigger>
              <TabsTrigger value="custom" className="rounded-lg text-sm">自由选词</TabsTrigger>
            </TabsList>

            <TabsContent value="unit" className="mt-0">
              {booksError ? (
                <ErrorState title="教材列表加载失败" onRetry={loadBooks} />
              ) : books === null ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-11 w-full rounded-xl" />
                  <Skeleton className="h-11 w-full rounded-xl" />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div>
                    <Label htmlFor="book-select" className="mb-1.5 block text-sm">教材</Label>
                    <Select
                      value={bookId}
                      onValueChange={selectBook}
                    >
                      <SelectTrigger id="book-select" className="h-11 w-full rounded-xl text-base">
                        <SelectValue placeholder="选择教材" />
                      </SelectTrigger>
                      <SelectContent>
                        {(books ?? []).map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.publisher} · {b.grade}年级 {volumeLabel(b.volume)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="unit-select" className="mb-1.5 block text-sm">单元</Label>
                    <Select value={unitId} onValueChange={selectUnit} disabled={!book}>
                      <SelectTrigger id="unit-select" className="h-11 w-full rounded-xl text-base">
                        <SelectValue placeholder={book ? "选择单元" : "先选教材"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(book?.units ?? []).map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}（{u.wordCount} 词）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="errorbook" className="mt-0">
              <div className="flex items-start gap-3 rounded-xl bg-rose-50 px-4 py-3.5">
                <BookX className="mt-0.5 size-5 shrink-0 text-rose-500" aria-hidden />
                <div>
                  <p className="text-sm font-bold text-rose-700">从错词本出发</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-rose-600/90">
                    把之前写错过的词再听写一遍，错过的词要亲手赢回来！
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="custom" className="mt-0">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜索单词"
                      className="h-11 rounded-xl pl-9 text-base"
                      aria-label="搜索单词"
                    />
                  </div>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-11 w-full rounded-xl text-base sm:w-36" aria-label="按分类筛选">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部分类</SelectItem>
                      {CATEGORY_KEYS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {CATEGORY_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {customError ? (
                  <ErrorState title="词库加载失败" onRetry={loadCustom} />
                ) : customLoading ? (
                  <LoadingBlock label="正在找单词…" />
                ) : (customWords ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">没有找到匹配的单词，换个关键词试试～</p>
                ) : (
                  <div
                    className="nice-scrollbar max-h-64 overflow-y-auto rounded-xl border border-border/70"
                    title="单词列表，可滚动"
                  >
                    {/* Radix ScrollArea 无确定高度会被内容撑开（不出现滚动条），改用原生溢出滚动 */}
                    <div className="divide-y divide-border/60">
                      {(customWords ?? []).map((w) => (
                        <label
                          key={w.id}
                          className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent"
                        >
                          <Checkbox
                            checked={selectedIds.has(w.id)}
                            onCheckedChange={() => toggleWord(w.id)}
                            aria-label={`选择 ${w.headword}`}
                            className="size-5"
                          />
                          <span className="font-mono font-bold">{w.headword}</span>
                          <span className="font-mono text-xs text-muted-foreground">/{w.ipa}/</span>
                          <span className="ml-auto truncate text-xs text-muted-foreground">{w.translation}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">已选 {selectedIds.size} 个单词</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 听写设置 */}
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col gap-4 p-5">
          <h2 className="flex items-center gap-2 font-bold">
            <PencilLine className="size-4 text-primary" aria-hidden />
            听写设置
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block text-sm">每个词播放次数</Label>
              <Select value={String(playCount)} onValueChange={(v) => patchSettings({ playCount: Number(v) })}>
                <SelectTrigger className="h-11 w-full rounded-xl text-base" aria-label="播放次数">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 遍</SelectItem>
                  <SelectItem value="2">2 遍</SelectItem>
                  <SelectItem value="3">3 遍</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">提示级别</Label>
              <Select value={hintLevel} onValueChange={(v) => patchSettings({ hintLevel: v as HintLevel })}>
                <SelectTrigger className="h-11 w-full rounded-xl text-base" aria-label="提示级别">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">无提示</SelectItem>
                  <SelectItem value="first">首字母提示</SelectItem>
                  <SelectItem value="chinese">中文释义</SelectItem>
                  <SelectItem value="phonemes">音素块</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-sm">语速</Label>
            <RadioGroup
              value={speed}
              onValueChange={(v) => patchSettings({ speed: v as Speed })}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="normal" id="speed-normal" />
                <Label htmlFor="speed-normal" className="font-normal">正常语速</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="slow" id="speed-slow" />
                <Label htmlFor="speed-slow" className="font-normal">慢速（更适合低年级）</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3">
            <div>
              <Label htmlFor="auto-next" className="text-sm font-bold">答对后自动下一个</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">不用点按钮，节奏更快</p>
            </div>
            <Switch id="auto-next" checked={autoNext} onCheckedChange={(v) => patchSettings({ autoNext: v })} />
          </div>
        </CardContent>
      </Card>

      <Button
        size="lg"
        className="h-14 rounded-2xl text-lg font-bold shadow-md"
        onClick={tryStart}
        disabled={starting}
      >
        {starting ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Play className="size-5" aria-hidden />}
        {starting ? "正在准备单词…" : "开始听写"}
      </Button>
    </div>
  );
}

/* ============================================================
 * 阶段二：writing 听写进行中
 * ============================================================ */

function HintArea({ level, word }: { level: HintLevel; word: WordDTO }) {
  if (level === "first") {
    const masked = word.headword
      .split("")
      .map((c, i) => (i === 0 ? c : "_"))
      .join(" ");
    return <p className="font-mono text-2xl font-bold tracking-[0.25em] text-foreground/80">{masked}</p>;
  }
  if (level === "chinese") {
    return <p className="text-lg font-medium text-foreground/80">释义：{word.translation}</p>;
  }
  if (level === "phonemes") {
    return <PhonemeBlocks word={word} size="sm" hideLetters />;
  }
  return <p className="text-sm text-muted-foreground">仔细听，把它拼出来吧！</p>;
}

function WritingStage({
  words,
  onFinish,
  onQuit,
}: {
  words: WordDTO[];
  onFinish: (attempts: Attempt[]) => void;
  onQuit: () => void;
}) {
  const { speak, speakTimes, stop, speaking } = useSpeech();

  const settings = useAppStore((s) => s.user.settings);
  const playCount = settings.playCount ?? 2;
  const speed = settings.speed ?? "normal";
  const hintLevel = settings.hintLevel ?? "none";
  const autoNext = settings.autoNext ?? true;

  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  const attemptsRef = useRef<Attempt[]>([]);
  const startRef = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const word = words[index];
  const progress = ((index + (result ? 1 : 0)) / Math.max(1, words.length)) * 100;

  /* 换词时：重置计时 + 自动播放 N 遍 + 聚焦输入框 */
  useEffect(() => {
    if (!word) return;
    startRef.current = Date.now();
    if (!result) {
      speakTimes(word.headword, { times: playCount, speed, intervalMs: 1500 });
    }
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [word, result, playCount, speed, speakTimes]);

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
        mode: "DICTATION",
        durationMs: Date.now() - startRef.current,
      });
      setResult(res);
      attemptsRef.current = [
        ...attemptsRef.current,
        { word: res.word ?? word, correct: res.correct, result: res },
      ];
    } catch {
      toast.error("提交失败，请再试一次");
    } finally {
      setChecking(false);
    }
  }, [answer, checking, result, word, stop]);

  const next = useCallback(() => {
    if (index + 1 >= words.length) {
      onFinish(attemptsRef.current);
      return;
    }
    setResult(null);
    setAnswer("");
    setIndex((i) => i + 1);
  }, [index, words.length, onFinish]);

  /* 答对 + 自动下一个：1.5s 后前进 */
  useEffect(() => {
    if (result?.correct && autoNext) {
      const t = setTimeout(next, 1500);
      return () => clearTimeout(t);
    }
  }, [result, autoNext, next]);

  if (!word) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* 顶部进度 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-full" onClick={onQuit} aria-label="退出听写">
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <Progress value={progress} className="h-2.5 flex-1" aria-label={`第 ${index + 1} 个，共 ${words.length} 个`} />
        <span className="shrink-0 text-sm font-bold text-muted-foreground">
          第 {index + 1} / {words.length} 词
        </span>
      </div>

      <motion.div key={word.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-5 p-6">
            {/* 大播放按钮 */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => void speak(word.headword, { speed })}
              aria-label={`重播 ${word.headword} 的发音`}
              className={cn(
                "flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-shadow hover:shadow-xl",
                speaking && "ring-4 ring-primary/30 ring-offset-2"
              )}
            >
              <Volume2 className="size-9" aria-hidden />
            </motion.button>
            <p className="-mt-2 text-xs text-muted-foreground">点喇叭可以再听一遍</p>

            {/* 提示区 */}
            <div className="flex min-h-11 w-full items-center justify-center rounded-xl bg-secondary/50 px-4 py-2.5">
              <HintArea level={hintLevel} word={word} />
            </div>

            {/* 输入 + 提交 */}
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
                  placeholder="输入你听到的单词"
                  className="h-14 rounded-2xl text-center font-mono text-2xl font-bold"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="拼写输入框"
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
                {/* 批改反馈 */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full rounded-2xl border border-border/70 bg-card p-4"
                >
                  <CheckFeedback result={result} />
                </motion.div>
                <Button
                  className="h-13 w-full rounded-2xl py-4 text-base font-bold"
                  onClick={next}
                  aria-label="下一个词"
                >
                  {index + 1 >= words.length ? "看结果" : "下一词"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

/* ============================================================
 * 阶段三：result 结果页
 * ============================================================ */

function ResultStage({
  attempts,
  onRetryWrong,
  onChangeList,
  onHome,
}: {
  attempts: Attempt[];
  onRetryWrong: () => void;
  onChangeList: () => void;
  onHome: () => void;
}) {
  const { speak } = useSpeech();
  const total = attempts.length;
  const correctCount = attempts.filter((a) => a.correct).length;
  const accuracy = total ? Math.round((correctCount / total) * 100) : 0;
  const wrong = attempts.filter((a) => !a.correct);

  useEffect(() => {
    toast.success(`听写完成！答对 ${correctCount} / ${total}`, {
      description: accuracy >= 80 ? "太厉害了，继续保持！" : "错词可以再来一轮哦～",
    });
    // 仅在进入结果页时提示一次
  }, [correctCount, total, accuracy]);

  const ringColor = accuracy >= 80 ? "var(--chart-3)" : accuracy >= 60 ? "var(--chart-2)" : "var(--chart-4)";

  return (
    <div className="flex flex-col gap-5">
      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3 pt-2 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">听写结果</h1>
        <AccuracyRing percent={accuracy} color={ringColor} subLabel={`答对 ${correctCount} / ${total} 词`} />
      </motion.div>

      {wrong.length > 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <p className="mb-3 font-bold">错词回顾（点喇叭重听）</p>
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto nice-scrollbar pr-1">
              {wrong.map((a, i) => (
                <div key={`${a.word.id}-${i}`} className="rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono font-bold">
                        {a.word.headword}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">/{a.word.ipa}/</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{a.word.translation}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-10 shrink-0 rounded-full"
                      onClick={() => void speak(a.word.headword)}
                      aria-label={`重听 ${a.word.headword}`}
                    >
                      <Volume2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                  <Badge variant="secondary" className="mt-2 rounded-full bg-rose-100 text-[11px] text-rose-700">
                    错因：{(a.result.errorTypes ?? []).length ? a.result.errorTypes.join("、") : "待分析"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-emerald-200 bg-emerald-50/60">
          <CardContent className="p-5 text-center text-sm font-bold text-emerald-700">
            全部答对，一个错词都没有，太棒了！
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {wrong.length > 0 ? (
          <Button className="h-12 flex-1 rounded-2xl text-base font-bold" onClick={onRetryWrong}>
            <RefreshCw className="size-4" aria-hidden />
            重听错词（{wrong.length}）
          </Button>
        ) : null}
        <Button variant="outline" className="h-12 flex-1 rounded-2xl text-base font-bold" onClick={onChangeList}>
          换个词单
        </Button>
        <Button variant="outline" className="h-12 flex-1 rounded-2xl text-base font-bold" onClick={onHome}>
          <Home className="size-4" aria-hidden />
          回首页
        </Button>
      </div>
    </div>
  );
}
