import { create } from "zustand";
import {
  DEFAULT_USER,
  logoutApi,
  updateUserApi,
  type UserDTO,
  type UserPatch,
} from "@/lib/api-client";

/** 单页面应用的八大视图 */
export type View =
  | "home"
  | "learn"
  | "dictation"
  | "zhdictation"
  | "review"
  | "errors"
  | "report"
  | "settings";

/** 登录态：loading=探测中 | guest=未登录 | authed=已登录 */
export type AuthStatus = "loading" | "guest" | "authed";

const VALID_VIEWS: readonly string[] = [
  "home",
  "learn",
  "dictation",
  "zhdictation",
  "review",
  "errors",
  "report",
  "settings",
];

/** URL hash → 视图（#/learn → "learn"）；非法或缺省回首页 */
export function viewFromHash(): View {
  if (typeof window === "undefined") return "home";
  const raw = window.location.hash.replace(/^#\/?/, "").trim();
  return VALID_VIEWS.includes(raw) ? (raw as View) : "home";
}

/** 视图 → URL hash（首页用 "#/"，其余 "#/xxx"） */
function hashForView(v: View): string {
  return v === "home" ? "#/" : `#/${v}`;
}

/** 浏览器后退/前进/手动改 hash 后，从 URL 恢复视图（不写入历史） */
export function syncViewFromLocation(): void {
  const v = viewFromHash();
  if (useAppStore.getState().currentView !== v) {
    useAppStore.setState({ currentView: v });
  }
}

interface AppState {
  currentView: View;
  setView: (v: View) => void;
  authStatus: AuthStatus;
  setAuthStatus: (s: AuthStatus) => void;
  user: UserDTO;
  setUser: (u: UserDTO) => void;
  /** 本地乐观合并 + 静默 PUT 后端（接口未就绪时保留本地状态，不抛错） */
  updateUser: (patch: UserPatch) => Promise<void>;
  /** 退出登录：清会话 + 回到登录门 */
  logout: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentView: "home",
  setView: (v) => {
    set({ currentView: v });
    /* hash 路由：写入浏览器历史，刷新/后退/前进都能回到当前视图 */
    if (typeof window !== "undefined" && window.location.hash !== hashForView(v)) {
      window.history.pushState(null, "", hashForView(v));
    }
  },

  authStatus: "loading",
  setAuthStatus: (s) => set({ authStatus: s }),

  user: DEFAULT_USER,

  setUser: (u) =>
    set({
      user: {
        ...DEFAULT_USER,
        ...u,
        settings: { ...DEFAULT_USER.settings, ...(u.settings ?? {}) },
      },
    }),

  updateUser: async (patch) => {
    const prev = get().user;
    const merged: UserDTO = {
      ...prev,
      ...patch,
      settings: { ...prev.settings, ...(patch.settings ?? {}) },
    };
    set({ user: merged });
    try {
      const saved = await updateUserApi(patch);
      get().setUser(saved);
    } catch {
      // 后端未就绪：保留本地合并结果，保证界面可用
    }
  },

  logout: async () => {
    try {
      await logoutApi();
    } catch {
      // 会话接口失败也不阻塞本地登出
    }
    set({ authStatus: "guest", user: DEFAULT_USER, currentView: "home" });
    /* 清掉地址栏视图 hash，避免下次登录残留旧视图 */
    if (typeof window !== "undefined" && window.location.hash !== "") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  },
}));
