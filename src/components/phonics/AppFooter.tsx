"use client";

/** 页脚：内容不足一屏时贴底（mt-auto 由根布局 flex-col 保证），超出时自然下推。
 *  移动端预留底部标签栏高度 + 安全区，避免遮挡。 */
export function AppFooter() {
  return (
    <footer className="mt-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-8 text-center text-xs text-muted-foreground md:pb-6">
      拼读星球 · 用自然拼读代替死记硬背
    </footer>
  );
}
