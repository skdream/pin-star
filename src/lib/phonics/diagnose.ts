/**
 * 拼读星球 PhonicsStar — 错因诊断引擎（纯函数，可独立测试）
 *
 * 输入：目标词（音素/拼式/规则）+ 学生答案 + 词库（headword→phonemes）
 * 输出：对错、逐字母批改、逐音素批改、错因类型、讲解规则、近音词命中。
 *
 * 诊断优先级：
 * 1. 空答案 → SEGMENT
 * 2. 完全正确 → correct（复习卡上次错这次对 → 附 MEMORY 修复注记）
 * 3. 答案恰是词库另一个词 → 最小对立体（音素仅 1 处不同 → PHONEME）否则 PATTERN/IRREGULAR
 * 4. 后缀/双写检测（优先级高于 g2p 粗判）：running→runing / making→makeing → SUFFIX
 * 5. g2p 预测音素 vs 目标音素：
 *    - 长度相同且相同 → 读音对拼写错 → IRREGULAR（tricky 或 x 拼式）/ PATTERN
 *    - 长度相同有差异 → PHONEME（tricky 且差异落在 x 拼式 → IRREGULAR）
 *    - 长度不同（漏音/多音）→ SEGMENT
 * 6. 兜底 → PATTERN
 */

import type { Grapheme, LetterFeedbackItem, PhonemeFeedbackItem } from "@/lib/api-client";
import { g2p } from "@/lib/phonics/g2p";

export type ErrorType =
  | "PHONEME"
  | "SEGMENT"
  | "PATTERN"
  | "IRREGULAR"
  | "SUFFIX"
  | "MEMORY"
  | "HANDWRITING";

export interface DiagnoseRule {
  code: string;
  name: string;
  pattern: string;
  description: string;
  tip: string;
}

export interface DiagnoseWord {
  headword: string;
  phonemes: string[];
  graphemes: Grapheme[];
  isTricky: boolean;
  /** 按关联顺序（WordRule.position）排序的规则 */
  rules: DiagnoseRule[];
}

export interface Remediation {
  ruleCode: string;
  ruleName: string;
  description: string;
  tip: string;
}

export interface DiagnoseOptions {
  /** 词库整词表：headword → phonemes（用于近音词命中与例外发音） */
  lexicon?: Record<string, string[]>;
  /** 该词复习卡上次结果（"WRONG" 时答对附 MEMORY 修复注记） */
  reviewLastResult?: string;
  /** DB isTricky 词例外表（g2p 整词命中） */
  exceptions?: Record<string, string[]>;
}

export interface DiagnoseResult {
  correct: boolean;
  errorTypes: ErrorType[];
  letterFeedback: LetterFeedbackItem[];
  missing: string;
  extra: string;
  phonemeFeedback: PhonemeFeedbackItem[];
  realWord: string | null;
  remediation: Remediation | null;
}

/* ============ 逐字母 LCS 对齐 ============ */

export interface LetterAlign {
  items: LetterFeedbackItem[];
  missing: string;
  extra: string;
  /** 第一个未对准的目标字符下标（无错为 -1） */
  firstErrorIndex: number;
}

/**
 * 以目标词为基准做 LCS 字符对齐：
 * 对上的 → correct；错位配对 → wrong（显示答案字符）；目标独有 → missing；
 * 答案独有 → 进 extra。
 */
export function alignLetters(target: string, answer: string): LetterAlign {
  const m = target.length;
  const n = answer.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        target[i] === answer[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const items: LetterFeedbackItem[] = [];
  const missingChars: string[] = [];
  let extra = "";
  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    if (target[i] === answer[j]) {
      items.push({ char: target[i], status: "correct" });
      i++;
      j++;
      continue;
    }
    // 收集一个"错位区间"：目标侧与答案侧各自连续未对准的字符
    const gapT: string[] = [];
    const gapA: string[] = [];
    while (i < m && j < n && target[i] !== answer[j]) {
      if (dp[i + 1][j] >= dp[i][j + 1]) {
        gapT.push(target[i]);
        i++;
      } else {
        gapA.push(answer[j]);
        j++;
      }
    }
    const paired = Math.min(gapT.length, gapA.length);
    for (let k = 0; k < paired; k++) items.push({ char: gapA[k], status: "wrong" });
    for (let k = paired; k < gapT.length; k++) {
      items.push({ char: gapT[k], status: "missing" });
      missingChars.push(gapT[k]);
    }
    for (let k = paired; k < gapA.length; k++) extra += gapA[k];
  }
  while (i < m) {
    items.push({ char: target[i], status: "missing" });
    missingChars.push(target[i]);
    i++;
  }
  while (j < n) {
    extra += answer[j];
    j++;
  }

  const firstErrorIndex = items.findIndex((it) => it.status !== "correct");
  return { items, missing: missingChars.join(""), extra, firstErrorIndex };
}

/* ============ 逐音素反馈 ============ */

/** 目标词每个 grapheme 一条（含静音拼式），与答案的预测音素逐位对比 */
export function buildPhonemeFeedback(
  graphemes: Grapheme[],
  predicted: string[]
): PhonemeFeedbackItem[] {
  let idx = 0;
  return graphemes.map((gr) => {
    if (gr.p === "") return { g: gr.g, p: gr.p, status: "ok" as const }; // 静音拼式
    const got = predicted[idx];
    const status = got !== undefined && got === gr.p ? ("ok" as const) : ("diff" as const);
    idx += 1;
    return { g: gr.g, p: gr.p, status };
  });
}

/** 音素序列下标 → 目标词中覆盖它的 grapheme（用于 IRREGULAR 判定） */
function graphemeIndexOfPhoneme(graphemes: Grapheme[], phonemeIndex: number): number {
  let count = 0;
  for (let i = 0; i < graphemes.length; i++) {
    const gr = graphemes[i];
    if (gr.p === "") continue;
    if (phonemeIndex >= count && phonemeIndex < count + 1) return i;
    count += 1;
  }
  return -1;
}

/* ============ 后缀 / 双写检测 ============ */

/**
 * 命中返回 true：
 * a) 目标含连续双写字母而 answer 该处单写（running→runing）
 * b) 目标是去 e 加 ing/ed 形态而 answer 保留了 e（making→makeing）
 */
export function detectSuffixError(target: string, answer: string): boolean {
  for (let i = 0; i < target.length - 1; i++) {
    if (target[i] === target[i + 1] && /[a-z]/.test(target[i])) {
      const single = target.slice(0, i) + target.slice(i + 1);
      if (single === answer) return true;
    }
  }
  for (const suffix of ["ing", "ed"]) {
    if (target.endsWith(suffix)) {
      const stem = target.slice(0, -suffix.length);
      if (answer === `${stem}e${suffix}`) return true;
    }
  }
  return false;
}

/* ============ 讲解规则定位 ============ */

/** 判断某条规则的 pattern 是否覆盖指定拼式 */
function ruleMatchesGrapheme(rule: DiagnoseRule, g: string, nextIsSilentE: boolean): boolean {
  const tokens = rule.pattern
    .split("|")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.some((tok) => {
    if (tok === g) return true;
    // 单元音 + 词尾静音 e → magic-e 模式（a_e）
    if (nextIsSilentE && /^[aeiou]$/.test(g) && tok === `${g}_e`) return true;
    // c(e|i|y) 形态
    if (tok.includes("(") && tok[0] === g) return true;
    // 多字母拼式包含匹配（ai|ay 含 ai）
    if (g.length >= 2 && tok.includes(g)) return true;
    return false;
  });
}

/**
 * 讲解规则选择：
 * PATTERN/IRREGULAR 且能定位错误位置 → 优先找覆盖错误拼式的规则；否则取第一条关联规则。
 */
export function pickRemediation(
  word: DiagnoseWord,
  errorTypes: ErrorType[],
  errorCharIndex: number
): Remediation | null {
  if (word.rules.length === 0) return null;

  // PATTERN/IRREGULAR/PHONEME 都尝试按错误位置找规则（PHONEME 时能定位到写错的元音拼式）
  const wantPosition =
    errorTypes.includes("PATTERN") ||
    errorTypes.includes("IRREGULAR") ||
    errorTypes.includes("PHONEME");
  if (wantPosition && errorCharIndex >= 0) {
    // 定位错误字符所属拼式
    let pos = 0;
    for (let i = 0; i < word.graphemes.length; i++) {
      const g = word.graphemes[i];
      const len = g.g.length;
      if (errorCharIndex >= pos && errorCharIndex < pos + len) {
        const next = word.graphemes[i + 1];
        const nextSilent = next ? next.p === "" : false;
        const hit = word.rules.find((r) => ruleMatchesGrapheme(r, g.g.toLowerCase(), nextSilent));
        if (hit) return toRemediation(hit);
        break;
      }
      pos += len;
    }
  }
  return toRemediation(word.rules[0]);
}

function toRemediation(rule: DiagnoseRule): Remediation {
  return {
    ruleCode: rule.code,
    ruleName: rule.name,
    description: rule.description,
    tip: rule.tip,
  };
}

/* ============ 诊断主流程 ============ */

export function diagnose(
  target: DiagnoseWord,
  rawAnswer: string,
  opts: DiagnoseOptions = {}
): DiagnoseResult {
  const answer = rawAnswer.trim().toLowerCase();
  const targetP = target.phonemes;
  const letters = alignLetters(target.headword, answer);

  // 1. 空答案 → 切分错误
  if (!answer) {
    return {
      correct: false,
      errorTypes: ["SEGMENT"],
      letterFeedback: letters.items,
      missing: letters.missing,
      extra: "",
      phonemeFeedback: buildPhonemeFeedback(target.graphemes, []),
      realWord: null,
      remediation: pickRemediation(target, ["SEGMENT"], -1),
    };
  }

  // 2. 完全正确；复习卡上次错这次对 → 附 MEMORY 修复注记
  if (answer === target.headword) {
    const fixed = opts.reviewLastResult === "WRONG";
    return {
      correct: true,
      errorTypes: fixed ? ["MEMORY"] : [],
      letterFeedback: letters.items,
      missing: "",
      extra: "",
      phonemeFeedback: buildPhonemeFeedback(target.graphemes, targetP),
      realWord: null,
      remediation: null,
    };
  }

  // 3. 答案恰是词库另一个词 → 近音词干扰
  const realPhonemes = opts.lexicon?.[answer];
  if (realPhonemes && realPhonemes.length > 0) {
    let errorTypes: ErrorType[];
    if (realPhonemes.length === targetP.length) {
      const diffs = targetP.filter((p, i) => p !== realPhonemes[i]).length;
      errorTypes = diffs === 1 ? ["PHONEME"] : target.isTricky ? ["IRREGULAR"] : ["PATTERN"];
    } else {
      errorTypes = target.isTricky ? ["IRREGULAR"] : ["PATTERN"];
    }
    return {
      correct: false,
      errorTypes,
      letterFeedback: letters.items,
      missing: letters.missing,
      extra: letters.extra,
      phonemeFeedback: buildPhonemeFeedback(target.graphemes, realPhonemes),
      realWord: answer,
      remediation: pickRemediation(target, errorTypes, letters.firstErrorIndex),
    };
  }

  // 4. 后缀 / 双写检测（优先级高于 g2p 粗判）
  if (detectSuffixError(target.headword, answer)) {
    const errorTypes: ErrorType[] = ["SUFFIX"];
    return {
      correct: false,
      errorTypes,
      letterFeedback: letters.items,
      missing: letters.missing,
      extra: letters.extra,
      phonemeFeedback: buildPhonemeFeedback(
        target.graphemes,
        g2p(answer, { exceptions: opts.exceptions })
      ),
      realWord: null,
      remediation: pickRemediation(target, errorTypes, -1),
    };
  }

  // 5. g2p 预测音素 vs 目标音素
  const predicted = g2p(answer, { exceptions: opts.exceptions });
  let errorTypes: ErrorType[];

  if (predicted.length > 0 && predicted.length === targetP.length) {
    const diffPositions: number[] = [];
    for (let i = 0; i < targetP.length; i++) {
      if (targetP[i] !== predicted[i]) diffPositions.push(i);
    }
    if (diffPositions.length === 0) {
      // 读音对、拼写错（rain→rane / said→sed）
      const hasXGrapheme = target.graphemes.some((g) => g.x === true);
      errorTypes = target.isTricky || hasXGrapheme ? ["IRREGULAR"] : ["PATTERN"];
    } else {
      const diffInX = diffPositions.some((pi) => {
        const gi = graphemeIndexOfPhoneme(target.graphemes, pi);
        return gi >= 0 && target.graphemes[gi].x === true;
      });
      errorTypes = target.isTricky && diffInX ? ["IRREGULAR"] : ["PHONEME"];
    }
  } else {
    // 漏音 / 多音（banana→bana 等）
    errorTypes = ["SEGMENT"];
  }

  return {
    correct: false,
    errorTypes,
    letterFeedback: letters.items,
    missing: letters.missing,
    extra: letters.extra,
    phonemeFeedback: buildPhonemeFeedback(target.graphemes, predicted),
    realWord: null,
    remediation: pickRemediation(target, errorTypes, letters.firstErrorIndex),
  };
}
