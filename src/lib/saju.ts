/** Display helpers for server-calculated charts. Calculation itself stays on the server. */

export type Element = "목" | "화" | "토" | "금" | "수";

export const STEMS = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"] as const;
export const BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"] as const;

const STEM_HANJA = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
const BRANCH_HANJA = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
const STEM_ELEMENTS: readonly Element[] = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];
const BRANCH_ELEMENTS: readonly Element[] = ["수", "토", "목", "목", "토", "화", "화", "토", "금", "금", "토", "수"];

export const ELEMENTS: readonly Element[] = ["목", "화", "토", "금", "수"];
export const ELEMENT_HANJA: Record<Element, string> = { 목: "木", 화: "火", 토: "土", 금: "金", 수: "水" };

export type Glyph = { ko: string; hanja: string; element: Element };
export type Pillar = { stem: Glyph; branch: Glyph; tenGod: string | null };
export type PillarKey = "hour" | "day" | "month" | "year";
export type DaeunPeriod = { ganji: string; startAge: number; endAge: number; stem: Glyph | null; branch: Glyph | null };

export type ChartView = {
  id: string;
  profileId: string;
  pillars: Record<PillarKey, Pillar | null>;
  fiveElements: Record<Element, number>;
  daeun: { direction: "forward" | "backward" | null; startAge: number | null; birthYear: number | null; periods: DaeunPeriod[] };
  engineVersion: string;
  calculationMethod: string;
};

export const PILLAR_ORDER: readonly PillarKey[] = ["hour", "day", "month", "year"];
export const PILLAR_LABELS: Record<PillarKey, string> = { hour: "시주", day: "일주", month: "월주", year: "년주" };

export function stemGlyph(ko: string): Glyph | null {
  const index = STEMS.indexOf(ko as (typeof STEMS)[number]);
  return index < 0 ? null : { ko, hanja: STEM_HANJA[index], element: STEM_ELEMENTS[index] };
}

export function branchGlyph(ko: string): Glyph | null {
  const index = BRANCHES.indexOf(ko as (typeof BRANCHES)[number]);
  return index < 0 ? null : { ko, hanja: BRANCH_HANJA[index], element: BRANCH_ELEMENTS[index] };
}

export function ganjiGlyphs(ganji: string): { stem: Glyph | null; branch: Glyph | null } {
  return { stem: stemGlyph(ganji.slice(0, 1)), branch: branchGlyph(ganji.slice(1, 2)) };
}

export function ganjiHanja(ganji: string): string {
  const { stem, branch } = ganjiGlyphs(ganji);
  return `${stem?.hanja ?? ""}${branch?.hanja ?? ""}`;
}

function pillar(stemKo: string | null | undefined, branchKo: string | null | undefined, tenGod: unknown): Pillar | null {
  const stem = stemKo ? stemGlyph(stemKo) : null;
  const branch = branchKo ? branchGlyph(branchKo) : null;
  if (!stem || !branch) return null;
  return { stem, branch, tenGod: typeof tenGod === "string" ? tenGod : null };
}

type ApiChartLike = {
  id: number;
  profile_id: number;
  engine_version: string;
  calculation_method: string;
  year_gan: string;
  year_ji: string;
  month_gan: string;
  month_ji: string;
  day_gan: string;
  day_ji: string;
  hour_gan?: string | null;
  hour_ji?: string | null;
  five_elements?: Record<string, unknown> | null;
  ten_gods?: Record<string, unknown> | null;
  daeun_info?: Record<string, unknown> | null;
};

export function toChartView(chart: ApiChartLike): ChartView {
  const tenGods = chart.ten_gods ?? {};
  const fiveElements = Object.fromEntries(ELEMENTS.map((element) => {
    const value = chart.five_elements?.[element];
    return [element, typeof value === "number" ? value : 0];
  })) as Record<Element, number>;
  const daeun = chart.daeun_info ?? {};
  const rawPeriods = Array.isArray(daeun.periods) ? daeun.periods as Array<Record<string, unknown>> : [];
  const startAge = typeof daeun.start_age === "number" ? daeun.start_age : null;
  const startYear = typeof daeun.start_year === "number" ? daeun.start_year : null;
  return {
    id: String(chart.id),
    profileId: String(chart.profile_id),
    pillars: {
      hour: pillar(chart.hour_gan, chart.hour_ji, tenGods.hour),
      day: pillar(chart.day_gan, chart.day_ji, null),
      month: pillar(chart.month_gan, chart.month_ji, tenGods.month),
      year: pillar(chart.year_gan, chart.year_ji, tenGods.year),
    },
    fiveElements,
    daeun: {
      direction: daeun.direction === "forward" || daeun.direction === "backward" ? daeun.direction : null,
      startAge,
      birthYear: startAge !== null && startYear !== null ? startYear - startAge : null,
      periods: rawPeriods.flatMap((period) => {
        const ganji = typeof period.ganji === "string" ? period.ganji : "";
        const from = typeof period.start_age === "number" ? period.start_age : null;
        const to = typeof period.end_age === "number" ? period.end_age : null;
        if (!ganji || from === null || to === null) return [];
        return [{ ganji, startAge: from, endAge: to, ...ganjiGlyphs(ganji) }];
      }),
    },
    engineVersion: chart.engine_version,
    calculationMethod: chart.calculation_method,
  };
}

/** The period covering the given year, using the same age convention as the server's start_age. */
export function currentDaeun(chart: ChartView, year = new Date().getFullYear()): DaeunPeriod | null {
  if (chart.daeun.birthYear === null) return null;
  const age = year - chart.daeun.birthYear;
  return chart.daeun.periods.find((period) => age >= period.startAge && age <= period.endAge) ?? null;
}

const DAY_MS = 86_400_000;
// 2026-09-28 is 을사일, index 41 of the sexagenary cycle.
const DAY_CYCLE_ANCHOR = Date.UTC(2026, 8, 28);
const DAY_CYCLE_ANCHOR_INDEX = 41;

/** Day pillar (일진) for a calendar date. Only for display beside dates; charts come from the server. */
export function dayGanji(year: number, month: number, day: number): string {
  const offset = Math.round((Date.UTC(year, month - 1, day) - DAY_CYCLE_ANCHOR) / DAY_MS);
  const index = (((DAY_CYCLE_ANCHOR_INDEX + offset) % 60) + 60) % 60;
  return `${STEMS[index % 10]}${BRANCHES[index % 12]}`;
}

export function yearGanji(year: number): string {
  const index = (((year - 4) % 60) + 60) % 60;
  return `${STEMS[index % 10]}${BRANCHES[index % 12]}`;
}
