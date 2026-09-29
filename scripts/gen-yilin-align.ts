/**
 * 译林教材词库 LLM 音素-字母对齐流水线
 * 运行：bun scripts/gen-yilin-align.ts [--batch=10] [--limit=N] [--batch-size=...]
 *
 * 流程：
 *  1. 读 prisma/yilin-src.json（6 册 48 单元词表）→ 汇总去重后的待对齐词
 *  2. 跳过 DB Word 表已存在的词（不重复对齐）
 *  3. 跳过 prisma/yilin-aligned.json 已对齐的词（断点续跑）
 *  4. 每批 8~12 词调用 z-ai-web-dev-sdk LLM，要求严格 JSON 输出逐词对齐
 *  5. 强校验（不合格丢弃，进入修复队列重试，反复失败则跳过）：
 *     - graphemes 的 g 序列连接 == headword 小写
 *     - graphemes 的 p 序列（去掉静音 p==""，复合音素按 "·" 展开）== phonemes
 *     - phonemes 全部在允许音素表内
 *  6. 每批完成立即写回 prisma/yilin-aligned.json（可随时中断重跑）
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SRC_FILE = path.join(ROOT, "prisma", "yilin-src.json");
const OUT_FILE = path.join(ROOT, "prisma", "yilin-aligned.json");

/* ============ CLI 参数 ============ */
const args = process.argv.slice(2);
function argNum(name: string, def: number): number {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return def;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : def;
}
const BATCH_SIZE = Math.min(Math.max(argNum("batch", 10), 8), 12);
const LIMIT = argNum("limit", Infinity);

/* ============ 允许音素表（seed.ts 44+扩展，另加弱元音 i/u） ============ */
const ALLOWED_PHONEMES = new Set([
  "æ", "e", "ɪ", "ɒ", "ʌ", "ʊ", "ə",
  "iː", "ɑː", "ɔː", "uː", "ɜː",
  "eɪ", "aɪ", "ɔɪ", "əʊ", "aʊ", "ɪə", "eə", "ʊə",
  "p", "b", "t", "d", "k", "g",
  "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h",
  "tʃ", "dʒ",
  "m", "n", "ŋ",
  "l", "r", "j", "w",
  "juː", "əl", "ks", "ɪd", "ɪz",
  // 弱化元音（happy/computer 等词尾）
  "i", "u",
]);

/* ============ 类型 ============ */
interface SrcUnit {
  name: string;
  ord: number;
  words: { word: string; translation: string }[];
}
interface SrcVolume {
  grade: number;
  volume: string;
  volumeCode: string;
  units: SrcUnit[];
}
interface Grapheme {
  g: string;
  p: string;
  x?: boolean;
}
interface AlignedWord {
  headword: string;
  ipa: string;
  phonemes: string[];
  graphemes: Grapheme[];
  syllables: string[];
  translation: string;
  category: string;
  difficulty: number;
  isTricky: boolean;
  cefr: string;
}

/* ============ 工具 ============ */
function expandP(p: string): string[] {
  if (p === "") return [];
  return p.split("·");
}

/** 强校验：返回错误描述，null 表示合格 */
function validate(headword: string, item: unknown): string | null {
  if (!item || typeof item !== "object") return "非对象";
  const it = item as Record<string, unknown>;
  const hw = headword.toLowerCase();
  const ihw = String(it.headword ?? "").trim().toLowerCase();
  if (ihw !== hw) return `headword 不匹配(${it.headword})`;

  const ipa = String(it.ipa ?? "").trim();
  if (!ipa) return "ipa 缺失";
  if (ipa.includes("/")) return "ipa 含斜杠";

  const ph = it.phonemes;
  if (!Array.isArray(ph) || ph.length === 0 || ph.length > 14) return "phonemes 数组非法";
  if (!ph.every((x) => typeof x === "string" && x.length > 0)) return "phonemes 含空/非字符串";

  const gr = it.graphemes;
  if (!Array.isArray(gr) || gr.length === 0) return "graphemes 数组非法";
  const gjoin = gr.map((x) => String((x as Record<string, unknown>)?.g ?? "")).join("").toLowerCase();
  if (gjoin !== hw) return `g 拼接 "${gjoin}" !== "${hw}"`;
  if (gr.some((x) => !String((x as Record<string, unknown>)?.g ?? ""))) return "存在空 g";
  /* 大写 g 不再拒绝：LLM 对科目名/星期名常输出大写首字母，音素映射与大小写无关，
   * normalize 阶段统一小写化入库 */

  const expanded: string[] = [];
  for (const x of gr) {
    const p = String((x as Record<string, unknown>)?.p ?? "");
    if (p.includes("/") || p.includes("ˈ") || p.includes("ˌ")) return `p 含重音/斜杠记号 "${p}"`;
    expanded.push(...expandP(p));
  }
  if (expanded.length !== ph.length) return `音素数 ${ph.length} != 拼式映射数 ${expanded.length}`;
  for (let i = 0; i < ph.length; i++) {
    if (expanded[i] !== ph[i]) return `第${i}位 p="${expanded[i]}" != ph="${ph[i]}"`;
  }
  const bad = ph.filter((q) => !ALLOWED_PHONEMES.has(q));
  if (bad.length) return `非法音素 ${bad.join(",")}`;
  return null;
}

/** 校验通过后规整为存储格式（静音字母补 x:true；音节软校验） */
function normalize(headword: string, item: unknown, fallbackTranslation: string): AlignedWord {
  const it = item as Record<string, unknown>;
  const hw = headword.toLowerCase();
  const gr: Grapheme[] = (it.graphemes as Record<string, unknown>[]).map((x) => {
    const g = String(x.g).toLowerCase();
    const p = String(x.p);
    return p === "" ? { g, p, x: true } : { g, p };
  });
  let syllables: string[] = [];
  if (Array.isArray(it.syllables) && it.syllables.every((s) => typeof s === "string" && s.length > 0)) {
    const syl = (it.syllables as string[]).map((s) => s.toLowerCase());
    if (syl.join("") === hw) syllables = syl;
  }
  const diff = Number(it.difficulty);
  const cefrRaw = String(it.cefr ?? "A1").toUpperCase();
  const cefr = ["A1", "A2", "B1"].includes(cefrRaw) ? cefrRaw : "A1";
  return {
    headword,
    ipa: String(it.ipa).trim(),
    phonemes: it.phonemes as string[],
    graphemes: gr,
    syllables,
    translation: String(it.translation ?? "").trim() || fallbackTranslation,
    category: String(it.category ?? "general").trim() || "general",
    difficulty: Number.isFinite(diff) ? Math.min(Math.max(Math.round(diff), 1), 5) : 3,
    isTricky: it.isTricky === true,
    cefr,
  };
}

/** 从 LLM 回复里抠出 JSON 数组（容忍 markdown 围栏/前缀文字） */
function extractJsonArray(text: string): unknown[] {
  let t = text.trim();
  t = t.replace(/```(?:json)?/gi, "```");
  const fence = t.indexOf("```");
  if (fence >= 0) {
    const end = t.indexOf("```", fence + 3);
    if (end > fence) t = t.slice(fence + 3, end);
  }
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("回复中未找到 JSON 数组");
  return JSON.parse(t.slice(start, end + 1)) as unknown[];
}

/* ============ LLM 调用 ============ */
const SYSTEM_PROMPT =
  "你是英语自然拼读（Phonics）专家兼小学英语词典主编，精通英式 RP 音标与音素-字母（grapheme-phoneme）对应分析。" +
  "你只输出严格合法的 JSON（不许输出任何解释文字、markdown 代码块标记或多余内容）。";

function buildUserPrompt(items: { word: string; translation: string }[]): string {
  return `请对下面的小学英语教材单词逐词完成音素-字母对齐与词库标注。

标注要求：
1. ipa：英式 RP 音标，不带斜杠，如 ʃɪp、beɪk。
2. phonemes：音素数组，每个元素必须严格取自下方音素表，一个元素一个音素。
   音素表：æ e ɪ ɒ ʌ ʊ ə iː ɑː ɔː uː ɜː eɪ aɪ ɔɪ əʊ aʊ ɪə eə ʊə p b t d k g f v θ ð s z ʃ ʒ h tʃ dʒ m n ŋ l r j w juː əl ks ɪd ɪz i u
3. graphemes：字母组数组，每个元素 {"g":"字母组","p":"音素"}：
   - 所有 g 按顺序连接必须恰好等于 headword 的小写形式（一个字母只能属于一个 g）；
   - p 必须是音素表中的音素；可作整体的特殊单位：x→"ks"、词尾-es→"ɪz"或"s"、词尾-ed→"ɪd"或"d"或"t"、u_e/u→"juː"、辅音+le→"əl"、ch→"tʃ"、th→"θ"或"ð"、sh→"ʃ"、ng→"ŋ"、oo→"uː"或"ʊ"、ee/ea→"iː"、ai/ay→"eɪ"、igh→"aɪ" 等常见拼读；
   - 静音字母（如 cake/give 词尾 e）p 用空串 ""，绝不能把该字母从 g 里丢掉；
   - 若一个字母组确实要连读多个音素（如 PE 的 e 读 /iː.iː/），用 "·" 连接写成 "iː·iː"。
4. syllables：音节数组（小写），各段连接必须等于 headword 小写；单音节词就是整个词本身，如 cat → ["cat"]。

高频错误警示（之前最容易错的点，务必避开）：
- 词尾 -er/-or/-ar 是两个音素 ə + r，且 g 必须逐字母覆盖：writer → phonemes ["r","aɪ","t","ə","r"]，graphemes [{"g":"w","p":"w"},{"g":"r","p":"r"},{"g":"i","p":"aɪ"},{"g":"t","p":"t"},{"g":"e","p":"ə"},{"g":"r","p":"r"}]；
- -le 结尾是辅音+le→"əl" 一个单位：apple → phonemes ["æ","p","ə","l"]，graphemes [{"g":"a","p":"æ"},{"g":"pp","p":"p"},{"g":"le","p":"əl"}]；
- 相邻辅音各自单独映射：floor → [{"g":"f","p":"f"},{"g":"l","p":"l"},{"g":"oo","p":"ɔː"},{"g":"r","p":"r"}]；
- 大写字母一律转小写（Chinese 的 g 是 "c" 不是 "C"）；
- 输出前自查：每个 grapheme 的 p 按 · 展开（空串不计）后的序列，必须与 phonemes 数组逐位相等；所有 g 连接（转小写后）必须逐字母等于 headword。

完整示例（严格照此风格输出）：
[{"headword":"writer","ipa":"raɪtə","phonemes":["r","aɪ","t","ə","r"],"graphemes":[{"g":"w","p":"w"},{"g":"r","p":"r"},{"g":"i","p":"aɪ"},{"g":"t","p":"t"},{"g":"e","p":"ə"},{"g":"r","p":"r"}],"syllables":["wri","ter"],"translation":"作家","category":"action","difficulty":3,"isTricky":false,"cefr":"A2"},
 {"headword":"give","ipa":"gɪv","phonemes":["g","ɪ","v"],"graphemes":[{"g":"g","p":"g"},{"g":"i","p":"ɪ"},{"g":"v","p":"v"},{"g":"e","p":""}],"syllables":["give"],"translation":"给","category":"action","difficulty":1,"isTricky":true,"cefr":"A1"}]
5. translation：以给出的中文释义为基础，可微调得更通顺（保持教材口径）。
6. category：从这些英文键里选一个：animal food color school body family number nature toy transport action description general。
7. difficulty：1~5 整数（1=最简单的 CVC 词，5=最长最难词）。
8. isTricky：拼写与发音不规则、含静音字母或特殊拼读时 true（如 laugh、where、light、one），否则 false。
9. cefr："A1" 或 "A2"（个别较难词可 "B1"）。

待对齐单词（JSON 数组）：
${JSON.stringify(items.map((x) => ({ word: x.word, zh: x.translation })), null, 0)}

输出要求：只输出一个 JSON 数组（不要围栏、不要解释），与输入顺序一致、数量相同，每个元素形如：
{"headword":"…","ipa":"…","phonemes":["…"],"graphemes":[{"g":"…","p":"…"}],"syllables":["…"],"translation":"…","category":"…","difficulty":3,"isTricky":false,"cefr":"A1"}`;
}

async function callLLM(items: { word: string; translation: string }[]): Promise<unknown[]> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const res = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(items) },
        ],
        thinking: { type: "disabled" },
      }),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error("LLM 调用超时(150s)")), 150_000);
        if (typeof timer === "object" && timer && "unref" in timer) (timer as { unref: () => void }).unref();
      }),
    ])) as { choices?: { message?: { content?: string } }[] };
    const content = res?.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("LLM 回复为空");
    return extractJsonArray(content);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** API/解析错误重试 2 次（共 3 次尝试），仍失败抛错 */
async function callLLMWithRetry(items: { word: string; translation: string }[]): Promise<unknown[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await callLLM(items);
    } catch (e) {
      lastErr = e;
      console.warn(`   ⚠️ LLM 调用失败（第 ${attempt}/3 次）：${(e as Error).message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr;
}

/* ============ 主流程 ============ */
async function main() {
  const src = JSON.parse(readFileSync(SRC_FILE, "utf-8")) as SrcVolume[];

  // 1. 汇总去重（大小写不敏感，保留首次出现的写法与释义）
  const pending: { word: string; translation: string; from: string }[] = [];
  const seen = new Map<string, string>();
  for (const vol of src) {
    for (const unit of vol.units) {
      for (const w of unit.words) {
        const key = w.word.toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, w.word);
          pending.push({ word: w.word, translation: w.translation, from: `${vol.volumeCode} U${unit.ord}` });
        }
      }
    }
  }
  console.log(`📦 词表共 ${seen.size} 个去重词（来自 ${src.length} 册）`);

  // 2. DB 已有词跳过
  const db = new PrismaClient();
  const existing = await db.word.findMany({ select: { headword: true } });
  const existingSet = new Set(existing.map((w) => w.headword.toLowerCase()));
  console.log(`🗄️  DB 已有 ${existingSet.size} 词，跳过其中命中的`);

  // 3. 断点续跑：已对齐词跳过
  let aligned = new Map<string, AlignedWord>();
  if (existsSync(OUT_FILE)) {
    try {
      const prev = JSON.parse(readFileSync(OUT_FILE, "utf-8")) as AlignedWord[];
      for (const a of prev) aligned.set(a.headword.toLowerCase(), a);
      console.log(`📂 断点文件已有 ${aligned.size} 词，跳过其中命中的`);
    } catch {
      console.warn("⚠️ 断点文件损坏，将重建");
      aligned = new Map();
    }
  }

  let todo = pending.filter((w) => !existingSet.has(w.word.toLowerCase()) && !aligned.has(w.word.toLowerCase()));
  if (Number.isFinite(LIMIT)) todo = todo.slice(0, LIMIT);
  console.log(`🎯 待对齐 ${todo.length} 词，批大小 ${BATCH_SIZE}\n`);

  const failed: { word: string; reason: string }[] = [];
  const attempts = new Map<string, number>(); // 每词已尝试次数（上限 3：首次 + 2 次修复）
  const save = () => {
    writeFileSync(OUT_FILE, JSON.stringify([...aligned.values()], null, 1), "utf-8");
  };

  const runBatch = async (items: { word: string; translation: string }[]) => {
    let arr: unknown[];
    try {
      arr = await callLLMWithRetry(items);
    } catch (e) {
      console.error(`   ❌ 整批失败，本批 ${items.length} 词留待下轮：${(e as Error).message}`);
      for (const it of items) {
        const n = (attempts.get(it.word.toLowerCase()) ?? 0) + 1;
        attempts.set(it.word.toLowerCase(), n);
        if (n >= 3) failed.push({ word: it.word, reason: "LLM 调用反复失败" });
      }
      return;
    }
    const byHw = new Map<string, unknown>();
    for (const item of arr) {
      const hw = String((item as Record<string, unknown>)?.headword ?? "").trim().toLowerCase();
      if (hw) byHw.set(hw, item);
    }
    let ok = 0;
    for (const it of items) {
      const key = it.word.toLowerCase();
      const item = byHw.get(key);
      const n = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, n);
      if (!item) {
        if (n >= 3) failed.push({ word: it.word, reason: "LLM 未返回该词" });
        continue;
      }
      const err = validate(it.word, item);
      if (err) {
        console.warn(`   ⚠️ ${it.word}: ${err}`);
        if (n >= 3) failed.push({ word: it.word, reason: err });
        continue;
      }
      aligned.set(key, normalize(it.word, item, it.translation));
      ok++;
    }
    console.log(`   ✅ 本批 ${items.length} 词：对齐成功 ${ok}，待修复 ${items.length - ok}`);
  };

  const t0 = Date.now();
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    console.log(`▶ 批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(todo.length / BATCH_SIZE)}：${batch.map((b) => b.word).join(", ")}`);
    await runBatch(batch);
    save(); // 每批落盘（断点续跑）
  }

  // 修复轮：只重试「已尝试过且仍未对齐」的词（最多 3 次尝试），从未尝试的词不会混进来
  let repair = pending.filter((w) => {
    const key = w.word.toLowerCase();
    return (
      !existingSet.has(key) && !aligned.has(key) && (attempts.get(key) ?? 0) > 0 && (attempts.get(key) ?? 0) < 3
    );
  });
  while (repair.length > 0) {
    console.log(`\n🔧 修复轮：${repair.length} 词`);
    for (let i = 0; i < repair.length; i += BATCH_SIZE) {
      const batch = repair.slice(i, i + BATCH_SIZE);
      await runBatch(batch);
      save();
    }
    repair = repair.filter((w) => !aligned.has(w.word.toLowerCase()) && (attempts.get(w.word.toLowerCase()) ?? 0) < 3);
  }

  save();
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\n🏁 完成（用时 ${secs}s）：累计对齐 ${aligned.size} 词`);
  if (failed.length) {
    console.log(`🚫 跳过 ${failed.length} 词（反复失败）：`);
    for (const f of failed) console.log(`   - ${f.word}: ${f.reason}`);
  } else {
    console.log("🚫 跳过 0 词");
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
