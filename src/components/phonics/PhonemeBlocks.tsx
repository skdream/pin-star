"use client";

import { Turtle, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpeech } from "@/hooks/use-speech";
import type { Grapheme, PhonemeFeedbackItem, WordDTO } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  sm: { chip: "px-2 py-1 gap-0.5", letter: "text-sm", phoneme: "text-[10px]" },
  md: { chip: "px-3 py-1.5 gap-1", letter: "text-base", phoneme: "text-xs" },
  lg: { chip: "px-4 py-2 gap-1", letter: "text-xl", phoneme: "text-sm" },
} as const;

interface PhonemeBlocksProps {
  word: WordDTO;
  size?: keyof typeof SIZE_STYLES;
  /** 隐藏字母、只显示音素（听写「音素块」提示模式） */
  hideLetters?: boolean;
  /** 点击某个音素块时的自定义行为；默认播放整词慢速（单音素无法 TTS，点击听整词找该音） */
  onPlayPhoneme?: (g: Grapheme) => void;
  /** 批改返回的音素反馈：diff 的块用 rose 虚线高亮 */
  phonemeFeedback?: PhonemeFeedbackItem[];
  className?: string;
}

/**
 * 音素块：每个 grapheme 一个圆角 chip（上字母、下音素），
 * x 标记（不规则/静音）用 rose 边框 + "!" 角标。
 */
export function PhonemeBlocks({
  word,
  size = "md",
  hideLetters = false,
  onPlayPhoneme,
  phonemeFeedback,
  className,
}: PhonemeBlocksProps) {
  const { speak } = useSpeech();
  const s = SIZE_STYLES[size];
  const graphemes = word?.graphemes ?? [];

  const playWordSlow = () => void speak(word.headword, { speed: "slow" });

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap gap-2">
        {graphemes.length === 0 ? (
          <span className="font-mono text-sm text-muted-foreground">{word.headword}</span>
        ) : (
          graphemes.map((gr, i) => {
            const diff = phonemeFeedback?.[i]?.status === "diff";
            return (
              <button
                key={`${gr.g}-${gr.p}-${i}`}
                type="button"
                onClick={onPlayPhoneme ? () => onPlayPhoneme(gr) : playWordSlow}
                aria-label={`音素块 ${gr.g}，点击听整词发音`}
                className={cn(
                  "relative flex flex-col items-center rounded-xl border-2 bg-card transition-transform hover:scale-105 active:scale-95",
                  s.chip,
                  gr.x
                    ? "border-rose-400 bg-rose-50/60"
                    : diff
                      ? "border-dashed border-rose-400"
                      : "border-amber-300"
                )}
              >
                {gr.x ? (
                  <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold leading-none text-white">
                    !
                  </span>
                ) : null}
                <span className={cn("font-mono font-bold text-foreground", s.letter, hideLetters && "sr-only")}>
                  {gr.g}
                </span>
                <span className={cn("font-mono text-muted-foreground", s.phoneme)}>{`/${gr.p}/`}</span>
              </button>
            );
          })
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-full border-amber-300 text-amber-700 hover:bg-amber-50"
          onClick={playWordSlow}
          aria-label="慢速拼读整词"
        >
          <Turtle className="size-3.5" />
          慢速拼读
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-full"
          onClick={() => void speak(word.headword)}
          aria-label="正常语速朗读整词"
        >
          <Volume2 className="size-3.5" />
          正常语速
        </Button>
      </div>
    </div>
  );
}
