/**
 * 拼读星球 PhonicsStar — L0~L8 级别元信息（写死映射）
 */

export interface LevelMeta {
  level: number;
  title: string;
  subtitle: string;
}

export const LEVEL_META: LevelMeta[] = [
  { level: 0, title: "字母认知", subtitle: "认识字母音" },
  { level: 1, title: "单字母拼读", subtitle: "CVC 拼读起步" },
  { level: 2, title: "魔法E", subtitle: "安静的小e有魔法" },
  { level: 3, title: "辅音组合", subtitle: "两个字母一个音" },
  { level: 4, title: "元音组合", subtitle: "元音手拉手" },
  { level: 5, title: "R控制", subtitle: "被r绑架的元音" },
  { level: 6, title: "软硬音与静音", subtitle: "c g变身术" },
  { level: 7, title: "音节切分", subtitle: "攻克多音节词" },
  { level: 8, title: "构词法", subtitle: "后缀变化规则" },
];

export function levelMeta(level: number): LevelMeta | undefined {
  return LEVEL_META.find((m) => m.level === level);
}
