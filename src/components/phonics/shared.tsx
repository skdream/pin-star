"use client";

import { Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ============ 称赞语 ============ */

export const PRAISE_WORDS = ["太棒了！", "真棒！", "了不起！", "满分！", "你真厉害！", "继续加油！"];

export function randomPraise(): string {
  return PRAISE_WORDS[Math.floor(Math.random() * PRAISE_WORDS.length)];
}

/* ============ 错因 Badge 配色 ============ */

export const ERROR_TYPE_BADGE_CLS: Record<string, string> = {
  PHONEME: "bg-orange-100 text-orange-700 border-orange-200",
  SEGMENT: "bg-amber-100 text-amber-700 border-amber-200",
  PATTERN: "bg-teal-100 text-teal-700 border-teal-200",
  IRREGULAR: "bg-rose-100 text-rose-700 border-rose-200",
  SUFFIX: "bg-purple-100 text-purple-700 border-purple-200",
  MEMORY: "bg-stone-100 text-stone-600 border-stone-200",
  HANDWRITING: "bg-lime-100 text-lime-700 border-lime-200",
};

/* ============ 问候 / 每日一句 ============ */

export function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 6) return "夜深了，早点休息哦";
  if (h < 9) return "早上好";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export const DAILY_QUOTES = [
  "每天进步一点点，单词越拼越顺口！",
  "拼读是单词的密码，你已经拿到钥匙啦！",
  "大声读出来，耳朵和嘴巴一起学英语！",
  "写错的词都是升级的经验值！",
  "坚持听写，你会看见自己的进步！",
  "会拼读的孩子，背单词又快又牢！",
];

export function dailyQuote(date: Date): string {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

/* ============ 加载 / 错误 / 空态 ============ */

export function LoadingBlock({ label = "加载中…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-muted-foreground" role="status">
      <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({
  title = "加载失败了",
  description = "可能是网络开小差了，或者后端服务还没准备好。",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-rose-50 text-2xl" aria-hidden>
          🙈
        </span>
        <div>
          <p className="font-bold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {onRetry ? (
          <Button variant="outline" className="h-11 rounded-full" onClick={onRetry}>
            <RefreshCw className="size-4" />
            重试
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon className="size-6" aria-hidden />
        </span>
        <div>
          <p className="font-bold">{title}</p>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/* ============ 正确率圆环（SVG 自绘） ============ */

export function AccuracyRing({
  percent,
  size = 168,
  stroke = 16,
  color = "var(--chart-3)",
  centerLabel,
  subLabel,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: string;
  centerLabel?: React.ReactNode;
  subLabel?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`正确率 ${clamped}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--secondary)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="text-4xl font-extrabold tracking-tight">{centerLabel ?? `${clamped}%`}</span>
        {subLabel ? <span className="text-xs text-muted-foreground">{subLabel}</span> : null}
      </div>
    </div>
  );
}

/* ============ 卡片入场动画（fade + up） ============ */

export const enterFadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, delay },
});

export function StatMiniCard({
  icon: Icon,
  value,
  label,
  iconClass,
  className,
}: {
  icon: LucideIcon;
  value: React.ReactNode;
  label: string;
  iconClass?: string;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-2xl", className)}>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary", iconClass)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold leading-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
