"use client";

import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NAV_ITEMS } from "./nav";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** 顶部导航：sticky，桌面端 8 项导航 + 用户菜单；移动端只显示 logo + 用户徽章 */
export function AppHeader() {
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <button
          type="button"
          onClick={() => setView("home")}
          className="flex min-h-11 items-center gap-2"
          aria-label="拼读星球，回到首页"
        >
          <span className="flex size-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <span className="text-lg font-extrabold tracking-tight">拼读星球</span>
          <span className="hidden text-xs font-medium text-muted-foreground sm:inline">PhonicsStar</span>
        </button>

        <nav aria-label="主导航" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.shortLabel ?? item.label}
              </button>
            );
          })}
        </nav>

        {/* 用户菜单：昵称徽章 + 退出登录 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-h-11 items-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
              aria-label={`已登录：${user.nickname}（${user.grade}年级），打开用户菜单`}
            >
              <Badge
                variant="secondary"
                className="min-h-8 cursor-pointer rounded-full bg-amber-100 px-3 text-xs font-bold text-amber-700"
              >
                {user.nickname}·{user.grade}年级
              </Badge>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-xl">
            <DropdownMenuLabel className="text-xs font-bold text-muted-foreground">
              {user.nickname} · {user.grade}年级
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer rounded-lg text-rose-600 focus:text-rose-600"
              onSelect={() => {
                void logout();
              }}
            >
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
