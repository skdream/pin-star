"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Clock, Flame, NotebookPen, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getStats, pct, shortDate, type StatsDTO } from "@/lib/api-client";
import { EmptyState, enterFadeUp, ErrorState, StatMiniCard } from "./shared";

/** 图表用暖色系（recharts 属性里用 CSS 变量兼容性不稳，直接给色值） */
const C = {
  orange: "#f97316",
  amber: "#f59e0b",
  emerald: "#10b981",
  rose: "#f43f5e",
  teal: "#14b8a6",
};
const PIE_COLORS = [C.orange, C.amber, C.emerald, C.rose, C.teal];

export function ReportView() {
  const [stats, setStats] = useState<StatsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const s = await getStats();
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

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-9 w-40 rounded-xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (error || !stats) {
    return <ErrorState title="学习报告加载失败" description="可能是网络开小差了，或者后端服务还没准备好。" onRetry={load} />;
  }

  const weekly = (stats.weekly ?? []).map((w) => ({
    ...w,
    label: shortDate(w.date),
    accuracyPct: pct(w.accuracy),
  }));
  const errorDist = (stats.errorDistribution ?? []).map((e) => ({
    name: e.label || e.errorType,
    value: e.count,
  }));

  return (
    <div className="flex flex-col gap-5">
      <motion.div {...enterFadeUp()}>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">学习报告</h1>
        <p className="mt-1 text-sm text-muted-foreground">给爸爸妈妈看的学习小结，进步看得见！</p>
      </motion.div>

      {/* 统计卡行 */}
      <motion.section {...enterFadeUp(0.05)} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatMiniCard
          icon={Flame}
          value={`${stats.streakDays} 天`}
          label="连续打卡"
          iconClass="bg-orange-100 text-orange-600"
        />
        <StatMiniCard
          icon={NotebookPen}
          value={`${stats.totalDictations} 次`}
          label="累计听写"
          iconClass="bg-amber-100 text-amber-600"
        />
        <StatMiniCard
          icon={Sparkles}
          value={`${stats.masteredWords} / ${stats.totalWords}`}
          label="掌握词数 / 总词数"
          iconClass="bg-emerald-100 text-emerald-600"
        />
        <StatMiniCard
          icon={Clock}
          value={`${stats.today.minutes} 分钟`}
          label="今日学习时长"
          iconClass="bg-teal-100 text-teal-600"
        />
      </motion.section>

      {/* 周正确率折线 */}
      <motion.section {...enterFadeUp(0.1)}>
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <h2 className="mb-4 font-bold">近 7 天听写正确率（%）</h2>
            {weekly.length === 0 ? (
              <EmptyStateSkeletonText text="还没有听写记录，先去听写一轮吧！" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weekly} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0e6d2" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="accuracyPct"
                      name="正确率%"
                      stroke={C.orange}
                      strokeWidth={3}
                      dot={{ r: 4, fill: C.orange }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {/* 每日听写量柱状 */}
      <motion.section {...enterFadeUp(0.15)}>
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <h2 className="mb-4 font-bold">每日听写量（近 7 天）</h2>
            {weekly.length === 0 ? (
              <EmptyStateSkeletonText text="还没有听写记录，先去听写一轮吧！" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly} margin={{ top: 8, right: 12, bottom: 0, left: -18 }} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0e6d2" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="dictationCount" name="听写词数" fill={C.orange} radius={[6, 6, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="correctCount" name="答对词数" fill={C.emerald} radius={[6, 6, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {/* 错因分布饼图 */}
      <motion.section {...enterFadeUp(0.2)}>
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <h2 className="mb-4 font-bold">错因分布</h2>
            {errorDist.length === 0 ? (
              <EmptyStateSkeletonText text="暂时没有错误记录，说明你写得很棒！" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={errorDist} dataKey="value" nameKey="name" outerRadius={90} innerRadius={45} paddingAngle={3} strokeWidth={2}>
                      {errorDist.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.section>
    </div>
  );
}

function EmptyStateSkeletonText({ text }: { text: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-xl bg-secondary/40 text-sm text-muted-foreground">
      {text}
    </div>
  );
}
