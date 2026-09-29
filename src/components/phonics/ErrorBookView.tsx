"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { BookX, Check, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSpeech } from "@/hooks/use-speech";
import { ERROR_TYPE_LABELS, getErrorBook, resolveError, type ErrorBookDTO, type ErrorBookItem } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { LetterFeedback, diffLetters } from "./LetterFeedback";
import { EmptyState, enterFadeUp, ErrorState, ERROR_TYPE_BADGE_CLS } from "./shared";

function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "";
  try {
    return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
  } catch {
    return iso;
  }
}

export function ErrorBookView() {
  const { speak } = useSpeech();
  const [data, setData] = useState<ErrorBookDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await getErrorBook();
      setData(d);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 标记已掌握：乐观更新移除，失败回滚 */
  const resolve = useCallback(
    async (wordId: string, snapshot: ErrorBookDTO | null) => {
      if (!snapshot || resolvingId) return;
      setResolvingId(wordId);
      setData({
        groups: snapshot.groups
          .map((g) => {
            const items = g.items.filter((it) => it.word.id !== wordId);
            return { ...g, items, count: items.length };
          })
          .filter((g) => g.items.length > 0),
      });
      try {
        await resolveError(wordId);
        toast.success("已标记为掌握，太棒了！");
      } catch {
        setData(snapshot);
        toast.error("操作失败，请重试");
      } finally {
        setResolvingId(null);
      }
    },
    [resolvingId]
  );

  const groups = data?.groups ?? [];
  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">错词本</h1>
        <p className="mt-1 text-sm text-muted-foreground">错过的词都在这里集合，一个个把它们赢回来！</p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : error ? (
        <ErrorState title="错词本加载失败" onRetry={load} />
      ) : totalCount === 0 ? (
        <EmptyState
          icon={BookX}
          title="错词本是空的，太棒了！"
          description="到现在还没有写错过的单词，保持下去；写错了也别怕，这里会帮你收集起来。"
        />
      ) : (
        groups.map((g, gi) => (
          <motion.section key={g.errorType} {...enterFadeUp(0.04 * gi)} aria-label={`${g.label}分组`}>
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-bold",
                      ERROR_TYPE_BADGE_CLS[g.errorType] ?? "bg-secondary text-secondary-foreground"
                    )}
                  >
                    {ERROR_TYPE_LABELS[g.errorType] ?? g.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{g.items.length} 个词</span>
                </div>

                <div className="flex max-h-96 flex-col gap-3 overflow-y-auto nice-scrollbar pr-1">
                  {g.items.map((it) => (
                    <ErrorItemCard
                      key={`${it.word.id}-${it.lastAt}`}
                      item={it}
                      resolving={resolvingId === it.word.id}
                      onPlay={() => void speak(it.word.headword)}
                      onResolve={() => void resolve(it.word.id, data)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.section>
        ))
      )}
    </div>
  );
}

function ErrorItemCard({
  item,
  resolving,
  onPlay,
  onResolve,
}: {
  item: ErrorBookItem;
  resolving: boolean;
  onPlay: () => void;
  onResolve: () => void;
}) {
  const feedback = diffLetters(item.expected, item.actual);
  return (
    <div className="rounded-xl border border-border/70 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-base font-bold">
            {item.word.headword}
            {item.word.ipa ? <span className="ml-2 text-xs font-normal text-muted-foreground">/{item.word.ipa}/</span> : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">{item.word.translation}</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="size-10 rounded-full"
            onClick={onPlay}
            aria-label={`播放 ${item.word.headword}`}
          >
            <Volume2 className="size-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10 rounded-full px-3 text-xs"
            onClick={onResolve}
            disabled={resolving}
            aria-label={`标记 ${item.word.headword} 已掌握`}
          >
            {resolving ? "处理中…" : (
              <>
                <Check className="size-4 text-emerald-600" aria-hidden />
                已掌握
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <LetterFeedback feedback={feedback} size="sm" />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        应写 <span className="font-mono font-bold text-emerald-700">{item.expected}</span>
        <span className="mx-1.5">·</span>
        你写了 <span className="font-mono font-bold text-rose-600">{item.actual}</span>
        <span className="mx-1.5">·</span>
        错了 {item.count} 次
        {item.lastAt ? <span className="ml-1.5">（上次 {relativeTime(item.lastAt)}）</span> : null}
      </p>
    </div>
  );
}
