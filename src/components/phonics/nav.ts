import {
  BarChart3,
  BookOpen,
  BookX,
  Home,
  Languages,
  PencilLine,
  Repeat,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { View } from "@/lib/store";

export interface NavItem {
  key: View;
  label: string;
  /** 空间紧张处的短文案（顶部导航/底部标签栏优先使用） */
  shortLabel?: string;
  icon: LucideIcon;
}

/** 八大视图导航（桌面顶部导航条 + 移动端底部标签栏共用） */
export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "首页", icon: Home },
  { key: "learn", label: "学拼读", icon: BookOpen },
  { key: "dictation", label: "报听写", icon: PencilLine },
  { key: "zhdictation", label: "语文默写", shortLabel: "默写", icon: Languages },
  { key: "review", label: "复习", icon: Repeat },
  { key: "errors", label: "错词本", icon: BookX },
  { key: "report", label: "报告", icon: BarChart3 },
  { key: "settings", label: "设置", icon: Settings },
];
