/**
 * 地区证面模板：同一排版，按地区名称匹配文案
 * @module regions
 */
export interface RegionTemplate {
  province: string;
  frontTitle: string;
  backTitle: string;
  hospitals: string[];
}

export const REGIONS: RegionTemplate[] = [
  {
    province: '广东省',
    frontTitle: '广东省食品从业人员健康证明',
    backTitle: '广东省食品从业人员健康证明',
    hospitals: ['深圳市第一人民医院', '深圳市第二人民医院', '广州市第一人民医院']
  },
  {
    province: '湖北省',
    frontTitle: '湖北省食品从业人员健康证明',
    backTitle: '湖北省食品从业人员健康证明',
    hospitals: ['武汉市第一医院', '武汉市中心医院']
  }
];

/**
 * 按地区名称取模板：填什么地区就出什么标题，未收录则按填的内容自动生成
 * @param regionName 手填地区，如 广东省
 */
export function getRegionTemplate(regionName?: string): RegionTemplate {
  const hit = REGIONS.find((r) => r.province === (regionName || '').trim());
  if (hit) return hit;
  const p = (regionName || '广东省').trim() || '广东省';
  return { province: p, frontTitle: `${p}食品从业人员健康证明`, backTitle: `${p}食品从业人员健康证明`, hospitals: [] };
}
