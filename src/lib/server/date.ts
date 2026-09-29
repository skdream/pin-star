/**
 * 拼读星球 PhonicsStar — 服务端日期工具（Asia/Shanghai）
 * DailyStat.date、stats.weekly 均使用东八区日界。
 */

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 把绝对时间平移到东八区后取 YYYY-MM-DD */
export function shanghaiDate(d: Date = new Date()): string {
  return new Date(d.getTime() + SHANGHAI_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** 东八区某日期字符串对应的"当地当天 00:00"的绝对时间 */
export function shanghaiDateStart(dateStr: string): Date {
  return new Date(Date.parse(`${dateStr}T00:00:00+08:00`));
}

/** 最近 n 天（含今天）的上海日期字符串，升序 */
export function recentShanghaiDates(n: number, now: Date = new Date()): string[] {
  const today = shanghaiDate(now);
  const start = shanghaiDateStart(today);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(shanghaiDate(new Date(start.getTime() - i * 86400_000)));
  }
  return out;
}
