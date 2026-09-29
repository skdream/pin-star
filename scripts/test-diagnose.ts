import { diagnose, type DiagnoseWord } from "../src/lib/phonics/diagnose";

const mk = (headword: string, phonemes: string[], graphemes: [string, string, number?][], rules: DiagnoseWord["rules"] = [], isTricky = false): DiagnoseWord => ({
  headword, phonemes, isTricky,
  graphemes: graphemes.map(([g, p, x]) => (x || p === "" ? { g, p, x: true } : { g, p })),
  rules,
});

const ship = mk("ship", ["ʃ","ɪ","p"], [["sh","ʃ"],["i","ɪ"],["p","p"]], [
  { code: "L3-SH", name: "sh → /tʃ/", pattern: "sh", description: "sh读/ʃ/", tip: "请安静" },
  { code: "L1-SHORT-I", name: "短元音 i → /ɪ/", pattern: "i", description: "i闭音节读/ɪ/", tip: "短促" },
]);
const rain = mk("rain", ["r","eɪ","n"], [["r","r"],["ai","eɪ"],["n","n"]], [
  { code: "L4-AI", name: "ai / ay → /eɪ/", pattern: "ai|ay", description: "ai词中ay词尾", tip: "别写成rane" },
]);
const running = mk("running", ["r","ʌ","n","ɪ","ŋ"], [["r","r"],["u","ʌ"],["nn","n"],["i","ɪ"],["ng","ŋ"]], [
  { code: "L8-DOUBLE", name: "双写辅音+ing", pattern: "double", description: "短元音+单辅音加ing双写", tip: "run→runn+ing" },
]);
const banana = mk("banana", ["b","ə","n","ɑː","n","ə"], [["b","b"],["a","ə"],["n","n"],["a","ɑː"],["n","n"],["a","ə"]], [
  { code: "L7-SCHWA", name: "弱读 Schwa", pattern: "schwa", description: "非重读元音弱化", tip: "三个a读音全不同" },
]);
const said = mk("said", ["s","e","d"], [["s","s"],["ai","e",1],["d","d"]], [], true);

const lexicon = { sheep: ["ʃ","iː","p"], sit: ["s","ɪ","t"], seat: ["s","iː","t"] };

const t = (label: string, word: DiagnoseWord, answer: string, wantTypes: string[], extra?: { realWord?: string | null; correct?: boolean; rule?: string }) => {
  const r = diagnose(word, answer, { lexicon });
  const okTypes = JSON.stringify(r.errorTypes) === JSON.stringify(wantTypes);
  const okReal = extra?.realWord === undefined || r.realWord === extra.realWord;
  const okCorrect = extra?.correct === undefined || r.correct === extra.correct;
  const okRule = extra?.rule === undefined || r.remediation?.ruleCode === extra.rule;
  console.log(`${okTypes && okReal && okCorrect && okRule ? "PASS" : "FAIL"} ${label} → correct=${r.correct} types=${JSON.stringify(r.errorTypes)} real=${r.realWord} rule=${r.remediation?.ruleCode ?? null} missing="${r.missing}" extra="${r.extra}"`);
  if (!(okTypes && okReal && okCorrect && okRule)) console.log("   letters:", JSON.stringify(r.letterFeedback), "phon:", JSON.stringify(r.phonemeFeedback));
};

t("ship→sheep PHONEME+realWord", ship, "sheep", ["PHONEME"], { realWord: "sheep", rule: "L1-SHORT-I" });
t("rain→rane PATTERN+L4-AI", rain, "rane", ["PATTERN"], { rule: "L4-AI" });
t("running→runing SUFFIX", running, "runing", ["SUFFIX"], { rule: "L8-DOUBLE" });
t("banana→bana SEGMENT", banana, "bana", ["SEGMENT"], { rule: "L7-SCHWA" });
t("said→sed IRREGULAR", said, "sed", ["IRREGULAR"]);
t("ship→ship correct", ship, "ship", [], { correct: true });
t("ship→ (空) SEGMENT", ship, "", ["SEGMENT"]);
t("ship→shap PHONEME", ship, "shap", ["PHONEME"]);
t("ship→shup PHONEME", ship, "shup", ["PHONEME"]);
t("sit→seat via lexicon", mk("sit", ["s","ɪ","t"], [["s","s"],["i","ɪ"],["t","t"]]), "seat", ["PHONEME"], { realWord: "seat" });
// MEMORY 修复注记
const r8 = diagnose(ship, "ship", { lexicon, reviewLastResult: "WRONG" });
console.log(`${r8.correct && r8.errorTypes.includes("MEMORY") ? "PASS" : "FAIL"} ship正确但上次的错 → MEMORY 注记: ${JSON.stringify(r8.errorTypes)}`);
