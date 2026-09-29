"use client";

/**
 * 登录 / 注册门（未登录时整站唯一可见内容）
 * - 登录：用户名 + 密码
 * - 注册：用户名（4~20 位字母/数字/下划线/中文）+ 昵称（可选）+ 年级 + 密码 + 确认密码
 * - 成功后种 httpOnly 会话 cookie，进入主应用；所有学习数据随账号隔离
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loginApi, registerApi } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";

export function AuthView() {
  const setUser = useAppStore((s) => s.setUser);
  const setAuthStatus = useAppStore((s) => s.setAuthStatus);

  const [busy, setBusy] = useState(false);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regUsername, setRegUsername] = useState("");
  const [regNickname, setRegNickname] = useState("");
  const [regGrade, setRegGrade] = useState("3");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  const handleLogin = async () => {
    if (busy) return;
    if (!loginUsername.trim() || !loginPassword) {
      toast.warning("请输入用户名和密码");
      return;
    }
    setBusy(true);
    try {
      const { user } = await loginApi({ username: loginUsername.trim(), password: loginPassword });
      setUser(user);
      setAuthStatus("authed");
      toast.success(`欢迎回来，${user.nickname}！`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "登录失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    if (busy) return;
    if (regPassword.length < 6) {
      toast.warning("密码至少 6 位");
      return;
    }
    if (regPassword !== regConfirm) {
      toast.warning("两次输入的密码不一样");
      return;
    }
    setBusy(true);
    try {
      const { user } = await registerApi({
        username: regUsername.trim(),
        nickname: regNickname.trim() || undefined,
        password: regPassword,
        grade: Number(regGrade) || 3,
      });
      setUser(user);
      setAuthStatus("authed");
      toast.success(`注册成功，欢迎加入拼读星球，${user.nickname}！`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "注册失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-6"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-md">
          <Sparkles className="size-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">拼读星球 PhonicsStar</h1>
        <p className="text-sm text-muted-foreground">
          登录后学习数据随身携带：错词本、听写进度、语文默写草稿都不会丢～
        </p>
      </div>

      <Card className="w-full rounded-2xl">
        <CardContent className="p-5">
          <Tabs defaultValue="login">
            <TabsList className="mb-4 grid w-full grid-cols-2 rounded-full" aria-label="登录注册">
              <TabsTrigger value="login" className="rounded-full">
                登录
              </TabsTrigger>
              <TabsTrigger value="register" className="rounded-full">
                注册
              </TabsTrigger>
            </TabsList>

            {/* 登录 */}
            <TabsContent value="login" className="flex flex-col gap-3">
              <div>
                <Label htmlFor="login-username" className="mb-1.5 block text-sm">
                  用户名
                </Label>
                <Input
                  id="login-username"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="h-11 rounded-xl text-base"
                  autoComplete="username"
                  placeholder="注册时的用户名"
                />
              </div>
              <div>
                <Label htmlFor="login-password" className="mb-1.5 block text-sm">
                  密码
                </Label>
                <Input
                  id="login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="h-11 rounded-xl text-base"
                  autoComplete="current-password"
                  placeholder="你的密码"
                />
              </div>
              <Button className="mt-1 h-12 rounded-full text-base font-bold" onClick={() => void handleLogin()} disabled={busy}>
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
                登录
              </Button>
            </TabsContent>

            {/* 注册 */}
            <TabsContent value="register" className="flex flex-col gap-3">
              <div>
                <Label htmlFor="reg-username" className="mb-1.5 block text-sm">
                  用户名（4~20 位字母/数字/下划线/中文）
                </Label>
                <Input
                  id="reg-username"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  className="h-11 rounded-xl text-base"
                  autoComplete="username"
                  maxLength={20}
                  placeholder="给账号起个名字"
                />
              </div>
              <div>
                <Label htmlFor="reg-nickname" className="mb-1.5 block text-sm">
                  昵称（可选，默认同用户名）
                </Label>
                <Input
                  id="reg-nickname"
                  value={regNickname}
                  onChange={(e) => setRegNickname(e.target.value)}
                  className="h-11 rounded-xl text-base"
                  maxLength={20}
                  placeholder="怎么称呼孩子呀"
                />
              </div>
              <div>
                <Label htmlFor="reg-grade" className="mb-1.5 block text-sm">
                  年级
                </Label>
                <Select value={regGrade} onValueChange={setRegGrade}>
                  <SelectTrigger id="reg-grade" className="h-11 w-full rounded-xl text-base">
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
              <div>
                <Label htmlFor="reg-password" className="mb-1.5 block text-sm">
                  密码（≥6 位）
                </Label>
                <Input
                  id="reg-password"
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="h-11 rounded-xl text-base"
                  autoComplete="new-password"
                  placeholder="至少 6 位"
                />
              </div>
              <div>
                <Label htmlFor="reg-confirm" className="mb-1.5 block text-sm">
                  确认密码
                </Label>
                <Input
                  id="reg-confirm"
                  type="password"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  className="h-11 rounded-xl text-base"
                  autoComplete="new-password"
                  placeholder="再输一遍"
                />
              </div>
              <Button className="mt-1 h-12 rounded-full text-base font-bold" onClick={() => void handleRegister()} disabled={busy}>
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
                注册并开始使用
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        家长手机和孩子的设备登录同一个账号，<br />
        录入的词单、学习记录就都能看到啦。
      </p>
    </motion.div>
  );
}
