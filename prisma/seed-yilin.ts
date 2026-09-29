/**
 * 苏教译林版教材种子（幂等）：bun prisma/seed-yilin.ts
 *
 * 读 prisma/yilin-src.json（6 册 48 单元词表）+ prisma/yilin-aligned.json（LLM 对齐产物）
 * 幂等 upsert：Book(publisher+grade+volume) / Unit(bookId+ord) / UnitWord(unitId+wordId) / Word(headword)
 * - Word 已存在（如 274 词基础库或重复出现在多册）→ 复用不覆盖，仅建立 UnitWord 关联
 * - 写入前对 aligned 数据再做一次强校验（g 拼接==headword、p 序列==phonemes、音素白名单）
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SRC_FILE = path.join(ROOT, "prisma", "yilin-src.json");
const ALIGN_FILE = path.join(ROOT, "prisma", "yilin-aligned.json");

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
  "i", "u",
]);

interface SrcVolume {
  grade: number;
  volume: string;
  volumeCode: string;
  units: { name: string; ord: number; words: { word: string; translation: string }[] }[];
}
interface AlignedWord {
  headword: string;
  ipa: string;
  phonemes: string[];
  graphemes: { g: string; p: string; x?: boolean }[];
  syllables: string[];
  translation: string;
  category: string;
  difficulty: number;
  isTricky: boolean;
  cefr: string;
}

function validateAligned(a: AlignedWord): string | null {
  const hw = a.headword.toLowerCase();
  if (!a.headword || !a.ipa || a.ipa.includes("/")) return "ipa 非法";
  const gjoin = a.graphemes.map((x) => x.g).join("").toLowerCase();
  if (gjoin !== hw) return `g 拼接 "${gjoin}" !== "${hw}"`;
  const expanded: string[] = [];
  for (const x of a.graphemes) if (x.p !== "") expanded.push(...x.p.split("·"));
  if (expanded.length !== a.phonemes.length) return `音素数 ${a.phonemes.length} != 拼式数 ${expanded.length}`;
  for (let i = 0; i < expanded.length; i++) if (expanded[i] !== a.phonemes[i]) return `第${i}位不对应`;
  for (const p of a.phonemes) if (!ALLOWED_PHONEMES.has(p)) return `非法音素 ${p}`;
  return null;
}

async function main() {
  const src = JSON.parse(readFileSync(SRC_FILE, "utf-8")) as SrcVolume[];
  if (!existsSync(ALIGN_FILE)) {
    console.error("❌ 未找到对齐产物 prisma/yilin-aligned.json，请先运行 bun scripts/gen-yilin-align.ts");
    process.exit(1);
  }
  const alignList = JSON.parse(readFileSync(ALIGN_FILE, "utf-8")) as AlignedWord[];
  const align = new Map<string, AlignedWord>();
  for (const a of alignList) align.set(a.headword.toLowerCase(), a);

  // 对齐产物强校验（不合格直接拒写并退出，保证库内数据质量）
  let bad = 0;
  for (const a of align.values()) {
    const err = validateAligned(a);
    if (err) {
      console.error(`❌ 对齐数据不合格 ${a.headword}: ${err}`);
      bad++;
    }
  }
  if (bad > 0) {
    console.error(`\n共 ${bad} 条对齐数据不合格，中止写入（请重跑 gen-yilin-align.ts 修复后重试）。`);
    process.exit(1);
  }
  console.log(`✅ 对齐产物校验通过：${align.size} 词`);

  const db = new PrismaClient();
  let bookCreated = 0;
  let unitCreated = 0;
  let wordCreated = 0;
  let linkCreated = 0;
  let wordReused = 0;
  const missingAligned = new Set<string>();

  for (const vol of src) {
    const volume = vol.volume === "上" ? "上册" : "下册";
    // --- Book upsert（publisher+grade+volume 业务唯一）---
    let book = await db.book.findFirst({ where: { publisher: "译林版", grade: vol.grade, volume } });
    if (!book) {
      book = await db.book.create({ data: { publisher: "译林版", grade: vol.grade, volume } });
      bookCreated++;
      console.log(`📗 新建教材：译林版 ${vol.grade}${volume}（${vol.volumeCode}）`);
    }
    for (const u of vol.units) {
      // --- Unit upsert（bookId+ord 业务唯一）---
      let unit = await db.unit.findFirst({ where: { bookId: book.id, ord: u.ord } });
      if (!unit) {
        unit = await db.unit.create({ data: { bookId: book.id, name: u.name, ord: u.ord } });
        unitCreated++;
      } else if (unit.name !== u.name) {
        await db.unit.update({ where: { id: unit.id }, data: { name: u.name } });
      }
      for (let j = 0; j < u.words.length; j++) {
        const srcWord = u.words[j];
        const key = srcWord.word.toLowerCase();
        const a = align.get(key);
        if (!a) {
          // 无对齐产物：若基础词库已有该词，直接复用建关联；否则记为缺失
          const existing = await db.word.findUnique({ where: { headword: key } });
          if (existing) {
            const uwExist = await db.unitWord.findUnique({
              where: { unitId_wordId: { unitId: unit.id, wordId: existing.id } },
            });
            if (!uwExist) {
              await db.unitWord.create({ data: { unitId: unit.id, wordId: existing.id, ord: j + 1 } });
              linkCreated++;
            }
            wordReused++;
          } else {
            missingAligned.add(`${key}（${vol.volumeCode} U${u.ord}）`);
          }
          continue;
        }
        // --- Word upsert（headword 唯一；统一小写存储与既有库一致）---
        const data = {
          headword: hwLower(a.headword),
          ipa: a.ipa,
          phonemes: JSON.stringify(a.phonemes),
          graphemes: JSON.stringify(a.graphemes),
          syllables: JSON.stringify(a.syllables),
          translation: a.translation || srcWord.translation,
          category: a.category,
          cefr: a.cefr,
          isTricky: a.isTricky,
          difficulty: a.difficulty,
        };
        let word = await db.word.findUnique({ where: { headword: data.headword } });
        if (!word) {
          word = await db.word.create({ data: { ...data, frequency: 50 } });
          wordCreated++;
        } else {
          wordReused++;
        }
        // --- UnitWord upsert（unitId+wordId 复合主键）---
        const uw = await db.unitWord.findUnique({
          where: { unitId_wordId: { unitId: unit.id, wordId: word.id } },
        });
        if (!uw) {
          await db.unitWord.create({ data: { unitId: unit.id, wordId: word.id, ord: j + 1 } });
          linkCreated++;
        }
      }
    }
  }

  console.log(`\n🎉 译林种子完成：`);
  console.log(`   教材 +${bookCreated} 册（新建）/ 单元 +${unitCreated} 个`);
  console.log(`   新词 +${wordCreated} / 复用已有词 ${wordReused} 次 / 单元词关联 +${linkCreated}`);
  if (missingAligned.size > 0) {
    console.log(`⚠️ ${missingAligned.size} 个词单元缺对齐产物未入库：`);
    for (const m of [...missingAligned].slice(0, 20)) console.log(`   - ${m}`);
    if (missingAligned.size > 20) console.log(`   …等共 ${missingAligned.size} 个`);
  }
  await db.$disconnect();
}

/** DB 词头统一小写（与 274 词基础库一致，保证 SQLite contains 检索） */
function hwLower(w: string): string {
  return w.toLowerCase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
