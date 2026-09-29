/**
 * 拼读星球 PhonicsStar — API 客户端
 * 统一类型定义 + fetch 封装（10s 超时、统一错误处理、全部相对路径）
 */

import type { ZhDictationItem, ZhDictationSettings } from "@/lib/zh-dictation";

/* ============ 基础类型 ============ */

export type Accent = "en-US" | "en-GB";
export type TtsEngine = "browser" | "server";
export type Speed = "normal" | "slow";
export type HintLevel = "none" | "first" | "chinese" | "phonemes";
export type CheckMode = "DICTATION" | "REVIEW" | "LEARN";
export type DictationSource = "unit" | "errorbook" | "custom";
export type Rating = 1 | 2 | 3 | 4;

export interface Grapheme {
  /** 字母/字母组合，如 "sh" */
  g: string;
  /** 对应音素，如 "ʃ" */
  p: string;
  /** 不规则/静音标记 */
  x?: boolean;
}

export interface WordRuleRef {
  code: string;
  name: string;
  level: number;
}

export interface WordDTO {
  id: string;
  headword: string;
  /** 不带斜杠，如 "ʃɪp"，展示时加 / / */
  ipa: string;
  phonemes: string[];
  graphemes: Grapheme[];
  syllables: string[];
  translation: string;
  category: string;
  isTricky: boolean;
  difficulty: number;
  frequency: number;
  cefr: string;
  rules?: WordRuleRef[];
}

/* ============ 用户 ============ */

export interface UserSettings {
  playCount?: number;
  speed?: Speed;
  hintLevel?: HintLevel;
  autoNext?: boolean;
  /** 报听写上次选择的教材/单元（服务端白名单合并，空串=未选） */
  dictBookId?: string;
  dictUnitId?: string;
  /** 语文默写报读设置（服务端深度受限合并） */
  zhDictation?: Partial<ZhDictationSettings>;
}

export interface UserDTO {
  id: string;
  nickname: string;
  grade: number;
  accentPref: Accent;
  ttsEngine: TtsEngine;
  settings: UserSettings;
}

export interface UserPatch extends Partial<Omit<UserDTO, "settings">> {
  settings?: UserSettings;
}

/* ============ 配置 / 服务状态 ============ */

export interface ServiceEnvVar {
  name: string;
  configured: boolean;
}

export interface ServiceStatus {
  key: string;
  name: string;
  description: string;
  configured: boolean;
  envVars: ServiceEnvVar[];
}

export interface ConfigDTO {
  services: ServiceStatus[];
}

/* ============ 课程 ============ */

export interface LevelSummary {
  level: number;
  title: string;
  subtitle: string;
  ruleCount: number;
  wordCount: number;
}

export interface LevelsDTO {
  levels: LevelSummary[];
}

export interface RuleDTO {
  id: string;
  code: string;
  level: number;
  name: string;
  pattern: string;
  description: string;
  tip: string;
  examples: WordDTO[];
}

export interface LevelDetailDTO {
  level: number;
  title: string;
  subtitle: string;
  rules: RuleDTO[];
  practiceWords: WordDTO[];
}

/* ============ 教材 ============ */

export interface UnitDTO {
  id: string;
  name: string;
  ord: number;
  wordCount: number;
}

export interface BookDTO {
  id: string;
  publisher: string;
  grade: number;
  volume: number | string;
  units: UnitDTO[];
}

export interface BooksDTO {
  books: BookDTO[];
}

/* ============ 听写 ============ */

export interface DictationWordsReq {
  source: DictationSource;
  unitId?: string;
  wordIds?: string[];
  count?: number;
}

export interface LetterFeedbackItem {
  char: string;
  status: "correct" | "wrong" | "missing";
}

export interface PhonemeFeedbackItem {
  g: string;
  p: string;
  status: "ok" | "diff";
}

export interface Remediation {
  ruleCode: string;
  ruleName: string;
  description: string;
  tip: string;
}

export interface CheckResult {
  correct: boolean;
  word: WordDTO;
  letterFeedback: LetterFeedbackItem[];
  missing: string;
  extra: string;
  phonemeFeedback: PhonemeFeedbackItem[];
  /** PHONEME | SEGMENT | PATTERN | IRREGULAR | SUFFIX | MEMORY | HANDWRITING */
  errorTypes: string[];
  remediation: Remediation | null;
  /** 答案恰是另一个词（近音词干扰命中） */
  realWord: string | null;
  isTricky: boolean;
}

export interface CheckReq {
  wordId: string;
  answer: string;
  mode: CheckMode;
  durationMs?: number;
}

/* ============ 复习（FSRS） ============ */

export interface ReviewCardDTO {
  id: string;
  due: string;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
}

export interface ReviewCardWithWord {
  card: ReviewCardDTO;
  word: WordDTO;
}

export interface ReviewTodayDTO {
  dueCount: number;
  cards: ReviewCardWithWord[];
}

/* ============ 错词本 ============ */

export interface ErrorBookItem {
  expected: string;
  actual: string;
  count: number;
  lastAt: string;
  word: WordDTO;
}

export interface ErrorBookGroup {
  errorType: string;
  label: string;
  count: number;
  items: ErrorBookItem[];
}

export interface ErrorBookDTO {
  groups: ErrorBookGroup[];
}

/* ============ 统计 ============ */

export interface TodayStats {
  dictationCount: number;
  correctCount: number;
  reviewCount: number;
  minutes: number;
  accuracy: number;
}

export interface WeekPoint {
  date: string;
  dictationCount: number;
  correctCount: number;
  accuracy: number;
}

export interface ErrorDistPoint {
  errorType: string;
  label: string;
  count: number;
}

export interface StatsDTO {
  today: TodayStats;
  weekly: WeekPoint[];
  errorDistribution: ErrorDistPoint[];
  streakDays: number;
  totalDictations: number;
  masteredWords: number;
  totalWords: number;
}

/* ============ 分类 / 错因中文映射 ============ */

export const CATEGORY_LABELS: Record<string, string> = {
  animal: "动物",
  food: "食物",
  color: "颜色",
  school: "文具",
  body: "身体",
  family: "家人",
  number: "数字",
  nature: "自然",
  toy: "玩具",
  transport: "交通",
  action: "动作",
  description: "描述",
  general: "其他",
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);

export const ERROR_TYPE_LABELS: Record<string, string> = {
  PHONEME: "音辨错误",
  SEGMENT: "切分错误",
  PATTERN: "拼式错误",
  IRREGULAR: "不规则词",
  SUFFIX: "后缀双写",
  MEMORY: "记忆遗忘",
  HANDWRITING: "书写错误",
};

/* ============ fetch 封装 ============ */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const TIMEOUT_MS = 10_000;

/* ============ 会话 token（localStorage 持久化） ============
 * 预览面板在跨站 iframe 中运行时，浏览器的第三方 cookie 策略会拦截
 * SameSite=Lax 的会话 cookie，导致“登录成功但接口全 401”。
 * 双通道方案：登录/注册响应返回 sessionToken，前端存 localStorage，
 * 每个请求统一带 Authorization: Bearer 头；cookie 通道保留作为同源直连
 * 时的冗余，服务端两条通道都能识别。 */
const SESSION_TOKEN_KEY = "ps_session_token";

function readSessionToken(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeSessionToken(token: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (token) window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    else window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* 存储不可用（隐私模式等）时静默降级为 cookie 通道 */
  }
}

/** 是否存在本地会话 token（供启动快速判断，不代表服务端会话有效） */
export function hasStoredSessionToken(): boolean {
  return !!readSessionToken();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const token = readSessionToken();
  try {
    const res = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      let message = `请求失败（${res.status}）`;
      try {
        const data = (await res.json()) as { error?: unknown; message?: unknown };
        if (data?.error) message = String(data.error);
        else if (data?.message) message = String(data.message);
      } catch {
        // 响应体不是 JSON，保持默认错误信息
      }
      throw new ApiError(message, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError("请求超时啦，请重试", 408);
    }
    throw new ApiError(e instanceof Error ? e.message : "网络异常，请稍后再试", 0);
  } finally {
    clearTimeout(timer);
  }
}

/* ============ API 方法 ============ */

export function getUser(): Promise<UserDTO> {
  return request<UserDTO>("/api/user");
}

export function updateUserApi(patch: UserPatch): Promise<UserDTO> {
  return request<UserDTO>("/api/user", { method: "PUT", body: JSON.stringify(patch) });
}

export function getConfig(): Promise<ConfigDTO> {
  return request<ConfigDTO>("/api/config");
}

export function getCurriculumLevels(): Promise<LevelsDTO> {
  return request<LevelsDTO>("/api/curriculum");
}

export function getCurriculumLevel(level: number): Promise<LevelDetailDTO> {
  return request<LevelDetailDTO>(`/api/curriculum/${level}`);
}

export function getBooks(): Promise<BooksDTO> {
  return request<BooksDTO>("/api/books");
}

export function getWords(params?: { q?: string; category?: string; limit?: number }): Promise<WordsDTO> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.category) sp.set("category", params.category);
  sp.set("limit", String(params?.limit ?? 50));
  return request<{ words: WordDTO[] }>(`/api/words?${sp.toString()}`);
}

export interface WordsDTO {
  words: WordDTO[];
}

export function postDictationWords(body: DictationWordsReq): Promise<WordsDTO> {
  return request<WordsDTO>("/api/dictation/words", { method: "POST", body: JSON.stringify(body) });
}

export function checkWord(body: CheckReq): Promise<CheckResult> {
  return request<CheckResult>("/api/dictation/check", { method: "POST", body: JSON.stringify(body) });
}

export function getReviewToday(): Promise<ReviewTodayDTO> {
  return request<ReviewTodayDTO>("/api/review/today");
}

export function rateReview(wordId: string, rating: Rating): Promise<{ card: ReviewCardDTO }> {
  return request<{ card: ReviewCardDTO }>("/api/review/rate", {
    method: "POST",
    body: JSON.stringify({ wordId, rating }),
  });
}

export function getErrorBook(): Promise<ErrorBookDTO> {
  return request<ErrorBookDTO>("/api/errorbook");
}

export function resolveError(wordId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/errorbook/resolve", {
    method: "POST",
    body: JSON.stringify({ wordId }),
  });
}

export function getStats(): Promise<StatsDTO> {
  return request<StatsDTO>("/api/stats");
}

/** 服务端 TTS 音频地址（供 use-speech / 中文报读使用；zh-CN 为语文默写专用） */
export type TtsAccent = Accent | "zh-CN";

export function ttsUrl(text: string, speed: Speed, accent: TtsAccent): string {
  const sp = new URLSearchParams({ text, speed, accent });
  return `/api/tts?${sp.toString()}`;
}

/* ============ 认证（注册 / 登录 / 会话） ============ */

export interface AuthResponse {
  user: UserDTO;
  /** 会话 token：前端存 localStorage，后续请求走 Authorization 头（cookie 通道可能被 iframe 屏蔽） */
  sessionToken?: string;
}

export interface RegisterBody {
  username: string;
  nickname?: string;
  password: string;
  grade: number;
}

export function registerApi(body: RegisterBody): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }).then(
    (res) => {
      if (res.sessionToken) writeSessionToken(res.sessionToken);
      return res;
    }
  );
}

export function loginApi(body: { username: string; password: string }): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }).then(
    (res) => {
      if (res.sessionToken) writeSessionToken(res.sessionToken);
      return res;
    }
  );
}

export function logoutApi(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }).finally(() => {
    writeSessionToken(null);
  });
}

/** 当前会话用户；未登录时抛 ApiError(401)，并清理本地已失效的 token */
export function fetchMe(): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/me").catch((e) => {
    if (e instanceof ApiError && e.status === 401) writeSessionToken(null);
    throw e;
  });
}

/* ============ 语文默写（草稿 / 最近词单 / 默写广场） ============ */

export interface ZhHistoryEntryDTO {
  id: string;
  savedAt: string;
  items: ZhDictationItem[];
}

export interface ZhDictationDataDTO {
  draft: string;
  history: ZhHistoryEntryDTO[];
}

export function getZhDictationData(): Promise<ZhDictationDataDTO> {
  return request<ZhDictationDataDTO>("/api/zh-dictation");
}

export function saveZhDraftApi(raw: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/api/zh-dictation", { method: "PUT", body: JSON.stringify({ raw }) });
}

/** 页面关闭/切走时的草稿补传（fire-and-forget）
 * 用 fetch keepalive 而非 sendBeacon：sendBeacon 无法携带 Authorization 头，
 * 在 cookie 被 iframe 策略拦截时必然 401；keepalive 支持 header 且同样在页面卸载后送达 */
export function flushZhDraftBeacon(raw: string): void {
  try {
    if (typeof window === "undefined") return;
    const token = readSessionToken();
    void fetch("/api/zh-dictation/draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ raw }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* 忽略 */
  }
}

export function saveZhHistoryApi(items: ZhDictationItem[]): Promise<{ history: ZhHistoryEntryDTO[] }> {
  return request<{ history: ZhHistoryEntryDTO[] }>("/api/zh-dictation", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

/* ============ 家长查看密码（唯一写通道，服务端强制验证） ============ */

export interface ZhPinBody {
  action: "verify" | "set" | "clear";
  /** set 时的新密码（4~6 位数字） */
  pin?: string;
  /** 已设密码时：当前家长密码（与 loginPassword 二选一） */
  oldPin?: string;
  /** 已设密码时：账号登录密码（忘记家长密码时的恢复通道） */
  loginPassword?: string;
}

export interface ZhPinResponse {
  ok: boolean;
  user?: UserDTO;
  message?: string;
}

export function saveZhPinApi(body: ZhPinBody): Promise<ZhPinResponse> {
  return request<ZhPinResponse>("/api/zh-dictation/pin", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteZhHistoryApi(id: string): Promise<{ history: ZhHistoryEntryDTO[] }> {
  return request<{ history: ZhHistoryEntryDTO[] }>("/api/zh-dictation", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

export interface ZhPlazaEntryDTO {
  id: string;
  userId: string;
  nickname: string;
  grade: number;
  savedAt: string;
  items: ZhDictationItem[];
}

export function getZhPlaza(): Promise<{ plaza: ZhPlazaEntryDTO[] }> {
  return request<{ plaza: ZhPlazaEntryDTO[] }>("/api/zh-dictation/plaza");
}

/* ============ 工具 ============ */

/** 本地兜底用户：接口未就绪时保证整站可用 */
export const DEFAULT_USER: UserDTO = {
  id: "local-user",
  nickname: "小学员",
  grade: 3,
  accentPref: "en-US",
  ttsEngine: "browser",
  settings: {
    playCount: 2,
    speed: "normal",
    hintLevel: "none",
    autoNext: true,
  },
};

/** accuracy 可能是 0~1 或 0~100，统一为 0~100 整数 */
export function pct(value: number | undefined | null): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  const v = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** 日期显示为 MM-DD（容错处理） */
export function shortDate(date: string | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (!Number.isNaN(d.getTime())) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${m}-${day}`;
  }
  return date.length >= 10 ? date.slice(5) : date;
}
