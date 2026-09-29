// 种子脚本：bun prisma/seed.ts
// 内置强校验：graphemes 拼接 === headword；有效音素数 === phonemes 数；音素必须在允许表内。
import { PrismaClient } from "@prisma/client";
import { RULES } from "./seed-rules";
import { WORDS, BOOKS } from "./seed-words";

const db = new PrismaClient();

// 允许的音素表（基础 44 + 扩展单位）
const ALLOWED_PHONEMES = new Set([
  // 短元音
  "æ", "e", "ɪ", "ɒ", "ʌ", "ʊ", "ə",
  // 长元音
  "iː", "ɑː", "ɔː", "uː", "ɜː",
  // 双元音
  "eɪ", "aɪ", "ɔɪ", "əʊ", "aʊ", "ɪə", "eə", "ʊə",
  // 爆破音
  "p", "b", "t", "d", "k", "g",
  // 摩擦音
  "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h",
  // 破擦音
  "tʃ", "dʒ",
  // 鼻音
  "m", "n", "ŋ",
  // 近音
  "l", "r", "j", "w",
  // 扩展单位
  "juː", "əl", "ks", "ɪd", "ɪz",
]);

interface GraphemeJson {
  g: string;
  p: string;
  x?: boolean;
}

function validateWord(row: SeedWordTuple): string | null {
  const [w, , ph, gr] = row;
  const join = gr.map((x) => x[0]).join("");
  if (join !== w) return `graphemes 拼接 "${join}" !== headword "${w}"`;
  const active = gr.filter((x) => x[1] !== "");
  if (active.length !== ph.length)
    return `有效拼式数 ${active.length} !== 音素数 ${ph.length}`;
  for (let i = 0; i < ph.length; i++) {
    if (active[i][1] !== ph[i]) return `音素不匹配: 第${i}位 gr="${active[i][1]}" ph="${ph[i]}"`;
  }
  for (const p of ph) {
    if (!ALLOWED_PHONEMES.has(p)) return `非法音素 "${p}"`;
  }
  return null;
}

type SeedWordTuple = (typeof WORDS)[number];

async function main() {
  console.log("🔍 校验种子数据不变量...");
  const wordCodes = new Set<string>();
  let errs = 0;
  for (const row of WORDS) {
    if (wordCodes.has(row[0])) {
      console.error(`❌ 重复词: ${row[0]}`);
      errs++;
      continue;
    }
    wordCodes.add(row[0]);
    const err = validateWord(row);
    if (err) {
      console.error(`❌ ${row[0]}: ${err}`);
      errs++;
    }
  }
  const ruleCodes = new Set(RULES.map((r) => r[0]));
  for (const row of WORDS) {
    for (const rc of row[9]) {
      if (!ruleCodes.has(rc)) {
        console.error(`❌ ${row[0]}: 引用了不存在的规则 ${rc}`);
        errs++;
      }
    }
  }
  for (const r of RULES) {
    for (const ex of r[6]) {
      if (!wordCodes.has(ex)) {
        console.error(`❌ 规则 ${r[0]}: 示例词 ${ex} 不在词库`);
        errs++;
      }
    }
  }
  const missing: string[] = [];
  for (const b of BOOKS) {
    for (const u of b.units) {
      for (const w of u.words) {
        if (!wordCodes.has(w)) {
          missing.push(w);
          console.error(`❌ 教材词缺失: ${w} (${b.publisher}${b.grade}${b.volume} ${u.name})`);
          errs++;
        }
      }
    }
  }
  if (errs > 0) {
    console.error(`\n共 ${errs} 个校验错误，中止写入。`);
    process.exit(1);
  }
  console.log(`✅ 校验通过: ${WORDS.length} 词 / ${RULES.length} 规则 / 教材词全部命中`);

  console.log("🧹 清空旧数据...");
  await db.wordRule.deleteMany();
  await db.unitWord.deleteMany();
  await db.learningEvent.deleteMany();
  await db.errorLog.deleteMany();
  await db.reviewCard.deleteMany();
  await db.dailyStat.deleteMany();
  await db.unit.deleteMany();
  await db.book.deleteMany();
  await db.rule.deleteMany();
  await db.word.deleteMany();
  await db.user.deleteMany();

  console.log("📘 写入规则...");
  await db.rule.createMany({
    data: RULES.map(([code, level, name, pattern, description, tip, examples]) => ({
      code,
      level,
      name,
      pattern,
      description,
      tip,
      examples: JSON.stringify(examples),
    })),
  });
  const ruleMap = new Map<string, string>();
  const rules = await db.rule.findMany({ select: { id: true, code: true } });
  for (const r of rules) ruleMap.set(r.code, r.id);

  console.log("📖 写入词库...");
  const wordMap = new Map<string, string>();
  for (const row of WORDS) {
    const [w, ipa, ph, gr, syl, zh, cat, diff, freq, ruleCodes, tricky] = row;
    const word = await db.word.create({
      data: {
        headword: w,
        ipa,
        phonemes: JSON.stringify(ph),
        graphemes: JSON.stringify(
          gr.map((x) => (x[2] ? { g: x[0], p: x[1], x: true } : { g: x[0], p: x[1] }))
        ),
        syllables: JSON.stringify(syl),
        translation: zh,
        category: cat,
        frequency: freq,
        cefr: diff <= 2 ? "A1" : "A2",
        isTricky: !!tricky,
        difficulty: diff,
      },
    });
    wordMap.set(w, word.id);
    for (let i = 0; i < ruleCodes.length; i++) {
      const rid = ruleMap.get(ruleCodes[i]);
      if (rid) {
        await db.wordRule.create({ data: { wordId: word.id, ruleId: rid, position: i } });
      }
    }
  }

  console.log("🏫 写入教材单元...");
  for (const b of BOOKS) {
    const book = await db.book.create({
      data: { publisher: b.publisher, grade: b.grade, volume: b.volume },
    });
    for (let i = 0; i < b.units.length; i++) {
      const u = b.units[i];
      const unit = await db.unit.create({
        data: { bookId: book.id, name: u.name, ord: i + 1 },
      });
      for (let j = 0; j < u.words.length; j++) {
        const wid = wordMap.get(u.words[j]);
        if (wid) {
          await db.unitWord.create({ data: { unitId: unit.id, wordId: wid, ord: j + 1 } });
        }
      }
    }
  }

  console.log("👤 写入演示用户...");
  await db.user.create({
    data: { nickname: "小学员", grade: 3, accentPref: "en-US", ttsEngine: "browser", settings: "{}" },
  });

  console.log("\n🎉 种子数据写入完成！");
  console.log(`   词库: ${WORDS.length} 词（Tricky: ${WORDS.filter((w) => w[10]).length}）`);
  console.log(`   规则: ${RULES.length} 条（L0~L8）`);
  console.log(`   教材: ${BOOKS.length} 册 / ${BOOKS.reduce((a, b) => a + b.units.length, 0)} 单元`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
