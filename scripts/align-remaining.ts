/**
 * 译林剩余词确定性对齐器（不依赖 LLM）
 * - 手工 IPA（英式）覆盖全部剩余词（156 词）
 * - DP 把 headword 切分为 graphemes（每段对应一个音素，静音段 p="" 标 x）
 * - syllables 启发式切分（失败留 []）
 * 输出合并进 prisma/yilin-aligned.json（跳过已存在 headword）
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SRC_FILE = path.join(ROOT, "prisma", "yilin-src.json");
const ALIGN_FILE = path.join(ROOT, "prisma", "yilin-aligned.json");

/* ============ 手工 IPA（英式 RP）+ 元信息 ============ */
// [音素序列, category, difficulty(0=自动), isTricky(0=自动)]
const IPA: Record<string, [string[], string, number, boolean]> = {
  get: [["g","e","t"], "action", 1, false],
  dragon: [["d","r","æ","g","ə","n"], "animal", 2, false],
  subject: [["s","ʌ","b","dʒ","ɪ","k","t"], "school", 4, false],
  chinese: [["tʃ","aɪ","n","iː","z"], "school", 2, false],
  english: [["ɪ","ŋ","g","l","ɪ","ʃ"], "school", 2, false],
  maths: [["m","æ","θ","s"], "school", 2, false],
  art: [["ɑː","t"], "school", 1, false],
  music: [["m","j","uː","z","ɪ","k"], "school", 2, false],
  science: [["s","aɪ","ə","n","s"], "school", 3, false],
  timetable: [["t","aɪ","m","t","eɪ","b","əl"], "school", 4, true],
  afternoon: [["ɑː","f","t","ə","n","uː","n"], "general", 3, false],
  evening: [["iː","v","n","ɪ","ŋ"], "general", 2, false],
  breakfast: [["b","r","e","k","f","ə","s","t"], "food", 3, true],
  tuesday: [["t","j","uː","z","d","eɪ"], "general", 3, true],
  wednesday: [["w","e","n","z","d","eɪ"], "general", 4, true],
  thursday: [["θ","ɜː","z","d","eɪ"], "general", 3, true],
  friday: [["f","r","aɪ","d","eɪ"], "general", 2, false],
  saturday: [["s","æ","t","ə","d","eɪ"], "general", 3, false],
  sunday: [["s","ʌ","n","d","eɪ"], "general", 2, false],
  basketball: [["b","ɑː","s","k","ɪ","t","b","ɔː","l"], "action", 4, false],
  skate: [["s","k","eɪ","t"], "action", 2, false],
  weather: [["w","e","ð","ə"], "nature", 2, false],
  snowy: [["s","n","əʊ","i"], "nature", 2, false],
  summer: [["s","ʌ","m","ə"], "nature", 2, false],
  warm: [["w","ɔː","m"], "nature", 1, false],
  clothes: [["k","l","əʊ","ð","z"], "general", 2, true],
  sweater: [["s","w","e","t","ə"], "general", 3, false],
  trousers: [["t","r","aʊ","z","ə","z"], "general", 3, true],
  glove: [["g","l","ʌ","v"], "general", 2, false],
  lesson: [["l","e","s","ə","n"], "school", 2, false],
  usually: [["j","uː","ʒ","ʊ","ə","l","i"], "action", 4, true],
  homework: [["h","əʊ","m","w","ɜː","k"], "school", 3, false],
  difficult: [["d","ɪ","f","ɪ","k","ə","l","t"], "description", 3, false],
  again: [["ə","g","e","n"], "action", 2, true],
  hungry: [["h","ʌ","ŋ","g","r","i"], "description", 2, false],
  headache: [["h","e","d","eɪ","k"], "body", 3, true],
  floor: [["f","l","ɔː"], "general", 2, false],
  computer: [["k","ə","m","p","j","uː","t","ə"], "general", 3, false],
  third: [["θ","ɜː","d"], "number", 2, false],
  first: [["f","ɜː","s","t"], "number", 2, false],
  great: [["g","r","eɪ","t"], "description", 2, false],
  give: [["g","ɪ","v"], "action", 1, true],
  finger: [["f","ɪ","ŋ","g","ə"], "body", 2, false],
  writer: [["r","aɪ","t","ə"], "action", 3, false],
  worker: [["w","ɜː","k","ə"], "action", 2, false],
  driver: [["d","r","aɪ","v","ə"], "transport", 2, false],
  policeman: [["p","ə","l","iː","s","m","ə","n"], "action", 4, false],
  canada: [["k","æ","n","ə","d","ə"], "general", 3, false],
  greece: [["g","r","iː","s"], "general", 2, true],
  russia: [["r","ʌ","ʃ","ə"], "general", 2, true],
  grandparent: [["g","r","æ","n","d","p","eə","r","ə","n","t"], "family", 4, false],
  internet: [["ɪ","n","t","ə","n","e","t"], "general", 3, false],
  christmas: [["k","r","ɪ","s","m","ə","s"], "general", 3, true],
  pretty: [["p","r","ɪ","t","i"], "description", 2, false],
  stocking: [["s","t","ɒ","k","ɪ","ŋ"], "general", 3, false],
  finally: [["f","aɪ","n","ə","l","i"], "description", 3, false],
  children: [["tʃ","ɪ","l","d","r","ə","n"], "family", 2, true],
  prince: [["p","r","ɪ","n","s"], "general", 2, false],
  because: [["b","ɪ","k","ɔː","z"], "general", 2, true],
  street: [["s","t","r","iː","t"], "general", 2, false],
  taxi: [["t","æ","k","s","i"], "transport", 2, false],
  ride: [["r","aɪ","d"], "action", 2, false],
  take: [["t","eɪ","k"], "action", 1, false],
  supermarket: [["s","uː","p","ə","m","ɑː","k","ɪ","t"], "general", 4, false],
  should: [["ʃ","ʊ","d"], "action", 2, true],
  medicine: [["m","e","d","s","ə","n"], "body", 3, true],
  anything: [["e","n","i","θ","ɪ","ŋ"], "general", 3, false],
  bedtime: [["b","e","d","t","aɪ","m"], "general", 2, false],
  clean: [["k","l","iː","n"], "action", 2, false],
  grow: [["g","r","əʊ"], "action", 2, false],
  garden: [["g","ɑː","d","ə","n"], "nature", 2, false],
  sweet: [["s","w","iː","t"], "food", 1, false],
  sweep: [["s","w","iː","p"], "action", 2, false],
  smell: [["s","m","e","l"], "action", 2, false],
  tomato: [["t","ə","m","ɑː","t","əʊ"], "food", 3, false],
  angry: [["æ","ŋ","g","r","i"], "description", 2, false],
  january: [["dʒ","æ","n","j","u","ə","r","i"], "general", 4, false],
  february: [["f","e","b","r","u","ə","r","i"], "general", 4, false],
  september: [["s","e","p","t","e","m","b","ə"], "general", 4, false],
  october: [["ɒ","k","t","əʊ","b","ə"], "general", 3, false],
  eleventh: [["ɪ","l","e","v","ə","n","θ"], "number", 4, false],
  eighth: [["eɪ","t","θ"], "number", 3, true],
  april: [["eɪ","p","r","ə","l"], "general", 2, false],
  march: [["m","ɑː","tʃ"], "general", 2, false],
  july: [["dʒ","ʊ","l","aɪ"], "general", 2, true],
  august: [["ɔː","g","ə","s","t"], "general", 2, false],
  december: [["d","ɪ","s","e","m","b","ə"], "general", 3, false],
  together: [["t","ə","g","e","ð","ə"], "action", 3, true],
  through: [["θ","r","uː"], "action", 2, true],
  each: [["iː","tʃ"], "description", 2, false],
  sentence: [["s","e","n","t","ə","n","s"], "school", 3, false],
  interesting: [["ɪ","n","t","r","ə","s","t","ɪ","ŋ"], "description", 4, false],
  become: [["b","ɪ","k","ʌ","m"], "action", 2, false],
  bring: [["b","r","ɪ","ŋ"], "action", 2, false],
  museum: [["m","j","uː","z","iː","ə","m"], "general", 3, false],
  paper: [["p","eɪ","p","ə"], "general", 2, false],
  bottle: [["b","ɒ","t","əl"], "general", 2, false],
  square: [["s","k","w","eə"], "general", 2, false],
  fashion: [["f","æ","ʃ","ə","n"], "general", 3, false],
  ago: [["ə","g","əʊ"], "general", 2, true],
  anywhere: [["e","n","i","w","eə"], "general", 3, false],
  centre: [["s","e","n","t","ə"], "general", 2, false],
  careful: [["k","eə","f","ə","l"], "description", 3, false],
  litter: [["l","ɪ","t","ə"], "nature", 2, false],
  restaurant: [["r","e","s","t","ɒ","r","ə","n","t"], "food", 4, false],
  someone: [["s","ʌ","m","w","ʌ","n"], "general", 2, false],
  outing: [["aʊ","t","ɪ","ŋ"], "action", 2, false],
  rubbish: [["r","ʌ","b","ɪ","ʃ"], "nature", 2, false],
  throw: [["θ","r","əʊ"], "action", 2, false],
  ground: [["g","r","aʊ","n","d"], "nature", 2, false],
  protect: [["p","r","ə","t","e","k","t"], "action", 3, false],
  earth: [["ɜː","θ"], "nature", 2, true],
  useful: [["j","uː","s","f","ə","l"], "description", 3, false],
  drive: [["d","r","aɪ","v"], "action", 2, false],
  plastic: [["p","l","æ","s","t","ɪ","k"], "general", 3, false],
  glass: [["g","l","ɑː","s"], "general", 2, false],
  fireworks: [["f","aɪ","ə","w","ɜː","k","s"], "general", 3, false],
  firecracker: [["f","aɪ","ə","k","r","æ","k","ə"], "general", 4, false],
  delicious: [["d","ɪ","l","ɪ","ʃ","ə","s"], "food", 3, false],
  large: [["l","ɑː","dʒ"], "description", 2, false],
  loudly: [["l","aʊ","d","l","i"], "action", 3, false],
  happily: [["h","æ","p","ɪ","l","i"], "description", 3, false],
  cheer: [["tʃ","ɪə"], "action", 2, false],
  never: [["n","e","v","ə"], "description", 2, false],
  safety: [["s","eɪ","f","t","i"], "general", 3, false],
  cross: [["k","r","ɒ","s"], "action", 2, false],
  safely: [["s","eɪ","f","l","i"], "action", 3, false],
  pavement: [["p","eɪ","v","m","ə","n","t"], "general", 3, false],
  follow: [["f","ɒ","l","əʊ"], "action", 2, false],
  stay: [["s","t","eɪ"], "action", 2, false],
  clown: [["k","l","aʊ","n"], "general", 2, false],
  appear: [["ə","p","ɪə"], "action", 2, false],
  begin: [["b","ɪ","g","ɪ","n"], "action", 2, false],
  fruit: [["f","r","uː","t"], "food", 2, false],
  drink: [["d","r","ɪ","ŋ","k"], "food", 2, false],
  australia: [["ɒ","s","t","r","eɪ","l","j","ə"], "general", 4, false],
  magazine: [["m","æ","g","ə","z","iː","n"], "general", 3, false],
  kangaroo: [["k","æ","ŋ","g","ə","r","uː"], "animal", 4, false],
  exciting: [["ɪ","k","s","aɪ","t","ɪ","ŋ"], "description", 3, false],
  sydney: [["s","ɪ","d","n","i"], "general", 2, false],
  welcome: [["w","e","l","k","ʌ","m"], "action", 2, false],
  london: [["l","ʌ","n","d","ə","n"], "general", 2, false],
  oxford: [["ɒ","k","s","f","ə","d"], "general", 2, false],
  month: [["m","ʌ","n","θ"], "general", 2, false],
  travel: [["t","r","æ","v","ə","l"], "action", 2, false],
  traveller: [["t","r","æ","v","ə","l","ə"], "action", 3, false],
  different: [["d","ɪ","f","r","ə","n","t"], "description", 3, false],
  ocean: [["əʊ","ʃ","ə","n"], "nature", 2, false],
  dream: [["d","r","iː","m"], "general", 2, false],
  future: [["f","j","uː","tʃ","ə"], "general", 2, false],
  care: [["k","eə"], "action", 2, false],
  spaceship: [["s","p","eɪ","s","ʃ","ɪ","p"], "transport", 3, false],
  scientist: [["s","aɪ","ə","n","t","ɪ","s","t"], "action", 4, false],
  brave: [["b","r","eɪ","v"], "description", 2, false],
  artist: [["ɑː","t","ɪ","s","t"], "action", 3, false],
  true: [["t","r","uː"], "description", 2, true],
};

/* ============ 段→候选音素（切分用） ============ */
const SEG: Record<string, string[][]> = {
  tion: [["ʃ","ə","n"]], sion: [["ʃ","ə","n"],["ʒ","ə","n"]],
  eigh: [["eɪ"]], igh: [["aɪ"]], air: [["eə"]], ear: [["ɪə"],["e"],["ɜː"]],
  ere: [["eə"],["ɪə"]], eir: [["eə"]], are: [["eə"],["ɑː"]],
  our: [["ɔː"],["aʊ"]], oor: [["ɔː"]], all: [["ɔː"]],
  tch: [["tʃ"]], dge: [["dʒ"]], eye: [["aɪ"]],
  ch: [["tʃ"],["k"]], sh: [["ʃ"]], th: [["θ"],["ð"]], ph: [["f"]], ck: [["k"]],
  qu: [["k","w"]], ng: [["ŋ"],["ŋ","g"]],
  wh: [["w"]], ai: [["eɪ"],["aɪ"],["e"]], ay: [["eɪ"]], ee: [["iː"]],
  ea: [["iː"],["e"],["eɪ"]], oa: [["əʊ"]], ow: [["əʊ"],["aʊ"]],
  oo: [["uː"],["ʊ"]], oi: [["ɔɪ"]], oy: [["ɔɪ"]], ou: [["aʊ"],["ʌ"],["ə"]],
  ar: [["ɑː"],["ə"],["ɔː"]], or: [["ɔː"],["ə"],["ɜː"]], er: [["ə"],["ɜː"]], ir: [["ɜː"]], ur: [["ɜː"],["ʊ","ə"],["ə"]],
  al: [["ɔː"]], ie: [["iː"],["aɪ"]], eo: [["iː"]], ue: [["uː"]], ui: [["uː"]],
  wa: [["w","ɒ"]], ue: [["j","uː"],["uː"]],
  ei: [["eɪ"]], au: [["ɔː"],["ɒ"],["ɑː"]], ough: [["uː"],["əʊ"],["ɔː"],["aʊ"]],
  oul: [["ʊ"]], ould: [["ʊ","d"]], eer: [["ɪə"]], nk: [["ŋ","k"]],
  ci: [["ʃ"]], ce: [["s"],["ʃ"]], ome: [["ʌ","m"],["əʊ","m"]], aur: [["ɒ","r"],["ɔː","r"]], ght: [["t"],["t","θ"]], io: [["ə"]], ia: [["ə"],["j","ə"]],
  re: [["ə"]], ure: [["ʊə"],["ə"]], ture: [["tʃ","ə"]], ht: [["t","θ"]],
  bb: [["b"]], gg: [["g"]], ff: [["f"]], ll: [["l"]], mm: [["m"]], nn: [["n"]], pp: [["p"]],
  ss: [["s"],["ʃ"]], tt: [["t"]], dd: [["d"]], rr: [["r"]], zz: [["z"]],
  le: [["əl"]], ed: [["d"],["t"],["ɪd"]], es: [["z"],["s"],["ɪz"]],
  a: [["æ"],["ə"],["eɪ"],["ɑː"],["ɔː"],["e"],["eə"]],
  b: [["b"]], c: [["k"],["s"]], d: [["d"]], e: [["e"],["ɪ"],["ə"],["iː"]],
  f: [["f"]], g: [["g"],["dʒ"]], h: [["h"]], i: [["ɪ"],["aɪ"],["i"],["iː"],["j"],["ə"]],
  j: [["dʒ"]], k: [["k"]], l: [["l"]], m: [["m"]], n: [["n"]],
  o: [["ɒ"],["əʊ"],["ə"],["ʊ"],["ʌ"],["w"],["w","ʌ"]], p: [["p"]], q: [["k"]], r: [["r"]], s: [["s"],["z"],["ʒ"],["ʃ"]],
  t: [["t"]], u: [["ʌ"],["ʊ"],["ə"],["uː"],["juː"],["u"],["j","uː"],["j","u"]], v: [["v"]], w: [["w"]],
  x: [["k","s"]], y: [["ɪ"],["aɪ"],["j"],["i"]], z: [["z"]],
};

interface Grapheme { g: string; p: string; x?: boolean }

const VOWEL_CH = new Set("aeiou");

/** DP：把 word 切分为 graphemes，逐段匹配 phonemes；失败返回 null */
function alignDP(word: string, ph: string[]): Grapheme[] | null {
  const w = word.toLowerCase();
  const n = w.length;
  const P = ph.length;
  const memo = new Map<string, Grapheme[] | null>();
  let midSilent = 0;

  const isSilentAt = (j: number): boolean => {
    const ch = w[j];
    const prev = j > 0 ? w[j - 1] : "";
    const next = j < n - 1 ? w[j + 1] : "";
    if (ch === "e" && j === n - 1 && P > 0) return true;      // 词尾哑 e
    if (j === 0 && ((w.startsWith("wr") && ch === "w") || (w.startsWith("kn") && ch === "k"))) return true;
    if (ch === "c" && prev === "s") return true;               // sc 的 c 静音（science）
    if (ch === "g" && next === "h") return true;               // gh 的 g 静音（eighth/light）
    if (ch === "t" && prev === "s" && next && !VOWEL_CH.has(next)) return true; // christmas 的 t
    if (ch === "d" && prev === "e" && next === "n") return true;               // wednesday 的 d
    if (ch === "h" && prev === "g") return true;                                // gh 的 h 静音（eighth/light）
    if (ch === "c" && (prev === "i" || prev === "x") && next === "i" && w[j + 2] === "t") return true; // excite 系的 c 静音
    if (midSilent === 0 && (ch === "e" || ch === "i") && j > 0 && j < n - 1 && (!VOWEL_CH.has(next) || next === "o") && !VOWEL_CH.has(prev)) return true;
    return false;
  };

  const segCandidates = (g: string, j: number): string[][] => {
    if (g === "h" && j === n - 1) return [["θ"]]; // eighth 的词尾 h→θ
    const base = SEG[g];
    if (!base) return [];
    if (g === "le") {
      if (j + 2 !== n || !VOWEL_CH.has(w[j - 1] ?? "a") || VOWEL_CH.has(w[j - 1])) {
        // 仅词尾且前面是辅音
        if (!(j + 2 === n && !VOWEL_CH.has(w[j - 1] ?? "a"))) return [];
      }
      return base;
    }
    if (g === "ed" || g === "es") {
      if (j + 2 !== n) return [];
      return base;
    }
    return base;
  };

  let bestI = 0, bestJ = 0;
  const dfs = (i: number, j: number): Grapheme[] | null => {
    if (i + j > bestI + bestJ) { bestI = i; bestJ = j; }
    if (i === P && j === n) return [];
    if (i > P || j > n) return null;
    const key = `${i}:${j}:${midSilent}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;

    // 静音段
    if (isSilentAt(j)) {
      if ((w[j] === "e" && j !== n - 1) ) {
        // 词中静音 e 计数限制
        midSilent++;
        const rest = dfs(i, j + 1);
        midSilent--;
        if (rest) { const r = [{ g: w[j], p: "", x: true }, ...rest]; memo.set(key, r); return r; }
      } else {
        const rest = dfs(i, j + 1);
        if (rest) { const r = [{ g: w[j], p: "", x: true }, ...rest]; memo.set(key, r); return r; }
      }
    }
    // 音素段：尝试 1~4 字母
    for (let len = Math.min(4, n - j); len >= 1; len--) {
      const g = w.slice(j, j + len);
      const cands = segCandidates(g, j);
      for (const seq of cands) {
        if (i + seq.length > P) continue;
        let ok = true;
        for (let k = 0; k < seq.length; k++) if (ph[i + k] !== seq[k]) { ok = false; break; }
        if (!ok) continue;
        const rest = dfs(i + seq.length, j + len);
        if (rest) {
          const r: Grapheme[] = [{ g, p: seq.join("·") }, ...rest];
          memo.set(key, r);
          return r;
        }
      }
    }
    memo.set(key, null);
    return null;
  };
  const r = dfs(0, 0);
  if (!r) console.error(`   [dp] ${word}: 卡在 phoneme#${bestI}/${P} letter#${bestJ}/${n} (剩余 "${w.slice(bestJ)}", 未匹配 "${ph.slice(bestI).join(",")}")`);
  return r;
}

/* ============ syllables 启发式切分 ============ */
const VOWEL_PH = new Set(["æ","e","ɪ","ɒ","ʌ","ʊ","ə","iː","ɑː","ɔː","uː","ɜː","eɪ","aɪ","ɔɪ","əʊ","aʊ","ɪə","eə","ʊə","juː","i","u","əl"]);
function splitSyllables(word: string, ph: string[]): string[] {
  const nSyl = ph.filter((p) => VOWEL_PH.has(p)).length || 1;
  const w = word.toLowerCase();
  if (nSyl <= 1) return [w];
  const suffixes = ["tion","sion","ment","ness","ful","less","ly","er","est","ing","le"];
  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 2) {
      const head = w.slice(0, w.length - suf.length);
      const sub = splitSyllables(head, []);
      if (sub.length > 0) return [...sub, suf];
    }
  }
  // VCV / VCCV 粗切
  const parts: string[] = [];
  let cur = "";
  let vowelSeen = 0;
  for (let i = 0; i < w.length; i++) {
    cur += w[i];
    const isV = VOWEL_CH.has(w[i]);
    if (isV) vowelSeen++;
    if (vowelSeen >= nSyl && i < w.length - 1) { parts.push(cur); cur = ""; }
  }
  if (cur) parts.push(cur);
  return parts.length >= 2 ? parts : [];
}

/* ============ 主流程 ============ */
interface AlignedWord {
  headword: string; ipa: string; phonemes: string[]; graphemes: Grapheme[];
  syllables: string[]; translation: string; category: string; difficulty: number;
  isTricky: boolean; cefr: string;
}
const src = JSON.parse(readFileSync(SRC_FILE, "utf-8")) as { units: { words: { word: string; translation: string }[] }[] }[];
const translations = new Map<string, string>();
for (const b of src as unknown as { units: { words: { word: string; translation: string }[] }[] }[]) {
  // yilin-src.json 是数组（册）
}
const volumes = JSON.parse(readFileSync(SRC_FILE, "utf-8")) as { units: { words: { word: string; translation: string }[] }[] }[];
for (const vol of volumes) for (const u of vol.units) for (const w of u.words) {
  const k = w.word.toLowerCase();
  if (!translations.has(k)) translations.set(k, w.translation);
}

const existing: AlignedWord[] = JSON.parse(readFileSync(ALIGN_FILE, "utf-8")) as AlignedWord[];
const have = new Set(existing.map((a) => a.headword.toLowerCase()));
const out: AlignedWord[] = [...existing];
const failed: string[] = [];

for (const [word, entry] of Object.entries(IPA)) {
  if (have.has(word.toLowerCase())) continue;
  const [ph, category, diffOverride, trickyOverride] = entry;
  const gr = alignDP(word.toLowerCase(), ph);
  if (!gr) { failed.push(word); continue; }
  const syl = splitSyllables(word.toLowerCase(), ph);
  const hasSilent = gr.some((x) => x.x === true);
  const diff = diffOverride > 0 ? diffOverride : Math.min(5, Math.max(1, Math.ceil(word.length / 2)));
  out.push({
    headword: word.toLowerCase(),
    ipa: ph.join(""),
    phonemes: ph,
    graphemes: gr,
    syllables: syl,
    translation: translations.get(word.toLowerCase()) ?? "",
    category,
    difficulty: diff,
    isTricky: trickyOverride || hasSilent,
    cefr: diff <= 2 ? "A1" : "A2",
  });
}

writeFileSync(ALIGN_FILE, JSON.stringify(out, null, 1), "utf-8");
console.log(`✅ 本地对齐完成：新增 ${out.length - existing.length}，总计 ${out.length}`);
if (failed.length) console.log("🚫 DP 失败词：", failed.join(", "));
