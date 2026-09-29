// 数据库种子数据校验：bun scripts/validate-seed.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const ALLOWED_PHONEMES = new Set([
  "æ", "e", "ɪ", "ɒ", "ʌ", "ʊ", "ə", "iː", "ɑː", "ɔː", "uː", "ɜː",
  "eɪ", "aɪ", "ɔɪ", "əʊ", "aʊ", "ɪə", "eə", "ʊə",
  "p", "b", "t", "d", "k", "g", "f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h",
  "tʃ", "dʒ", "m", "n", "ŋ", "l", "r", "j", "w",
  "juː", "əl", "ks", "ɪd", "ɪz",
]);

interface G {
  g: string;
  p: string;
  x?: boolean;
}

async function main() {
  const words = await db.word.findMany({ include: { rules: true } });
  const rules = await db.rule.findMany();
  const units = await db.unit.findMany({ include: { words: { include: { word: true } } } });
  const wordSet = new Set(words.map((w) => w.headword));

  let errs = 0;
  for (const w of words) {
    const gr: G[] = JSON.parse(w.graphemes);
    const ph: string[] = JSON.parse(w.phonemes);
    const join = gr.map((x) => x.g).join("");
    if (join !== w.headword) {
      console.error(`❌ ${w.headword}: 拼接 "${join}" 不等于词头`);
      errs++;
    }
    const active = gr.filter((x) => x.p !== "");
    if (active.length !== ph.length || active.some((x, i) => x.p !== ph[i])) {
      console.error(`❌ ${w.headword}: 音素对齐失败`);
      errs++;
    }
    if (ph.some((p) => !ALLOWED_PHONEMES.has(p))) {
      console.error(`❌ ${w.headword}: 非法音素 ${ph.filter((p) => !ALLOWED_PHONEMES.has(p)).join(",")}`);
      errs++;
    }
    for (const wr of w.rules) {
      const rule = rules.find((r) => r.id === wr.ruleId);
      if (!rule) {
        console.error(`❌ ${w.headword}: 无效规则关联`);
        errs++;
      }
    }
  }
  for (const r of rules) {
    const ex: string[] = JSON.parse(r.examples);
    for (const e of ex) {
      if (!wordSet.has(e)) {
        console.error(`❌ 规则 ${r.code}: 示例词 ${e} 不在词库`);
        errs++;
      }
    }
  }
  let unitWordCount = 0;
  for (const u of units) {
    unitWordCount += u.words.length;
    for (const uw of u.words) {
      if (!wordSet.has(uw.word.headword)) errs++;
    }
  }

  if (errs > 0) {
    console.error(`\n共 ${errs} 个错误`);
    process.exit(1);
  }

  const byDiff = new Map<number, number>();
  for (const w of words) byDiff.set(w.difficulty, (byDiff.get(w.difficulty) ?? 0) + 1);

  console.log("✅ 数据库校验全部通过！");
  console.log(`   词库: ${words.length} 词 / Tricky: ${words.filter((w) => w.isTricky).length}`);
  console.log(`   规则: ${rules.length} 条`);
  console.log(`   难度分布: ${[...byDiff.entries()].sort().map(([d, n]) => `D${d}=${n}`).join(" ")}`);
  console.log(`   教材: ${units.length} 单元 / ${unitWordCount} 个单元词`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
