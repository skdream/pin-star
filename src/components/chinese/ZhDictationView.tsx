"use client";

/**
 * 语文默写视图（三阶段：准备 → 默写中 → 完成）
 * - 准备：家长逐行录入词语/句子（一行一条），实时解析预览、报读设置（语速/遍数/书写倒计时/节奏/
 *   家长密码）、最近词单恢复、默写广场（今日全体学员词单，可直接开默）
 * - 默写中：只显示进度与倒计时（不显示词条内容，防止孩子偷看）；每条读 N 遍（报读设置可调），
 *   遍间停留＝书写倒计时（自动按长短或固定秒数）；可暂停/继续、重读本词、跳过本词、结束默写；
 *   家长可"查看本词"对答案——需要家长密码验证，且换到下一条自动隐藏（防止孩子偷看）
 * - 完成：用时统计 + 全部词条明文 + 单条重听 + 再来一遍
 * - 草稿：输入防抖 800ms 自动保存到账号；页面关闭/切走时 sendBeacon 补传，跨浏览器不丢
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Compass,
  Eye,
  EyeOff,
  History,
  Info,
  KeyRound,
  Languages,
  Loader2,
  Pause,
  PartyPopper,
  Play,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useZhDictation } from "@/hooks/use-zh-dictation";
import {
  ApiError,
  deleteZhHistoryApi,
  flushZhDraftBeacon,
  getZhDictationData,
  getZhPlaza,
  saveZhDraftApi,
  saveZhHistoryApi,
  saveZhPinApi,
  type ZhHistoryEntryDTO,
  type ZhPlazaEntryDTO,
} from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import {
  WRITE_TIME_OPTIONS,
  ZH_READS_OPTIONS,
  clampReads,
  clampWriteTime,
  estimateSessionMs,
  formatDuration,
  normalizeZhSettings,
  parseZhDictationInput,
  DEFAULT_ZH_SETTINGS,
  type ZhDictationSettings,
  type ZhPace,
} from "@/lib/zh-dictation";
import { cn } from "@/lib/utils";
import { enterFadeUp } from "../phonics/shared";

const PACE_OPTIONS: { value: ZhPace; label: string }[] = [
  { value: "compact", label: "紧凑（间隔短）" },
  { value: "standard", label: "标准" },
  { value: "relaxed", label: "从容（间隔长）" },
];

/** 拉取默写广场（失败返回 null，由调用方决定是否覆盖旧列表） */
function requestPlaza(): Promise<ZhPlazaEntryDTO[] | null> {
  return getZhPlaza()
    .then((d) => (Array.isArray(d.plaza) ? d.plaza : []))
    .catch(() => null);
}

/** 家长密码弹窗（默写中查看本词验证 / 首次设置；验证与新设均走服务端） */
function PinDialog(props: {
  open: boolean;
  mode: "verify" | "setup";
  pinInput: string;
  pinError: string;
  busy: boolean;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" aria-hidden />
            {props.mode === "setup" ? "设置家长密码" : "家长验证"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {props.mode === "setup"
              ? "设置 4~6 位数字密码。默写中查看当前词语需输入此密码，孩子拿不到密码就偷看不了。"
              : "请输入家长密码，验证通过后显示当前要默写的内容。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={props.pinInput}
          onChange={(e) => props.onInputChange(e.target.value)}
          inputMode="numeric"
          maxLength={6}
          placeholder="4~6 位数字"
          className="h-12 rounded-xl text-center text-xl font-bold tracking-[0.4em]"
          aria-label="家长密码"
          onKeyDown={(e) => {
            if (e.key === "Enter") props.onSubmit();
          }}
        />
        {props.pinError ? (
          <p className="text-sm font-bold text-rose-600" role="alert">
            {props.pinError}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.busy}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={props.busy}
            onClick={(e) => {
              /* 校验失败时阻止弹窗自动关闭 */
              e.preventDefault();
              props.onSubmit();
            }}
          >
            {props.busy ? "验证中…" : props.mode === "setup" ? "保存并显示" : "验证并显示"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 家长密码管理弹窗（报读设置区：设置/修改/清除）
 * 已设密码时修改或清除必须先验证身份：当前家长密码 或 账号登录密码（二选一），
 * 服务端强制校验，防止孩子随意改掉家长设置的密码 */
function PinManageDialog(props: {
  open: boolean;
  mode: "set" | "clear";
  hasExisting: boolean;
  verifyMode: "pin" | "login";
  verifyInput: string;
  newPin: string;
  confirmPin: string;
  error: string;
  busy: boolean;
  onVerifyModeChange: (m: "pin" | "login") => void;
  onVerifyInputChange: (v: string) => void;
  onNewPinChange: (v: string) => void;
  onConfirmPinChange: (v: string) => void;
  onSubmit: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const needVerify = props.hasExisting;
  const title =
    props.mode === "clear" ? "清除查看密码" : props.hasExisting ? "修改查看密码" : "设置查看密码";
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" aria-hidden />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {props.mode === "clear"
              ? "清除后，默写中查看本词会引导重新设置密码。为防孩子误操作，需先验证身份。"
              : props.hasExisting
                ? "修改密码前需先验证身份（防止孩子自行改动）。"
                : "设置 4~6 位数字密码。默写中查看当前词语需输入此密码，孩子拿不到密码就偷看不了。"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {needVerify ? (
          <div className="flex flex-col gap-1.5">
            {props.verifyMode === "pin" ? (
              <Input
                value={props.verifyInput}
                onChange={(e) => props.onVerifyInputChange(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                maxLength={6}
                placeholder="输入当前家长密码"
                className="h-11 rounded-xl text-center text-lg font-bold tracking-[0.4em]"
                aria-label="当前家长密码"
                autoComplete="off"
              />
            ) : (
              <Input
                value={props.verifyInput}
                type="password"
                onChange={(e) => props.onVerifyInputChange(e.target.value)}
                placeholder="输入账号登录密码"
                className="h-11 rounded-xl text-center"
                aria-label="账号登录密码"
                autoComplete="current-password"
              />
            )}
            <button
              type="button"
              className="self-start text-xs font-bold text-primary underline-offset-4 hover:underline"
              onClick={() => {
                props.onVerifyModeChange(props.verifyMode === "pin" ? "login" : "pin");
                props.onVerifyInputChange("");
              }}
            >
              {props.verifyMode === "pin"
                ? "忘了家长密码？改用账号登录密码验证"
                : "改用家长密码验证"}
            </button>
          </div>
        ) : null}

        {props.mode === "set" ? (
          <div className="flex flex-col gap-2">
            <Input
              value={props.newPin}
              onChange={(e) => props.onNewPinChange(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              maxLength={6}
              placeholder="新密码（4~6 位数字）"
              className="h-12 rounded-xl text-center text-xl font-bold tracking-[0.4em]"
              aria-label="新密码"
              autoComplete="new-password"
            />
            <Input
              value={props.confirmPin}
              onChange={(e) => props.onConfirmPinChange(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              maxLength={6}
              placeholder="再输入一次新密码"
              className="h-12 rounded-xl text-center text-xl font-bold tracking-[0.4em]"
              aria-label="确认新密码"
              autoComplete="new-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") props.onSubmit();
              }}
            />
          </div>
        ) : null}

        {props.error ? (
          <p className="text-sm font-bold text-rose-600" role="alert">
            {props.error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.busy}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={props.busy}
            onClick={(e) => {
              e.preventDefault();
              props.onSubmit();
            }}
          >
            {props.busy ? "提交中…" : props.mode === "clear" ? "确认清除" : "保存新密码"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const PLACEHOLDER = [
  "每行一个词语或句子，例如：",
  "春回大地",
  "小蝌蚪找妈妈",
  "床前明月光，疑是地上霜。",
].join("\n");

type DraftState = "idle" | "saving" | "saved" | "error";

export function ZhDictationView() {
  const [raw, setRaw] = useState("");
  const [settings, setSettings] = useState<ZhDictationSettings>(DEFAULT_ZH_SETTINGS);
  const [history, setHistory] = useState<ZhHistoryEntryDTO[]>([]);
  const [plaza, setPlaza] = useState<ZhPlazaEntryDTO[]>([]);
  const [plazaLoading, setPlazaLoading] = useState(false);

  /** 当前正在展示答案的词条下标（null=隐藏）；换到下一条自然失效，自动重新上锁 */
  const [revealedIdx, setRevealedIdx] = useState<number | null>(null);

  /** 家长密码弹窗 */
  const [pinOpen, setPinOpen] = useState(false);
  const [pinMode, setPinMode] = useState<"verify" | "setup">("verify");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  /** 家长密码管理弹窗（设置区：设置/修改/清除，需身份验证） */
  const [manageOpen, setManageOpen] = useState(false);
  const [manageMode, setManageMode] = useState<"set" | "clear">("set");
  const [verifyMode, setVerifyMode] = useState<"pin" | "login">("pin");
  const [verifyInput, setVerifyInput] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [manageError, setManageError] = useState("");
  const [manageBusy, setManageBusy] = useState(false);

  /** 草稿自动保存状态（给家长一颗定心丸） */
  const [draftState, setDraftState] = useState<DraftState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  /** 初始恢复完成前禁止自动保存，避免挂载时的空值抹掉已存草稿 */
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** pagehide 补传用：最近一次成功保存的内容 */
  const lastSavedRawRef = useRef<string | null>(null);

  const user = useAppStore((s) => s.user);
  const updateUser = useAppStore((s) => s.updateUser);

  const session = useZhDictation();
  const { state: ss } = session;

  /* 阶段由会话状态派生：running/paused → 默写中，finished → 完成，idle → 准备 */
  const stage: "setup" | "session" | "done" =
    ss.status === "running" || ss.status === "paused"
      ? "session"
      : ss.status === "finished"
        ? "done"
        : "setup";

  const parsed = useMemo(() => parseZhDictationInput(raw), [raw]);
  const estMs = useMemo(() => estimateSessionMs(parsed.items, settings), [parsed.items, settings]);

  /* 初始化：从数据库恢复草稿/最近词单，从用户设置恢复报读偏好 */
  useEffect(() => {
    let cancelled = false;
    const applyZhSettings = () => {
      const zh = user.settings.zhDictation;
      if (zh) setSettings(normalizeZhSettings(zh));
    };
    getZhDictationData()
      .then((d) => {
        if (cancelled) return;
        setRaw(d.draft ?? "");
        lastSavedRawRef.current = d.draft ?? "";
        setHistory(Array.isArray(d.history) ? d.history : []);
        applyZhSettings();
      })
      .catch(() => {
        if (!cancelled) applyZhSettings();
      })
      .finally(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rawRef = useRef(raw);
  useEffect(() => {
    rawRef.current = raw;
  }, [raw]);

  /* 草稿自动保存到数据库（防抖 800ms，恢复完成后才启用；关闭/切走页面时另有 sendBeacon 补传） */
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setDraftState("saving");
      saveZhDraftApi(raw)
        .then(() => {
          lastSavedRawRef.current = raw;
          setDraftState("saved");
          setSavedAt(Date.now());
        })
        .catch(() => {
          setDraftState("error");
        });
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [raw]);

  /* 页面关闭/切走：把未落盘的草稿用 sendBeacon 补传（换浏览器也不丢刚输入的内容） */
  useEffect(() => {
    const onPageHide = () => {
      if (!hydratedRef.current) return;
      if (lastSavedRawRef.current !== null && rawRef.current === lastSavedRawRef.current) return;
      flushZhDraftBeacon(rawRef.current);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  /* 报读设置保存到用户资料（防抖 600ms） */
  useEffect(() => {
    if (!hydratedRef.current) return;
    const t = setTimeout(() => {
      void updateUser({ settings: { zhDictation: settings } });
    }, 600);
    return () => clearTimeout(t);
  }, [settings, updateUser]);

  const wordCount = parsed.items.filter((i) => i.kind === "word").length;
  const sentenceCount = parsed.items.length - wordCount;

  /* ============ 家长密码 ============ */

  /** 从 API 响应同步报读设置（密码管理返回后刷新 revealPinSet） */
  const applyUserZhSettings = (u: { settings?: { zhDictation?: Partial<ZhDictationSettings> } }) => {
    setSettings(normalizeZhSettings(u.settings?.zhDictation ?? null));
  };

  /** 打开密码弹窗：未设置密码 → 引导设置；已设置 → 验证（均走服务端） */
  const openPinDialog = (mode?: "verify" | "setup") => {
    const m = mode ?? (settings.revealPinSet ? "verify" : "setup");
    setPinMode(m);
    setPinInput("");
    setPinError("");
    setPinOpen(true);
  };

  const submitPinDialog = () => {
    if (pinBusy) return;
    const pin = pinInput.trim();
    if (pinMode === "setup") {
      if (!/^\d{4,6}$/.test(pin)) {
        setPinError("请输入 4~6 位数字密码");
        return;
      }
      setPinBusy(true);
      saveZhPinApi({ action: "set", pin })
        .then((res) => {
          if (res.user) applyUserZhSettings(res.user);
          /* 若在默写中弹出（首次查看），保存后直接显示当前词 */
          setRevealedIdx(ss.index);
          setPinOpen(false);
          toast.success("家长密码已保存，默写中查看本词需输入它");
        })
        .catch((e) => {
          if (e instanceof ApiError && e.status === 403) {
            /* 服务端已有密码（另一设备先设了）：切到验证模式 */
            setPinMode("verify");
            setPinError("本账号已设过密码，请输入验证");
          } else {
            setPinError(e instanceof ApiError ? e.message : "保存失败，请稍后再试");
          }
        })
        .finally(() => setPinBusy(false));
      return;
    }
    if (!pin) {
      setPinError("请输入家长密码");
      return;
    }
    setPinBusy(true);
    saveZhPinApi({ action: "verify", oldPin: pin })
      .then(() => {
        setRevealedIdx(ss.index);
        setPinOpen(false);
      })
      .catch((e) => {
        setPinError(e instanceof ApiError ? e.message : "验证失败，请稍后再试");
      })
      .finally(() => setPinBusy(false));
  };

  /** 打开密码管理弹窗（设置区按钮入口） */
  const openPinManage = (mode: "set" | "clear") => {
    setManageMode(mode);
    setVerifyMode("pin");
    setVerifyInput("");
    setNewPin("");
    setConfirmPin("");
    setManageError("");
    setManageOpen(true);
  };

  /** 提交密码管理（设置/修改/清除；已设密码时服务端强制验证身份） */
  const submitPinManage = () => {
    if (manageBusy) return;
    const needVerify = settings.revealPinSet === true;
    if (needVerify && !verifyInput.trim()) {
      setManageError(verifyMode === "pin" ? "请输入当前家长密码" : "请输入账号登录密码");
      return;
    }
    if (manageMode === "set") {
      if (!/^\d{4,6}$/.test(newPin)) {
        setManageError("新密码需为 4~6 位数字");
        return;
      }
      if (newPin !== confirmPin) {
        setManageError("两次输入的新密码不一致");
        return;
      }
    }
    setManageBusy(true);
    setManageError("");
    saveZhPinApi({
      action: manageMode,
      pin: manageMode === "set" ? newPin : undefined,
      ...(needVerify
        ? verifyMode === "pin"
          ? { oldPin: verifyInput.trim() }
          : { loginPassword: verifyInput }
        : {}),
    })
      .then((res) => {
        if (res.user) applyUserZhSettings(res.user);
        setManageOpen(false);
        toast.success(manageMode === "set" ? "家长密码已保存" : "已清除家长密码");
      })
      .catch((e) => {
        setManageError(e instanceof ApiError ? e.message : "操作失败，请稍后再试");
      })
      .finally(() => setManageBusy(false));
  };

  /* ============ 默写广场 ============ */

  /** 手动刷新（事件处理器里才能同步亮 spinner） */
  const refreshPlaza = () => {
    setPlazaLoading(true);
    void requestPlaza().then((list) => {
      if (list) setPlaza(list);
      setPlazaLoading(false);
    });
  };

  /* 进入准备页时静默刷新广场（首次挂载 + 每场默写结束返回） */
  useEffect(() => {
    if (stage !== "setup") return;
    let cancelled = false;
    void requestPlaza().then((list) => {
      if (!cancelled && list) setPlaza(list);
    });
    return () => {
      cancelled = true;
    };
  }, [stage]);

  /** 广场词单时间（Asia/Shanghai 时区 HH:mm） */
  const fmtPlazaTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Shanghai",
      });
    } catch {
      return "";
    }
  };

  /** 草稿保存时间（HH:mm） */
  const fmtSavedTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      return "";
    }
  };

  const fillFromPlaza = (entry: ZhPlazaEntryDTO) => {
    setRaw(entry.items.map((i) => i.text).join("\n"));
    toast.success("已把这份词单填入编辑框，可修改后开始");
  };

  /** 直接用广场里别人的词单开默（同时存入自己的最近词单） */
  const startPlaza = (entry: ZhPlazaEntryDTO) => {
    if (entry.items.length === 0) return;
    setRevealedIdx(null);
    setRaw(entry.items.map((i) => i.text).join("\n"));
    session.start(entry.items, settings);
    toast.success(`已开始默写 ${entry.nickname} 的词单（${entry.items.length} 条）`);
    saveZhHistoryApi(entry.items)
      .then((r) => setHistory(r.history))
      .catch(() => {
        /* 保存失败不影响默写进行 */
      });
  };

  const handleStart = () => {
    if (parsed.items.length === 0) {
      toast.warning("请先输入要默写的词语或句子");
      return;
    }
    setRevealedIdx(null);
    session.start(parsed.items, settings);
    /* 开始默写即存入最近词单（数据库，最多保留 5 份） */
    saveZhHistoryApi(parsed.items)
      .then((r) => setHistory(r.history))
      .catch(() => {
        /* 保存失败不影响默写进行 */
      });
  };

  const handleAgain = () => {
    if (parsed.items.length === 0) {
      session.reset();
      return;
    }
    setRevealedIdx(null);
    session.start(parsed.items, settings);
  };

  const restoreHistory = (entry: ZhHistoryEntryDTO) => {
    setRaw(entry.items.map((i) => i.text).join("\n"));
    toast.success("已恢复这份词单");
  };

  const removeHistory = (id: string) => {
    deleteZhHistoryApi(id)
      .then((r) => setHistory(r.history))
      .catch(() => toast.error("删除失败，请稍后再试"));
  };

  const clearAll = () => {
    setRaw("");
    toast.success("已清空");
  };

  /* ============ 准备阶段 ============ */
  if (stage === "setup") {
    return (
      <motion.div {...enterFadeUp()} className="flex flex-col gap-5">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight md:text-3xl">
            <Languages className="size-7 text-teal-600" aria-hidden />
            语文默写
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            家长录入词语或句子，AI 逐条报读，孩子动笔写～
          </p>
        </div>

        {/* 默写广场：今日全体学员的词单 */}
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold">
                <Compass className="size-4 text-primary" aria-hidden />
                默写广场
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                  今日 · 全体学员
                </Badge>
              </h2>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 rounded-full text-muted-foreground"
                onClick={refreshPlaza}
                disabled={plazaLoading}
                aria-label="刷新默写广场"
              >
                <RefreshCw className={cn("size-4", plazaLoading && "animate-spin")} aria-hidden />
              </Button>
            </div>
            {plaza.length === 0 ? (
              <p className="rounded-xl bg-secondary/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                今天还没有词单出场～家长录入并点「开始默写」后，词单就会来到广场，所有同学都能直接挑战。
              </p>
            ) : (
              <div className="nice-scrollbar flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
                {plaza.map((entry) => {
                  const own = entry.userId === user.id;
                  /* 预览最多展示 3 条内容，超出的用「等」收尾，避免词条内顿号造成误数 */
                  const shown = entry.items.slice(0, 3).map((i) => i.text).join("、");
                  const preview = entry.items.length > 3 ? `${shown} 等` : shown;
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2.5 rounded-xl border border-border/70 px-3 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => fillFromPlaza(entry)}
                        className="min-w-0 flex-1 text-left"
                        aria-label={`把 ${entry.nickname} 的词单填入编辑框`}
                      >
                        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge
                            variant="secondary"
                            className="shrink-0 bg-amber-100 px-1.5 py-0 text-[10px] font-bold text-amber-700"
                          >
                            {own ? "我" : entry.nickname}
                          </Badge>
                          <span className="shrink-0">{entry.grade}年级</span>
                          <span className="shrink-0">{fmtPlazaTime(entry.savedAt)}</span>
                        </p>
                        <p className="mt-0.5 truncate text-sm font-bold">{preview}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {entry.items.length} 条 · 点击填入编辑框
                        </p>
                      </button>
                      <Button
                        size="sm"
                        className="h-9 shrink-0 rounded-full px-3 font-bold"
                        onClick={() => startPlaza(entry)}
                        aria-label={`直接用 ${entry.nickname} 的词单开始默写`}
                      >
                        <Play className="size-3.5" aria-hidden />
                        直接默写
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 录入 */}
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">录入词语或句子</h2>
              <div className="flex items-center gap-3">
                <span aria-live="polite" className="text-xs text-muted-foreground">
                  {draftState === "saving"
                    ? "保存中…"
                    : draftState === "saved" && savedAt
                      ? `已自动保存 ${fmtSavedTime(savedAt)}`
                      : draftState === "error"
                        ? "保存失败，输入后会自动重试"
                        : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  共 {parsed.items.length} 条 · 词语 {wordCount} · 句子 {sentenceCount}
                </span>
              </div>
            </div>
            <Textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={PLACEHOLDER}
              className="min-h-44 rounded-xl text-base leading-relaxed"
              aria-label="默写内容，每行一个词语或句子"
            />
            {parsed.warnings.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-xs text-amber-600" role="alert">
                {parsed.warnings.map((w) => (
                  <li key={w}>· {w}</li>
                ))}
              </ul>
            ) : null}
            {parsed.items.length > 0 ? (
              <div className="nice-scrollbar flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-xl bg-secondary/50 p-3">
                {parsed.items.map((it, i) => (
                  <span
                    key={`${it.text}-${i}`}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-xs shadow-sm"
                  >
                    <span className="font-bold text-primary">{i + 1}</span>
                    <span className="max-w-48 truncate font-medium">{it.text}</span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0 px-1.5 py-0 text-[10px]",
                        it.kind === "word" ? "bg-teal-100 text-teal-700" : "bg-orange-100 text-orange-700"
                      )}
                    >
                      {it.kind === "word" ? "词语" : "句子"}
                    </Badge>
                  </span>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              会自动去掉行首的"1、2."等序号；标点也算默写内容哦。内容随账号保存在数据库，换个浏览器登录同一账号也在。
            </p>
          </CardContent>
        </Card>

        {/* 报读设置 */}
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col gap-4 p-5">
            <h2 className="font-bold">报读设置</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block text-sm">朗读语速</Label>
                <Select
                  value={settings.speed}
                  onValueChange={(v) => setSettings((s) => ({ ...s, speed: v as ZhDictationSettings["speed"] }))}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl text-base" aria-label="朗读语速">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">正常语速</SelectItem>
                    <SelectItem value="slow">慢速（更适合低年级）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">每条读几遍</Label>
                <Select
                  value={String(clampReads(settings.readsPerItem))}
                  onValueChange={(v) => setSettings((s) => ({ ...s, readsPerItem: clampReads(Number(v)) }))}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl text-base" aria-label="每条读几遍">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ZH_READS_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        读 {n} 遍
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">每个词语/句子重复朗读的遍数。</p>
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">书写倒计时</Label>
                <Select
                  value={settings.writeTime === "auto" ? "auto" : String(settings.writeTime)}
                  onValueChange={(v) =>
                    setSettings((s) => ({ ...s, writeTime: v === "auto" ? "auto" : clampWriteTime(Number(v)) }))
                  }
                >
                  <SelectTrigger className="h-11 w-full rounded-xl text-base" aria-label="书写倒计时">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">自动（按内容长短）</SelectItem>
                    {WRITE_TIME_OPTIONS.map((sec) => (
                      <SelectItem key={sec} value={String(sec)}>
                        固定 {sec} 秒
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  每遍朗读后留给孩子的书写时间；"自动"按词语/句子长短调整。
                </p>
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">停顿节奏</Label>
                <Select
                  value={settings.pace}
                  onValueChange={(v) => setSettings((s) => ({ ...s, pace: v as ZhPace }))}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl text-base" aria-label="停顿节奏">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PACE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {settings.writeTime === "auto"
                    ? "自动倒计时下的整体节奏（紧凑/标准/从容）。"
                    : "已固定书写时间，此档位暂不参与。"}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-4 py-3">
              <div>
                <Label htmlFor="announce-index" className="text-sm font-bold">
                  报序号
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">每条开始前先读"第几个"，方便对照着写。</p>
              </div>
              <Switch
                id="announce-index"
                checked={settings.announceIndex}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, announceIndex: v }))}
              />
            </div>
            {/* 家长密码：默写中查看本词的门禁 */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/50 px-4 py-3">
              <div className="min-w-0">
                <Label className="flex items-center gap-1.5 text-sm font-bold">
                  <KeyRound className="size-4 text-primary" aria-hidden />
                  查看本词密码
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  默写中"家长查看本词"需输入此密码，换词后自动重新上锁，孩子偷看不了。
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    "px-2 py-0 text-[10px] font-bold",
                    settings.revealPinSet ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"
                  )}
                >
                  {settings.revealPinSet ? "已设置" : "未设置"}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-full px-3"
                  onClick={() => openPinManage("set")}
                >
                  {settings.revealPinSet ? "修改" : "设置"}
                </Button>
                {settings.revealPinSet ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9 rounded-full text-muted-foreground hover:text-rose-600"
                    onClick={() => openPinManage("clear")}
                    aria-label="清除家长密码"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
            {parsed.items.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                预计用时约 <span className="font-bold text-foreground">{formatDuration(estMs)}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* 最近词单 */}
        {history.length > 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="flex flex-col gap-3 p-5">
              <h2 className="flex items-center gap-2 font-bold">
                <History className="size-4 text-primary" aria-hidden />
                最近词单
              </h2>
              <div className="flex flex-col gap-2">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => restoreHistory(entry)}
                      className="min-w-0 flex-1 text-left"
                      aria-label={`恢复词单：${entry.items[0]?.text ?? ""} 等 ${entry.items.length} 条`}
                    >
                      <p className="truncate text-sm font-bold">
                        {entry.items.map((i) => i.text).join("、")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entry.items.length} 条 · 点击恢复
                      </p>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-rose-600"
                      onClick={() => removeHistory(entry.id)}
                      aria-label="删除这份词单"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* 操作 */}
        <div className="flex gap-3">
          <Button
            size="lg"
            className="h-12 flex-1 rounded-full text-base font-bold"
            onClick={handleStart}
            disabled={parsed.items.length === 0}
          >
            <Play className="size-5" aria-hidden />
            开始默写（{parsed.items.length} 条）
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 rounded-full px-5"
            onClick={clearAll}
            disabled={raw.length === 0}
          >
            <Trash2 className="size-4" aria-hidden />
            清空
          </Button>
        </div>

        {/* 使用提示 */}
        <Card className="rounded-2xl border-teal-200/70 bg-teal-50/60">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-teal-600" aria-hidden />
            <div className="text-sm text-teal-800">
              <p className="font-bold">这样用最省心</p>
              <ul className="mt-1 flex flex-col gap-0.5 leading-relaxed text-teal-700/90">
                <li>· 孩子不用看屏幕，听声音写就行；读几遍、写多久都能在报读设置里调</li>
                <li>· 录入内容自动保存到账号，换个浏览器登录同一账号都在</li>
                <li>· 默写中家长可"查看本词"对答案，需要家长密码，孩子偷看不了</li>
                <li>· 随时暂停/继续，可以重读本词、跳过本词；写完点"结束默写"逐条重听核对</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <PinDialog
          open={pinOpen}
          mode={pinMode}
          pinInput={pinInput}
          pinError={pinError}
          busy={pinBusy}
          onInputChange={(v) => {
            setPinInput(v.replace(/[^\d]/g, ""));
            if (pinError) setPinError("");
          }}
          onSubmit={submitPinDialog}
          onOpenChange={setPinOpen}
        />
        <PinManageDialog
          open={manageOpen}
          mode={manageMode}
          hasExisting={settings.revealPinSet === true}
          verifyMode={verifyMode}
          verifyInput={verifyInput}
          newPin={newPin}
          confirmPin={confirmPin}
          error={manageError}
          busy={manageBusy}
          onVerifyModeChange={setVerifyMode}
          onVerifyInputChange={setVerifyInput}
          onNewPinChange={setNewPin}
          onConfirmPinChange={setConfirmPin}
          onSubmit={submitPinManage}
          onOpenChange={setManageOpen}
        />
      </motion.div>
    );
  }

  /* ============ 默写中 ============ */
  if (stage === "session") {
    const total = parsed.items.length;
    const currentText = parsed.items[ss.index]?.text ?? "";
    const currentKind = parsed.items[ss.index]?.kind ?? "word";
    const countdownSec = Math.ceil(ss.remainMs / 1000);
    const readsTotal = clampReads(settings.readsPerItem);
    const repDots = Array.from({ length: readsTotal }, (_, i) => i + 1);
    const revealCurrent = revealedIdx !== null && revealedIdx === ss.index;

    return (
      <motion.div {...enterFadeUp()} className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">语文默写进行中</h1>
          <p className="mt-1 text-sm text-muted-foreground">孩子不用看屏幕，听声音写就行，家长可随时控制节奏。</p>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center gap-5 p-6 text-center">
            {/* 进度 */}
            <div className="flex w-full flex-col items-center gap-3">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-xl font-extrabold tracking-tight">
                  第 {Math.min(ss.index + 1, total)} / {total} 个
                </span>
                <Badge
                  variant="secondary"
                  className={cn(
                    currentKind === "word" ? "bg-teal-100 text-teal-700" : "bg-orange-100 text-orange-700"
                  )}
                >
                  {currentKind === "word" ? "词语" : "句子"}
                </Badge>
                <span className="flex items-center gap-1" aria-label={`当前第 ${ss.rep} 遍，共 ${readsTotal} 遍`}>
                  {repDots.map((d) => (
                    <span
                      key={d}
                      aria-hidden
                      className={cn(
                        "size-2.5 rounded-full transition-colors",
                        d <= ss.rep ? "bg-primary" : "bg-border"
                      )}
                    />
                  ))}
                </span>
              </div>
              <Progress value={total > 0 ? (ss.index / total) * 100 : 0} className="h-2 w-full max-w-md" />
            </div>

            {/* 阶段展示（不出现词条内容） */}
            <div className="flex min-h-36 flex-col items-center justify-center gap-2">
              {ss.status === "paused" ? (
                <>
                  <span className="flex size-14 items-center justify-center rounded-full bg-secondary">
                    <Pause className="size-7 text-muted-foreground" aria-hidden />
                  </span>
                  <p className="text-2xl font-extrabold">已暂停</p>
                  <p className="text-sm text-muted-foreground">点"继续"接着报</p>
                </>
              ) : ss.phase === "gap" ? (
                <>
                  <p className="text-6xl font-extrabold tabular-nums tracking-tight text-primary" aria-live="off">
                    {countdownSec}
                    <span className="ml-1 text-xl font-bold text-muted-foreground">秒</span>
                  </p>
                  <p className="text-lg font-bold">请认真书写</p>
                  <Progress
                    value={ss.gapMs > 0 ? (ss.remainMs / ss.gapMs) * 100 : 0}
                    className="h-1.5 w-40"
                    aria-label="剩余书写时间"
                  />
                </>
              ) : (
                <>
                  <Volume2 className="size-12 animate-pulse text-primary" aria-hidden />
                  <p className="text-lg font-bold">
                    {ss.phase === "lead-in"
                      ? settings.announceIndex
                        ? "正在报序号…"
                        : "准备开始…"
                      : `正在读第 ${ss.rep} 遍…`}
                  </p>
                  <p className="text-sm text-muted-foreground">竖起小耳朵，认真听～</p>
                </>
              )}
            </div>

            {/* 控制 */}
            <div className="grid w-full max-w-md grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Button
                className="h-11 rounded-full font-bold"
                onClick={() => (ss.status === "paused" ? session.resume() : session.pause())}
                disabled={ss.status === "finished"}
              >
                {ss.status === "paused" ? (
                  <Play className="size-4" aria-hidden />
                ) : (
                  <Pause className="size-4" aria-hidden />
                )}
                {ss.status === "paused" ? "继续" : "暂停"}
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-full"
                onClick={session.replayCurrent}
                disabled={ss.status !== "running" && ss.status !== "paused"}
              >
                <RotateCcw className="size-4" aria-hidden />
                重读本词
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-full"
                onClick={session.skip}
                disabled={ss.status !== "running" && ss.status !== "paused"}
              >
                <SkipForward className="size-4" aria-hidden />
                跳过本词
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="h-11 rounded-full text-rose-600 hover:text-rose-600">
                    <Square className="size-4" aria-hidden />
                    结束默写
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确定结束这次默写吗？</AlertDialogTitle>
                    <AlertDialogDescription>
                      结束后可以回到编辑页修改词单，也可以稍后再来一遍。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>继续默写</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-rose-600 text-white hover:bg-rose-600/90"
                      onClick={() => {
                        session.stop();
                        toast.info("已结束本次默写，词单已保留");
                      }}
                    >
                      结束
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* 家长对答案：需要家长密码验证；换到下一条自动上锁 */}
            <div className="flex min-h-12 flex-col items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-muted-foreground"
                onClick={() => {
                  if (revealCurrent) {
                    setRevealedIdx(null);
                    return;
                  }
                  openPinDialog();
                }}
                aria-pressed={revealCurrent}
                aria-label={revealCurrent ? "隐藏本词" : "家长查看本词（需家长密码）"}
              >
                {revealCurrent ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                {revealCurrent ? "隐藏本词" : "家长查看本词"}
              </Button>
              {revealCurrent ? (
                <p className="text-2xl font-extrabold tracking-[0.2em]">{currentText || "—"}</p>
              ) : (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <KeyRound className="size-3" aria-hidden />
                  {settings.revealPinSet ? "需输入家长密码" : "首次使用需设置家长密码"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <PinDialog
          open={pinOpen}
          mode={pinMode}
          pinInput={pinInput}
          pinError={pinError}
          busy={pinBusy}
          onInputChange={(v) => {
            setPinInput(v.replace(/[^\d]/g, ""));
            if (pinError) setPinError("");
          }}
          onSubmit={submitPinDialog}
          onOpenChange={setPinOpen}
        />
      </motion.div>
    );
  }

  /* ============ 完成 ============ */
  const durationMs =
    ss.startedAt && ss.endedAt ? formatDuration(ss.endedAt - ss.startedAt) : formatDuration(estMs);

  return (
    <motion.div {...enterFadeUp()} className="flex flex-col gap-5">
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-teal-100 text-teal-600">
            <PartyPopper className="size-7" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">默写完成！</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              共 {parsed.items.length} 条 · 用时 {durationMs}
            </p>
          </div>

          <div className="nice-scrollbar flex max-h-96 w-full flex-col gap-2 overflow-y-auto pr-1 text-left">
            {parsed.items.map((it, i) => (
              <div
                key={`${it.text}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-base font-bold">{it.text}</span>
                <Badge
                  variant="secondary"
                  className={cn(
                    "shrink-0",
                    it.kind === "word" ? "bg-teal-100 text-teal-700" : "bg-orange-100 text-orange-700"
                  )}
                >
                  {it.kind === "word" ? "词语" : "句子"}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-primary"
                  onClick={() => session.previewSpeak(it.text)}
                  aria-label={`重听第${i + 1}条：${it.text}`}
                >
                  <Volume2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex w-full max-w-md gap-3">
            <Button className="h-12 flex-1 rounded-full text-base font-bold" onClick={handleAgain}>
              <Play className="size-5" aria-hidden />
              再来一遍
            </Button>
            <Button variant="outline" className="h-12 rounded-full px-5" onClick={() => session.reset()}>
              返回修改
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
