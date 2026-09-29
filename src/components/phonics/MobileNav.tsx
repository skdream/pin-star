"use client";

import { NAV_ITEMS } from "./nav";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** 移动端底部固定标签栏（8 项），桌面端隐藏；尊重底部安全区。 */
export function MobileNav() {
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);

  return (
    <nav
      aria-label="底部导航"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-8">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[54px] flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-5" aria-hidden />
              <span className={cn("text-[10px] leading-none", active && "font-bold")}>
                {item.shortLabel ?? item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
