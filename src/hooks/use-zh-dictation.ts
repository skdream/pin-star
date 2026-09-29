"use client";

/**
 * 语文默写播放引擎（每条词语/句子读 N 遍〔报读设置可调，默认 3〕，遍间停留＝书写倒计时，
 * 默认按内容长短自适应、也可固定秒数）：
 *
 * 时序（每条）：lead-in（可选报"第几个"）→ reading ×N（遍间倒计时 gap）→ 尾停顿 → 下一条
 *
 * - 引擎策略：服务端 /api/tts（accent=zh-CN）→ 失败自动降级浏览器 speechSynthesis（中文语音）
 * - 暂停/继续：朗读中 → 暂停音频本体；停顿倒计时中 → 冻结剩余时间
 * - 重读本词：从第 1 遍重放当前条；跳过本词：直接进入下一条；结束：终止整场
 * - 单 Audio 元素：start()（用户手势内）创建并播放极短静音音频解锁，规避 iOS 自动播放限制
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ttsUrl } from "@/lib/api-client";
import {
  DEFAULT_ZH_SETTINGS,
  clampReads,
  computeGapMs,
  zhNumber,
  type ZhDictationItem,
  type ZhDictationSettings,
} from "@/lib/zh-dictation";

export type ZhSessionStatus = "idle" | "running" | "paused" | "finished";
export type ZhPhase = "lead-in" | "reading" | "gap";

export interface ZhSessionState {
  status: ZhSessionStatus;
  /** 当前条下标（0-based） */
  index: number;
  /** 当前第几遍（1..readsPerItem，上限 5） */
  rep: number;
  phase: ZhPhase;
  /** gap 阶段剩余毫秒 */
  remainMs: number;
  /** gap 阶段总毫秒（倒计时进度用） */
  gapMs: number;
  startedAt: number | null;
  endedAt: number | null;
}

const INITIAL_STATE: ZhSessionState = {
  status: "idle",
  index: 0,
  rep: 0,
  phase: "lead-in",
  remainMs: 0,
  gapMs: 0,
  startedAt: null,
  endedAt: null,
};

type WaitReason = "done" | "interrupted";
type InterruptReason = "skip" | "replay" | "stop";

interface Waiter {
  kind: "timer" | "audio" | "speech";
  resolve: (r: WaitReason) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/** 极短静音 wav：在用户手势内播放一次以解锁音频元素（iOS Safari 需要手势链） */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export function useZhDictation() {
  const [state, setState] = useState<ZhSessionState>(INITIAL_STATE);
  const stateRef = useRef<ZhSessionState>(INITIAL_STATE);

  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const gateRef = useRef<{ promise: Promise<void>; release: () => void } | null>(null);
  const interruptReasonRef = useRef<InterruptReason | null>(null);
  const waiterRef = useRef<Waiter | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const itemsRef = useRef<ZhDictationItem[]>([]);
  const settingsRef = useRef<ZhDictationSettings | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const updateState = useCallback((patch: Partial<ZhSessionState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    setState(stateRef.current);
  }, []);

  /* 浏览器语音列表异步加载（供中文 voice 选择） */
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const pickZhVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const list = voicesRef.current.length ? voicesRef.current : window.speechSynthesis.getVoices();
    const norm = (s: string) => s.replace("_", "-").toLowerCase();
    return list.find((v) => norm(v.lang) === "zh-cn") ?? list.find((v) => norm(v.lang).startsWith("zh")) ?? null;
  }, []);

  /* ============ 暂停闸门 ============ */

  const waitWhilePaused = useCallback(async () => {
    while (pausedRef.current) {
      if (!gateRef.current) {
        let release!: () => void;
        const promise = new Promise<void>((r) => {
          release = r;
        });
        gateRef.current = { promise, release };
      }
      await gateRef.current.promise;
    }
  }, []);

  const forceUnpause = useCallback(() => {
    pausedRef.current = false;
    const gate = gateRef.current;
    gateRef.current = null;
    gate?.release();
  }, []);

  /* ============ 可打断等待 ============ */

  const sleepSlice = useCallback((ms: number) => {
    return new Promise<WaitReason>((resolve) => {
      const timer = setTimeout(() => {
        if (waiterRef.current?.kind === "timer") waiterRef.current = null;
        resolve("done");
      }, ms);
      waiterRef.current = { kind: "timer", resolve, timer };
    });
  }, []);

  /** gap 等待：小步切片，可随时暂停（冻结）或打断 */
  const waitGap = useCallback(
    async (totalMs: number, onTick?: (remainMs: number) => void): Promise<WaitReason> => {
      let remaining = totalMs;
      while (remaining > 0) {
        if (interruptReasonRef.current || !runningRef.current) {
          console.warn("[zh-gap] early-exit remain=", remaining, "flag=", interruptReasonRef.current, "running=", runningRef.current);
          return "interrupted";
        }
        await waitWhilePaused();
        if (interruptReasonRef.current || !runningRef.current) return "interrupted";
        const slice = Math.min(150, remaining);
        const r = await sleepSlice(slice);
        if (r === "interrupted") return "interrupted";
        remaining -= slice;
        onTick?.(remaining);
      }
      return "done";
    },
    [sleepSlice, waitWhilePaused]
  );

  /** 打断当前朗读/等待：停止媒体并把挂起的 await 以 interrupted 结束 */
  const interruptPlayback = useCallback(() => {
    const a = audioRef.current;
    if (a) a.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* 忽略 */
      }
    }
    const w = waiterRef.current;
    if (w) {
      waiterRef.current = null;
      if (w.timer) clearTimeout(w.timer);
      w.resolve("interrupted");
    }
  }, []);

  /* ============ 单次朗读（server → browser 降级） ============ */

  const speakOnce = useCallback(
    (text: string, settings: ZhDictationSettings): Promise<WaitReason> => {
      return new Promise<WaitReason>((resolve) => {
        let settled = false;
        const finish = (r: WaitReason) => {
          if (settled) return;
          settled = true;
          waiterRef.current = null;
          resolve(r);
        };
        const chars = [...text].length;

        const startBrowser = () => {
          if (!runningRef.current) {
            finish("interrupted");
            return;
          }
          if (typeof window === "undefined" || !("speechSynthesis" in window)) {
            finish("done");
            return;
          }
          try {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = "zh-CN";
            u.rate = settings.speed === "slow" ? 0.7 : 0.95;
            const v = pickZhVoice();
            if (v) u.voice = v;
            /* 兜底：极少数环境 onend 不触发 */
            const guard = setTimeout(() => finish("done"), Math.max(5000, chars * 900));
            u.onend = () => {
              clearTimeout(guard);
              finish("done");
            };
            u.onerror = () => {
              clearTimeout(guard);
              finish("done");
            };
            waiterRef.current = { kind: "speech", resolve: (r) => finish(r), timer: guard };
            window.speechSynthesis.speak(u);
          } catch {
            finish("done");
          }
        };

        void (async () => {
          try {
            await waitWhilePaused();
            if (interruptReasonRef.current || !runningRef.current) {
              console.warn("[zh-speak] pre-fetch blocked text=", text.slice(0, 6), "flag=", interruptReasonRef.current, "running=", runningRef.current);
              finish("interrupted");
              return;
            }
            const ac = new AbortController();
            fetchAbortRef.current = ac;
            const res = await fetch(ttsUrl(text, settings.speed, "zh-CN"), { signal: ac.signal });
            if (!res.ok) throw new Error(`TTS ${res.status}`);
            const blob = await res.blob();
            await waitWhilePaused();
            if (interruptReasonRef.current || !runningRef.current) {
              console.warn("[zh-speak] post-fetch blocked text=", text.slice(0, 6), "flag=", interruptReasonRef.current, "running=", runningRef.current);
              finish("interrupted");
              return;
            }
            const a = audioRef.current;
            if (!a) {
              startBrowser();
              return;
            }
            if (blobUrlRef.current) {
              URL.revokeObjectURL(blobUrlRef.current);
              blobUrlRef.current = null;
            }
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;
            const guard = setTimeout(() => finish("done"), Math.max(6000, chars * 1200));
            a.onended = () => {
              clearTimeout(guard);
              finish("done");
            };
            a.onerror = () => {
              clearTimeout(guard);
              startBrowser();
            };
            waiterRef.current = { kind: "audio", resolve: (r) => finish(r), timer: guard };
            a.src = url;
            a.load();
            try {
              await a.play();
            } catch {
              /* 自动播放被拒 / 解码失败：暂停态交由 resume 恢复，否则降级浏览器发音 */
              clearTimeout(guard);
              if (interruptReasonRef.current || !runningRef.current) {
                finish("interrupted");
                return;
              }
              if (pausedRef.current) return;
              startBrowser();
              return;
            }
          } catch {
            startBrowser();
          }
        })();
      });
    },
    [pickZhVoice, waitWhilePaused]
  );

  /* ============ 主循环 ============ */

  const runSession = useCallback(async () => {
    const items = itemsRef.current;
    const settings = settingsRef.current ?? DEFAULT_ZH_SETTINGS;
    /** 每条读几遍（设置容错钳制 1~5） */
    const readsPerItem = clampReads(settings.readsPerItem);

    /** 读取并清空打断标记；返回动作 */
    const handleFlag = (): "continue" | "restart" | "stop" | null => {
      const f = interruptReasonRef.current;
      if (!f) return null;
      interruptReasonRef.current = null;
      if (f === "stop") return "stop";
      if (f === "skip") return "continue";
      return "restart";
    };

    let stopped = false;

    for (let i = 0; i < items.length; i++) {
      if (handleFlag() === "stop") {
        stopped = true;
        break;
      }
      updateState({ index: i, rep: 0, phase: "lead-in", remainMs: 0, gapMs: 0 });

      /* lead-in：报序号（可选） */
      if (settings.announceIndex) {
        await speakOnce(`第${zhNumber(i + 1)}个`, settings);
        const f = handleFlag();
        if (f === "stop") {
          stopped = true;
          break;
        }
        if (f === "continue") continue;
        if (f === "restart") {
          i -= 1;
          continue;
        }
        await waitGap(500);
      } else {
        await waitGap(400);
      }
      const f0 = handleFlag();
      if (f0 === "stop") {
        stopped = true;
        break;
      }
      if (f0 === "continue") continue;
      if (f0 === "restart") {
        i -= 1;
        continue;
      }

      /* 正式朗读 N 遍 */
      let rep = 1;
      let skipItem = false;
      while (rep <= readsPerItem) {
        updateState({ rep, phase: "reading" });
        await speakOnce(items[i].text, settings);
        let f = handleFlag();
        if (f === "stop") {
          stopped = true;
          break;
        }
        if (f === "continue") {
          skipItem = true;
          break;
        }
        if (f === "restart") {
          rep = 1;
          continue;
        }

        /* 遍间停顿＝书写倒计时（按设置：自动按长短 / 固定秒数）；最后一条的最后一遍后不再等 */
        if (rep < readsPerItem || i < items.length - 1) {
          const gap = computeGapMs(items[i].chars, settings.pace, settings.writeTime);
          updateState({ phase: "gap", gapMs: gap, remainMs: gap });
          await waitGap(gap, (remain) => updateState({ remainMs: remain }));
          f = handleFlag();
          if (f === "stop") {
            stopped = true;
            break;
          }
          if (f === "continue") {
            skipItem = true;
            break;
          }
          if (f === "restart") {
            rep = 1;
            continue;
          }
        }
        rep += 1;
      }
      if (stopped) break;
      if (skipItem) continue;
    }

    if (stopped) {
      runningRef.current = false;
      updateState({ status: "idle" });
      return;
    }

    /* 完成播报（尽力而为） */
    updateState({ rep: 0, phase: "lead-in", remainMs: 0, gapMs: 0 });
    await speakOnce("默写完成，你真棒！", settings);
    if (handleFlag() === "stop") {
      runningRef.current = false;
      updateState({ status: "idle" });
      return;
    }
    runningRef.current = false;
    updateState({ status: "finished", endedAt: Date.now() });
  }, [speakOnce, updateState, waitGap]);

  /* ============ 对外控制 ============ */

  const start = useCallback(
    (items: ZhDictationItem[], settings: ZhDictationSettings) => {
      if (runningRef.current || items.length === 0) return;

      /* 清理上一场残留 */
      interruptReasonRef.current = null;
      pausedRef.current = false;
      gateRef.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* 忽略 */
        }
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      /* 单 Audio 元素 + 手势内静音解锁 */
      let a = audioRef.current;
      if (!a) {
        a = new Audio();
        a.preload = "auto";
        audioRef.current = a;
      }
      try {
        let unlocking = true;
        const releaseUnlock = () => {
          unlocking = false;
          const el = audioRef.current;
          if (!el) return;
          if (el.src === SILENT_WAV) el.pause();
          el.muted = false;
        };
        a.muted = true;
        a.src = SILENT_WAV;
        const p = a.play();
        if (p) p.then(releaseUnlock, releaseUnlock);
        setTimeout(() => {
          if (unlocking) releaseUnlock();
        }, 400);
      } catch {
        if (a) a.muted = false;
      }

      itemsRef.current = items;
      settingsRef.current = settings;
      runningRef.current = true;
      updateState({ ...INITIAL_STATE, status: "running", startedAt: Date.now() });
      /* 安全网：播放循环任何未预期的异常都不允许静默卡死，回到空闲态 */
      runSession()
        .catch((e) => {
          console.error("[zh-dictation] 播放循环异常终止", e);
          runningRef.current = false;
          pausedRef.current = false;
          gateRef.current = null;
          interruptReasonRef.current = null;
          updateState({ status: "idle" });
        });
    },
    [runSession, updateState]
  );

  const pause = useCallback(() => {
    if (stateRef.current.status !== "running") return;
    pausedRef.current = true;
    const w = waiterRef.current;
    const a = audioRef.current;
    if (a && w?.kind === "audio" && !a.paused) a.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.pause();
      } catch {
        /* 忽略 */
      }
    }
    updateState({ status: "paused" });
  }, [updateState]);

  const resume = useCallback(() => {
    if (stateRef.current.status !== "paused") return;
    forceUnpause();
    const w = waiterRef.current;
    const a = audioRef.current;
    if (a && w?.kind === "audio" && a.paused && a.src && a.src !== SILENT_WAV) {
      void a.play().catch(() => {
        /* 恢复失败：等待 onerror 兜底 */
      });
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.resume();
      } catch {
        /* 忽略 */
      }
    }
    updateState({ status: "running" });
  }, [forceUnpause, updateState]);

  const skip = useCallback(() => {
    const st = stateRef.current.status;
    if (st !== "running" && st !== "paused") return;
    interruptReasonRef.current = "skip";
    forceUnpause();
    interruptPlayback();
    if (stateRef.current.status === "paused") updateState({ status: "running" });
  }, [forceUnpause, interruptPlayback, updateState]);

  const replayCurrent = useCallback(() => {
    const st = stateRef.current.status;
    if (st !== "running" && st !== "paused") return;
    interruptReasonRef.current = "replay";
    forceUnpause();
    interruptPlayback();
    if (stateRef.current.status === "paused") updateState({ status: "running" });
  }, [forceUnpause, interruptPlayback, updateState]);

  const stop = useCallback(() => {
    if (!runningRef.current && stateRef.current.status === "idle") return;
    interruptReasonRef.current = "stop";
    runningRef.current = false;
    fetchAbortRef.current?.abort();
    forceUnpause();
    interruptPlayback();
    updateState({ status: "idle" });
  }, [forceUnpause, interruptPlayback, updateState]);

  /** 回到初始空闲态（仅非运行中可用），供完成页"返回修改"等场景 */
  const reset = useCallback(() => {
    if (runningRef.current) return;
    interruptReasonRef.current = null;
    updateState({ ...INITIAL_STATE });
  }, [updateState]);

  /** 完成页重听某条（仅空闲/完成态可用） */
  const previewSpeak = useCallback(
    (text: string) => {
      if (runningRef.current) return;
      void speakOnce(text, settingsRef.current ?? DEFAULT_ZH_SETTINGS);
    },
    [speakOnce]
  );

  /* 卸载清理：停媒体、断请求、清定时器 */
  useEffect(() => {
    return () => {
      interruptReasonRef.current = "stop";
      runningRef.current = false;
      fetchAbortRef.current?.abort();
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.src = "";
      }
      audioRef.current = null;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* 忽略 */
        }
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      const w = waiterRef.current;
      if (w) {
        waiterRef.current = null;
        if (w.timer) clearTimeout(w.timer);
      }
    };
  }, []);

  return { state, start, pause, resume, skip, replayCurrent, stop, reset, previewSpeak };
}
