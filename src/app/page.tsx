"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useAppStore, syncViewFromLocation, type View } from "@/lib/store";
import { fetchMe } from "@/lib/api-client";
import { AppHeader } from "@/components/phonics/AppHeader";
import { AppFooter } from "@/components/phonics/AppFooter";
import { MobileNav } from "@/components/phonics/MobileNav";
import { AuthView } from "@/components/phonics/AuthView";
import { HomeView } from "@/components/phonics/HomeView";
import { LearnView } from "@/components/phonics/LearnView";
import { DictationView } from "@/components/phonics/DictationView";
import { ZhDictationView } from "@/components/chinese/ZhDictationView";
import { ReviewView } from "@/components/phonics/ReviewView";
import { ErrorBookView } from "@/components/phonics/ErrorBookView";
import { ReportView } from "@/components/phonics/ReportView";
import { SettingsView } from "@/components/phonics/SettingsView";

function renderView(view: View) {
  switch (view) {
    case "learn":
      return <LearnView />;
    case "dictation":
      return <DictationView />;
    case "zhdictation":
      return <ZhDictationView />;
    case "review":
      return <ReviewView />;
    case "errors":
      return <ErrorBookView />;
    case "report":
      return <ReportView />;
    case "settings":
      return <SettingsView />;
    case "home":
    default:
      return <HomeView />;
  }
}

export default function Page() {
  const currentView = useAppStore((s) => s.currentView);
  const authStatus = useAppStore((s) => s.authStatus);
  const setAuthStatus = useAppStore((s) => s.setAuthStatus);
  const setUser = useAppStore((s) => s.setUser);

  /* 启动时探测登录态：401 → 登录门；成功 → 进入主应用 */
  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((d) => {
        if (cancelled) return;
        setUser(d.user);
        setAuthStatus("authed");
      })
      .catch(() => {
        if (!cancelled) setAuthStatus("guest");
      });
    return () => {
      cancelled = true;
    };
  }, [setAuthStatus, setUser]);

  /* hash 路由同步：刷新按 URL 恢复视图；后退/前进/手动改 # 也跟随 */
  useEffect(() => {
    syncViewFromLocation();
    const onLocationChange = () => syncViewFromLocation();
    window.addEventListener("hashchange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    return () => {
      window.removeEventListener("hashchange", onLocationChange);
      window.removeEventListener("popstate", onLocationChange);
    };
  }, []);

  /* 探测中：整页 loading，避免闪登录门 */
  if (authStatus === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">正在进入拼读星球…</p>
      </div>
    );
  }

  /* 未登录：登录/注册门 */
  if (authStatus === "guest") {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 pt-5">
          <AuthView />
        </main>
        <AppFooter />
      </div>
    );
  }

  /* 已登录：主应用 */
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 pt-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {renderView(currentView)}
          </motion.div>
        </AnimatePresence>
      </main>
      <AppFooter />
      <MobileNav />
    </div>
  );
}
