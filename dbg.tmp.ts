import { readFileSync } from "node:fs";
// 从 align-remaining 提取逻辑太麻烦，直接 import 会执行 main。改为复制核心：bun 支持 import 但 main 会跑。
// 简化：用正则从 align-remaining.ts 抽出 IPA 表，在独立小脚本里复用 alignDP —— 直接把脚本改造成可导出？
// 最快路径：直接在这里重写一个最小 alignDP 拷贝（同逻辑）并打印每个失败词的匹配过程。
const IPA: Record<string, string[]> = {
  timetable: ["t","aɪ","m","t","eɪ","b","ə","l"],
  tuesday: ["t","j","uː","z","d","eɪ"],
  wednesday: ["w","e","n","z","d","eɪ"],
  saturday: ["s","æ","t","ə","d","eɪ"],
  medicine: ["m","e","d","s","ə","n"],
  eighth: ["eɪ","t","θ"],
  restaurant: ["r","e","s","t","r","ɒ","ə","n","t"],
  someone: ["s","ʌ","m","w","ʌ","n"],
  delicious: ["d","ɪ","l","ɪ","ʃ","ə","s"],
  exciting: ["ɪ","k","s","aɪ","t","ɪ","ŋ"],
  future: ["f","j","uː","t","ʃ","ə"],
};
console.log("调试需 import alignDP —— 直接改主脚本导出");
