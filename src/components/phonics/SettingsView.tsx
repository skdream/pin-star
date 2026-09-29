"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { LogOut, Loader2, Save, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSpeech } from "@/hooks/use-speech";
import {
  getConfig,
  type Accent,
  type ConfigDTO,
  type HintLevel,
  type Speed,
  type TtsEngine,
} from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { enterFadeUp } from "./shared";

export function SettingsView() {
  const user = useAppStore((s) => s.user);
  const updateUser = useAppStore((s) => s.updateUser);
  const logout = useAppStore((s) => s.logout);
  const { speak, speaking } = useSpeech();

  /* 本地表单状态（进入时从 store 同步，保存时写回） */
  const [nickname, setNickname] = useState(user.nickname);
  const [grade, setGrade] = useState(String(user.grade));
  const [accent, setAccent] = useState<Accent>(user.accentPref);
  const [engine, setEngine] = useState<TtsEngine>(user.ttsEngine);
  const [playCount, setPlayCount] = useState(String(user.settings.playCount ?? 2));
  const [speed, setSpeed] = useState<Speed>(user.settings.speed ?? "normal");
  const [hintLevel, setHintLevel] = useState<HintLevel>(user.settings.hintLevel ?? "none");
  const [autoNext, setAutoNext] = useState(user.settings.autoNext ?? true);

  /* store 里的 user 可能是异步加载回来的，加载完成后同步一次 */
  useEffect(() => {
    setNickname(user.nickname);
    setGrade(String(user.grade));
    setAccent(user.accentPref);
    setEngine(user.ttsEngine);
    setPlayCount(String(user.settings.playCount ?? 2));
    setSpeed(user.settings.speed ?? "normal");
    setHintLevel(user.settings.hintLevel ?? "none");
    setAutoNext(user.settings.autoNext ?? true);
  }, [user]);

  const [saving, setSaving] = useState(false);
  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updateUser({
        nickname: nickname.trim() || "小学员",
        grade: Number(grade) || 1,
        accentPref: accent,
        ttsEngine: engine,
        settings: {
          playCount: Number(playCount) || 2,
          speed,
          hintLevel,
          autoNext,
        },
      });
      toast.success("设置已保存！");
    } finally {
      setSaving(false);
    }
  }, [nickname, grade, accent, engine, playCount, speed, hintLevel, autoNext, updateUser]);

  return (
    <div className="flex flex-col gap-5">
      <motion.div {...enterFadeUp()}>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">在这里调整学习偏好和发音方式。</p>
      </motion.div>

      {/* 账号 */}
      <motion.section {...enterFadeUp(0.02)}>
        <Card className="rounded-2xl">
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <p className="font-bold">账号</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                换设备登录同一账号，学习数据同步不丢
              </p>
            </div>
            <Button
              variant="outline"
              className="h-10 shrink-0 rounded-full px-4 text-rose-600 hover:text-rose-600"
              onClick={() => {
                void logout();
                toast.info("已退出登录");
              }}
            >
              <LogOut className="size-4" aria-hidden />
              退出登录
            </Button>
          </CardContent>
        </Card>
      </motion.section>

      {/* 个人资料 */}
      <motion.section {...enterFadeUp(0.04)}>
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col gap-4 p-5">
            <h2 className="font-bold">个人资料</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="nickname" className="mb-1.5 block text-sm">昵称</Label>
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="h-11 rounded-xl text-base"
                  placeholder="怎么称呼你呀"
                  maxLength={20}
                />
              </div>
              <div>
                <Label htmlFor="grade" className="mb-1.5 block text-sm">年级</Label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger id="grade" className="h-11 w-full rounded-xl text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map((g) => (
                      <SelectItem key={g} value={String(g)}>
                        {g} 年级
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* 发音偏好 */}
      <motion.section {...enterFadeUp(0.08)}>
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col gap-4 p-5">
            <h2 className="font-bold">发音偏好</h2>
            <div>
              <Label className="mb-1.5 block text-sm">口音</Label>
              <RadioGroup value={accent} onValueChange={(v) => setAccent(v as Accent)} className="flex gap-6">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="en-US" id="acc-us" />
                  <Label htmlFor="acc-us" className="font-normal">美音（en-US）</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="en-GB" id="acc-gb" />
                  <Label htmlFor="acc-gb" className="font-normal">英音（en-GB）</Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <Label className="mb-1.5 block text-sm">发音引擎</Label>
              <RadioGroup value={engine} onValueChange={(v) => setEngine(v as TtsEngine)} className="flex gap-6">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="browser" id="engine-browser" />
                  <Label htmlFor="engine-browser" className="font-normal">浏览器本地发音（快）</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="server" id="engine-server" />
                  <Label htmlFor="engine-server" className="font-normal">服务端 AI 发音（更自然）</Label>
                </div>
              </RadioGroup>
              <p className="mt-1 text-xs text-muted-foreground">选服务端后如果网络不佳，会自动回落到浏览器发音。</p>
            </div>
            <div>
              <Button
                variant="outline"
                className="h-11 rounded-full"
                onClick={() => void speak("ship", { accent, speed })}
                disabled={speaking}
                aria-label="试听发音 ship"
              >
                {speaking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
                试听一下 ship（船）
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* 默认听写设置 */}
      <motion.section {...enterFadeUp(0.12)}>
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col gap-4 p-5">
            <h2 className="font-bold">默认听写设置</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block text-sm">每个词播放次数</Label>
                <Select value={playCount} onValueChange={setPlayCount}>
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
                <Select value={hintLevel} onValueChange={(v) => setHintLevel(v as HintLevel)}>
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
              <RadioGroup value={speed} onValueChange={(v) => setSpeed(v as Speed)} className="flex gap-6">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="normal" id="set-speed-normal" />
                  <Label htmlFor="set-speed-normal" className="font-normal">正常语速</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="slow" id="set-speed-slow" />
                  <Label htmlFor="set-speed-slow" className="font-normal">慢速</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3">
              <div>
                <Label htmlFor="set-auto-next" className="text-sm font-bold">答对后自动下一个</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">听写节奏更快</p>
              </div>
              <Switch id="set-auto-next" checked={autoNext} onCheckedChange={setAutoNext} />
            </div>
          </CardContent>
        </Card>
      </motion.section>

      {/* 第三方服务状态 */}
      <ServiceConfigCard />

      {/* 保存 */}
      <Button size="lg" className="h-13 rounded-2xl py-4 text-base font-bold" onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Save className="size-5" aria-hidden />}
        保存设置
      </Button>
    </div>
  );
}

/* ---------- 第三方服务状态 ---------- */

function ServiceConfigCard() {
  const [config, setConfig] = useState<ConfigDTO | null>(null);
  const [error, setError] = useState(false);

  /* 拉取服务状态：异步回调里 setState，避免同步级联渲染 */
  useEffect(() => {
    let cancelled = false;
    getConfig()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.section {...enterFadeUp(0.16)}>
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col gap-3 p-5">
          <h2 className="font-bold">第三方服务状态</h2>
          {error ? (
            <p className="text-sm text-muted-foreground">
              服务状态暂时拿不到（接口未就绪也会这样），不影响本地发音和学习功能。
            </p>
          ) : config === null ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {(config.services ?? []).map((s) => {
                const missing = (s.envVars ?? []).filter((v) => !v.configured);
                return (
                  <div key={s.key} className="rounded-xl border border-border/70 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold">{s.name}</p>
                      <Badge
                        variant="secondary"
                        className={
                          s.configured
                            ? "rounded-full bg-emerald-100 px-3 text-xs font-bold text-emerald-700"
                            : "rounded-full bg-stone-100 px-3 text-xs font-bold text-stone-500"
                        }
                      >
                        {s.configured ? "已配置" : "未配置"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                    {(s.envVars ?? []).length > 0 ? (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        环境变量：{s.envVars.map((v) => v.name).join("、")}
                      </p>
                    ) : null}
                    {!s.configured && missing.length > 0 ? (
                      <p className="mt-1 text-xs text-amber-700">
                        在 .env 中配置 {missing.map((v) => v.name).join("、")} 即可启用
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.section>
  );
}
