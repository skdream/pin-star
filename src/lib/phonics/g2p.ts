/**
 * 拼读星球 PhonicsStar — G2P（Grapheme-to-Phoneme）启发式发音预测
 *
 * ⚠️ 仅用于听写「错因诊断」（把学生的答案反推成音素序列，与目标词音素对比），
 *    不用于发音教学展示（教学一律使用词库逐词人工对齐的 phonemes/graphemes）。
 *
 * 算法：贪心最长匹配扫描器
 * 1. 例外词整词命中（静态例外表 + 调用方传入的 DB isTricky 词表 / 候选词库）
 * 2. Magic-E 预处理：a_e/i_e/o_e/u_e/e_e → 长元音 token（如 rane → r+TOKEN_A+n）
 * 3. 词尾处理：-ed/-es 按前接音素变音、词尾哑 e 丢弃、-le → /əl/
 * 4. 从左到右最长匹配：多字母拼式（tion/eigh/igh/air/...）优先于单字母
 * 5. 上下文规则：oo+k/t→短音、ch 前是 s→/k/、词首 kn/wr 静音、软音 c/g（后接 e/i/y）、
 *    词尾 s 清浊变音、y 词首→/j/ 词尾单音节→/aɪ/ 多音节→/ɪ/
 *
 * 自测用例（诊断引擎依赖）：
 *   g2p("ship")  → ["ʃ","ɪ","p"]        （sh→ʃ, i→ɪ, p）
 *   g2p("rane")  → ["r","eɪ","n"]       （r, a_e→eɪ magic-e, n）
 *   g2p("runing")→ ["r","ʌ","n","ɪ","ŋ"]（可接受形态；ng→ŋ）
 *   g2p("bana")  → ["b","æ","n","æ"]    （宽松即可，长度短于目标即可判 SEGMENT）
 *   g2p("sheep") → ["ʃ","iː","p"]       （sh, ee, p）
 *   g2p("sed")   → ["s","e","d"]        （与 said 目标音素一致 → 判 IRREGULAR）
 */

import type { Grapheme } from "@/lib/api-client";

/** Magic-E 长元音 token（用控制字符避免与字母冲突） */
const TOK_A = "\u0001"; // a_e → eɪ
const TOK_I = "\u0002"; // i_e → aɪ
const TOK_O = "\u0003"; // o_e → əʊ
const TOK_U = "\u0004"; // u_e → juː
const TOK_E = "\u0005"; // e_e → iː

/** 拼式 → 音素 映射（覆盖词库 274 词用到的全部拼式） */
const GRAPHEME_MAP: Record<string, string> = {
  // 多字母组合（扫描时按长度优先）
  [TOK_A]: "eɪ",
  [TOK_I]: "aɪ",
  [TOK_O]: "əʊ",
  [TOK_U]: "juː",
  [TOK_E]: "iː",
  eigh: "eɪ",
  tion: "ʃən",
  igh: "aɪ",
  air: "eə",
  ear: "ɪə",
  ere: "eə",
  eir: "eə",
  our: "ɔː",
  oor: "ɔː",
  all: "ɔː",
  tch: "tʃ",
  dge: "dʒ",
  eye: "aɪ",
  ch: "tʃ",
  sh: "ʃ",
  th: "θ",
  ph: "f",
  ck: "k",
  qu: "kw",
  ng: "ŋ",
  wh: "w",
  ai: "eɪ",
  ay: "eɪ",
  ee: "iː",
  ea: "iː",
  oa: "əʊ",
  ow: "əʊ",
  oo: "uː",
  oi: "ɔɪ",
  oy: "ɔɪ",
  ou: "aʊ",
  ar: "ɑː",
  or: "ɔː",
  er: "ə",
  ir: "ɜː",
  ur: "ɜː",
  al: "ɔː",
  le: "əl",
  ie: "iː",
  eo: "iː",
  ue: "uː",
  ui: "uː",
  ed: "d", // 占位：实际读音由 contextLookup 按前接音素决定
  es: "z", // 占位：同上
  mb: "m", // 占位：仅词尾生效
  bb: "b",
  gg: "g",
  ff: "f",
  ll: "l",
  mm: "m",
  nn: "n",
  pp: "p",
  ss: "s",
  tt: "t",
  // 单字母常规音
  a: "æ",
  b: "b",
  c: "k",
  d: "d",
  e: "e",
  f: "f",
  g: "g",
  h: "h",
  i: "ɪ",
  j: "dʒ",
  k: "k",
  l: "l",
  m: "m",
  n: "n",
  o: "ɒ",
  p: "p",
  q: "k",
  r: "r",
  s: "s",
  t: "t",
  u: "ʌ",
  v: "v",
  w: "w",
  x: "ks",
  y: "ɪ",
  z: "z",
};

/** 静态例外词表（常见不规则但 DB 未标 tricky 的功能词/高频词） */
export const G2P_STATIC_EXCEPTIONS: Record<string, string[]> = {
  // 浊音 th（功能词/家人）
  the: ["ð", "ə"],
  this: ["ð", "ɪ", "s"],
  that: ["ð", "æ", "t"],
  these: ["ð", "iː", "z"],
  those: ["ð", "əʊ", "z"],
  they: ["ð", "eɪ"],
  them: ["ð", "e", "m"],
  then: ["ð", "e", "n"],
  than: ["ð", "æ", "n"],
  their: ["ð", "eə"],
  there: ["ð", "eə"],
  mother: ["m", "ʌ", "ð", "ə"],
  father: ["f", "ɑː", "ð", "ə"],
  brother: ["b", "r", "ʌ", "ð", "ə"],
  other: ["ʌ", "ð", "ə"],
  with: ["w", "ɪ", "ð"],
  // ow 读 aʊ 的词
  cow: ["k", "aʊ"],
  down: ["d", "aʊ", "n"],
  brown: ["b", "r", "aʊ", "n"],
  flower: ["f", "l", "aʊ", "ə"],
  // ea 读 e 的词
  head: ["h", "e", "d"],
  bread: ["b", "r", "e", "d"],
  // 硬音 g 例外
  get: ["g", "e", "t"],
  girl: ["g", "ɜː", "l"],
  give: ["g", "ɪ", "v"],
  gift: ["g", "ɪ", "f", "t"],
  // 软音 c/g 但 e 是 magic-e（扫描器按 c+辅音+e 判硬音，这里修正）
  nice: ["n", "aɪ", "s"],
  face: ["f", "eɪ", "s"],
  ice: ["aɪ", "s"],
  page: ["p", "eɪ", "dʒ"],
  cage: ["k", "eɪ", "dʒ"],
  // 短元音 + e 例外（防 magic-e 误判）
  have: ["h", "æ", "v"],
  come: ["k", "ʌ", "m"],
  some: ["s", "ʌ", "m"],
  one: ["w", "ʌ", "n"],
  done: ["d", "ʌ", "n"],
  gone: ["g", "ɒ", "n"],
  are: ["ɑː"],
  // 词尾 s 读 s（不按清浊规则变 z）
  bus: ["b", "ʌ", "s"],
  yes: ["j", "e", "s"],
  plus: ["p", "l", "ʌ", "s"],
  // 功能词
  be: ["b", "iː"],
  he: ["h", "iː"],
  me: ["m", "iː"],
  we: ["w", "iː"],
  she: ["ʃ", "iː"],
  her: ["h", "ɜː"],
  here: ["h", "ɪə"],
  eight: ["eɪ", "t"],
  ear: ["ɪə"],
  bear: ["b", "eə"],
  pear: ["p", "eə"],
  shed: ["ʃ", "e", "d"],
  school: ["s", "k", "uː", "l"],
};

const UNVOICED = new Set(["p", "t", "k", "f", "θ", "s", "ʃ", "tʃ"]);
const SIBILANT = new Set(["s", "z", "ʃ", "tʃ", "ʒ", "ks"]);
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

export interface G2POptions {
  /** 整词例外：headword → 音素序列（DB isTricky 词 / 候选词库） */
  exceptions?: Record<string, string[]>;
}

/**
 * 把拼写预测为音素序列（启发式，仅用于错因诊断）。
 * 空串返回 []。
 */
export function g2p(word: string, opts?: G2POptions): string[] {
  const raw = word.trim().toLowerCase();
  if (!raw) return [];

  // 1. 整词例外（调用方传入优先，其次静态例外）
  const ex = opts?.exceptions?.[raw] ?? G2P_STATIC_EXCEPTIONS[raw];
  if (ex) return [...ex];

  let s = raw;

  // 2. Magic-E 预处理：词尾 V+单辅音+e → 长元音 token
  const magicRules: Array<[RegExp, string]> = [
    [/a([^aeiouy])e$/, TOK_A + "$1"],
    [/i([^aeiouy])e$/, TOK_I + "$1"],
    [/o([^aeiouy])e$/, TOK_O + "$1"],
    [/u([^aeiouy])e$/, TOK_U + "$1"],
    [/e([^aeiouy])e$/, TOK_E + "$1"],
  ];
  for (const [re, rep] of magicRules) {
    if (re.test(s)) {
      s = s.replace(re, rep);
      break;
    }
  }

  // 3. 词尾哑 e 丢弃（保留 le/ed/es 结尾交给扫描器的上下文规则）
  // 词尾哑 e 丢弃：仅当 e 前是辅音（保留 see/knee 的 ee、le/ed/es 结尾）
  if (/[bcdfghjklmnpqrstvwxz]e$/.test(s) && s.length >= 3 && !/(le|ed|es)$/.test(s)) {
    s = s.slice(0, -1);
  }

  // 4. 贪心最长匹配扫描
  const n = s.length;
  const out: string[] = [];
  let i = 0;
  while (i < n) {
    // 词首 kn / wr 静音
    if (i === 0) {
      if (s.startsWith("kn")) {
        out.push("n");
        i += 2;
        continue;
      }
      if (s.startsWith("wr")) {
        out.push("r");
        i += 2;
        continue;
      }
    }
    let matched = false;
    for (let len = Math.min(4, n - i); len >= 1; len--) {
      const sub = s.slice(i, i + len);
      const atEnd = i + len === n;
      const prevPhoneme = out.length > 0 ? out[out.length - 1] : "";
      const nextChar = i + len < n ? s[i + len] : "";
      const phoneme = contextLookup(sub, {
        atEnd,
        prevChar: i > 0 ? s[i - 1] : "",
        nextChar,
        prevPhoneme,
        isStart: i === 0,
        wordLen: n,
      });
      if (phoneme !== null) {
        out.push(phoneme);
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) i += 1; // 无法识别的字符（连字符/撇号等）跳过
  }
  return out;
}

interface LookupCtx {
  atEnd: boolean;
  prevChar: string;
  nextChar: string;
  prevPhoneme: string;
  isStart: boolean;
  wordLen: number;
}

/** 带上下文的拼式查询；返回 null 表示此长度不适用（尝试更短拼式） */
function contextLookup(sub: string, ctx: LookupCtx): string | null {
  const base = GRAPHEME_MAP[sub];
  if (base === undefined) return null;

  switch (sub) {
    case "mb": // 词尾 mb → /m/（climb）；词中按 m + b 拆
      return ctx.atEnd ? "m" : null;
    case "le": // 词尾「辅音+le」→ /əl/；否则拆 l + e
      if (ctx.atEnd && ctx.prevChar && !VOWELS.has(ctx.prevChar)) return "əl";
      return null;
    case "ed": {
      // 词尾 -ed 按前接音素：t/d 后 /ɪd/，清音后 /t/，浊音后 /d/
      // 词干 < 2 字母（bed/red/sed）时 e 是真元音，不按后缀处理
      if (!ctx.atEnd || ctx.wordLen - 2 < 2) return null;
      const p = ctx.prevPhoneme;
      if (p === "t" || p === "d") return "ɪd";
      if (UNVOICED.has(p)) return "t";
      return "d";
    }
    case "es": {
      // 词尾 -es：咝音后 /ɪz/，清音后 /s/，浊音后 /z/（词干 < 2 字母不按后缀处理）
      if (!ctx.atEnd || ctx.wordLen - 2 < 2) return null;
      const p = ctx.prevPhoneme;
      if (SIBILANT.has(p)) return "ɪz";
      if (UNVOICED.has(p)) return "s";
      return "z";
    }
    case "s": {
      // 词尾单 s 清浊变音（cats→s / dogs→z）
      if (ctx.atEnd) return UNVOICED.has(ctx.prevPhoneme) ? "s" : "z";
      return "s";
    }
    case "oo": // k/t 前短音（book/foot），否则长音（moon/food）
      if (ctx.nextChar === "k" || ctx.nextChar === "t") return "ʊ";
      return "uː";
    case "ch": // s 后读 /k/（school）
      if (ctx.prevChar === "s") return "k";
      return "tʃ";
    case "c": // 软音 c：后接 e/i/y
      if (ctx.nextChar === "e" || ctx.nextChar === "i" || ctx.nextChar === "y") return "s";
      return "k";
    case "g": // 软音 g：后接 e/i/y（get/girl/give 等走例外表）
      if (ctx.nextChar === "e" || ctx.nextChar === "i" || ctx.nextChar === "y") return "dʒ";
      return "g";
    case "y": // 词首 /j/（yes/yellow）；词尾单音节 /aɪ/（my）；其余 /ɪ/（happy）
      if (ctx.isStart) return "j";
      if (ctx.atEnd) return ctx.wordLen <= 3 ? "aɪ" : "ɪ";
      return "ɪ";
    case "o": // 双字母词尾 o 读 /əʊ/（no/go/so）
      if (ctx.atEnd && ctx.wordLen === 2) return "əʊ";
      return "ɒ";
    default:
      return base;
  }
}

