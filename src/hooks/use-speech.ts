"use client";

/**
 * 发音 Hook：
 * - engine = "browser"：window.speechSynthesis 本地发音（默认）
 *   · utterance.lang = accent，rate: normal=0.9 / slow=0.55
 *   · 从 getVoices() 里选 lang 前缀匹配的 voice（en-US / en-GB）
 *   · voices 未加载完成时监听 voiceschanged
 * - engine = "server"：fetch /api/tts 拿音频 blob 播放，失败自动降级 browser
 * 兼容 SSR：所有 window 访问都有守卫，只在客户端执行。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { ttsUrl, type Accent, type Speed } from "@/lib/api-client";

export interface SpeakOptions {
  speed?: Speed;
  accent?: Accent;
}

export interface SpeakTimesOptions extends SpeakOptions {
  /** 播放次数，默认 1 */
  times?: number;
  /** 重复间隔毫秒，默认 1500 */
  intervalMs?: number;
}

export function useSpeech() {
  const engine = useAppStore((s) => s.user.ttsEngine);
  const defaultAccent = useAppStore((s) => s.user.accentPref);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const seqRef = useRef(0);

  /* voices 异步加载监听 */
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
    };
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  /** 立刻停止一切发音（浏览器合成 + 服务端音频 + 定时器） */
  const stop = useCallback(() => {
    seqRef.current += 1;
    clearTimers();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setSpeaking(false);
  }, [clearTimers]);

  /* 组件卸载时清理 */
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const pickVoice = useCallback(
    (accent: Accent): SpeechSynthesisVoice | null => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
      const list = voices.length ? voices : window.speechSynthesis.getVoices();
      const norm = (s: string) => s.replace("_", "-");
      return (
        list.find((v) => norm(v.lang) === accent) ??
        list.find((v) => norm(v.lang).startsWith(accent.split("-")[0])) ??
        list.find((v) => norm(v.lang).toLowerCase().startsWith("en")) ??
        null
      );
    },
    [voices]
  );

  const speakBrowser = useCallback(
    (text: string, speed: Speed, accent: Accent) => {
      return new Promise<void>((resolve) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          resolve();
          return;
        }
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = accent;
          u.rate = speed === "slow" ? 0.55 : 0.9;
          const voice = pickVoice(accent);
          if (voice) u.voice = voice;
          let settled = false;
          const done = () => {
            if (!settled) {
              settled = true;
              setSpeaking(false);
              resolve();
            }
          };
          u.onend = done;
          u.onerror = done;
          setSpeaking(true);
          window.speechSynthesis.speak(u);
          /* 极端情况下 onend 不触发的兜底（按 2s/词估算） */
          const guard = setTimeout(done, Math.max(4000, text.length * 800));
          u.onend = () => {
            clearTimeout(guard);
            done();
          };
          u.onerror = () => {
            clearTimeout(guard);
            done();
          };
        } catch {
          setSpeaking(false);
          resolve();
        }
      });
    },
    [pickVoice]
  );

  const speakServer = useCallback(async (text: string, speed: Speed, accent: Accent) => {
    const res = await fetch(ttsUrl(text, speed, accent));
    if (!res.ok) throw new Error(`TTS 请求失败（${res.status}）`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          setSpeaking(false);
          resolve();
        }
      };
      const fail = () => {
        if (!settled) {
          settled = true;
          setSpeaking(false);
          reject(new Error("音频播放失败"));
        }
      };
      audio.onended = done;
      audio.onerror = fail;
      setSpeaking(true);
      audio.play().catch(fail);
    });
  }, []);

  /** 朗读一次 */
  const speak = useCallback(
    async (text: string, opts?: SpeakOptions) => {
      const speed = opts?.speed ?? "normal";
      const accent = opts?.accent ?? defaultAccent;
      stop();
      const seq = ++seqRef.current;
      if (engine === "server") {
        try {
          await speakServer(text, speed, accent);
        } catch {
          /* 服务端 TTS 失败 → 自动降级浏览器发音 */
          await speakBrowser(text, speed, accent);
        }
      } else {
        await speakBrowser(text, speed, accent);
      }
      if (seqRef.current === seq) setSpeaking(false);
    },
    [defaultAccent, engine, speakBrowser, speakServer, stop]
  );

  /** 朗读 N 遍（间隔 intervalMs），可随时 stop() 打断 */
  const speakTimes = useCallback(
    (text: string, opts?: SpeakTimesOptions) => {
      const times = Math.max(1, Math.floor(opts?.times ?? 1));
      const intervalMs = opts?.intervalMs ?? 1500;
      stop();
      const run = (i: number) => {
        if (i >= times) return;
        void speak(text, { speed: opts?.speed, accent: opts?.accent }).then(() => {
          if (i < times - 1) {
            const t = setTimeout(() => run(i + 1), intervalMs);
            timersRef.current.push(t);
          }
        });
      };
      run(0);
    },
    [speak, stop]
  );

  return { speak, speakTimes, stop, speaking };
}
