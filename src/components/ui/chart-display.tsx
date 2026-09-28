import { ELEMENT_HANJA, ELEMENTS, PILLAR_LABELS, PILLAR_ORDER, currentDaeun, type ChartView, type Element, type Glyph, type PillarKey } from "@/lib/saju";

const SHORT_LABELS: Record<PillarKey, string> = { hour: "시", day: "일", month: "월", year: "년" };

function Char({ glyph, dark, className }: { glyph: Glyph; dark?: boolean; className: string }) {
  return <span className={`sj-hanja ${className} ${dark ? `sj-el-dark-${glyph.element}` : `sj-el-${glyph.element}`}`} lang="zh-Hant">{glyph.hanja}</span>;
}

/** Four pillars with ten gods and readings; the day pillar (일간) is set in ink. */
export function PillarGrid({ chart, reveal = false }: { chart: ChartView; reveal?: boolean }) {
  return (
    <div className="sj-pillars" role="list" aria-label="네 기둥">
      {PILLAR_ORDER.map((key, index) => {
        const pillar = chart.pillars[key];
        const revealClass = reveal ? ` sj-reveal sj-reveal-${index + 1}` : "";
        if (!pillar) {
          return (
            <div key={key} className={`sj-pillar-empty${revealClass}`} role="listitem">
              <span>{PILLAR_LABELS[key]}</span>
              <span>시간 미상</span>
            </div>
          );
        }
        const me = key === "day";
        const label = `${PILLAR_LABELS[key]} ${pillar.stem.ko}${pillar.branch.ko}, ${pillar.stem.ko}${pillar.stem.element} ${pillar.branch.ko}${pillar.branch.element}${pillar.tenGod ? `, ${pillar.tenGod}` : me ? ", 나" : ""}`;
        return (
          <div key={key} className={`${me ? "sj-pillar-me" : "sj-pillar"}${revealClass}`} role="listitem" aria-label={label}>
            <span className={me ? "sj-pillar-reading-dark" : "sj-pillar-label"} aria-hidden="true">{PILLAR_LABELS[key]}</span>
            <span className={me ? "sj-pillar-god-me" : "sj-pillar-god"} aria-hidden="true">{me ? "나" : pillar.tenGod ?? ""}</span>
            <Char glyph={pillar.stem} dark={me} className="sj-pillar-char" />
            <span className={me ? "sj-pillar-reading-dark" : "sj-pillar-reading"} aria-hidden="true">{pillar.stem.ko}{pillar.stem.element}</span>
            <span className={me ? "sj-pillar-divider-dark" : "sj-pillar-divider"} aria-hidden="true" />
            <Char glyph={pillar.branch} dark={me} className="sj-pillar-char" />
            <span className={me ? "sj-pillar-reading-dark" : "sj-pillar-reading"} aria-hidden="true">{pillar.branch.ko}{pillar.branch.element}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Joined four-cell strip: the loudest element on landing and summaries. */
export function PillarStrip({ chart, reveal = false }: { chart: ChartView; reveal?: boolean }) {
  return (
    <div className="sj-pillar-strip" role="list" aria-label="명식 여덟 글자">
      {PILLAR_ORDER.map((key, index) => {
        const pillar = chart.pillars[key];
        const me = key === "day";
        const revealClass = reveal ? ` sj-reveal sj-reveal-${index + 1}` : "";
        return (
          <div key={key} className={`sj-strip-cell${me ? " sj-strip-cell-me" : ""}${revealClass}`} role="listitem" aria-label={pillar ? `${PILLAR_LABELS[key]} ${pillar.stem.ko}${pillar.branch.ko}` : `${PILLAR_LABELS[key]} 시간 미상`}>
            <span className={me ? "sj-pillar-reading-dark" : "sj-pillar-label"} aria-hidden="true">{SHORT_LABELS[key]}</span>
            {pillar ? (
              <>
                <Char glyph={pillar.stem} dark={me} className="sj-strip-char" />
                <Char glyph={pillar.branch} dark={me} className="sj-strip-char" />
              </>
            ) : <span className="sj-pillar-label" aria-hidden="true">미상</span>}
          </div>
        );
      })}
    </div>
  );
}

export function ElementBalance({ counts }: { counts: Record<Element, number> }) {
  const label = ELEMENTS.map((element) => `${element} ${counts[element]}`).join(", ");
  return (
    <>
      <div className="sj-element-bar" role="img" aria-label={`오행 분포: ${label}`}>
        {ELEMENTS.filter((element) => counts[element] > 0).map((element) => (
          <div key={element} className={`sj-fill-${element}`} style={{ flexGrow: counts[element] }} />
        ))}
      </div>
      <div className="sj-element-legend" aria-hidden="true">
        {ELEMENTS.map((element) => (
          <div key={element} className="sj-element-legend-item">
            <span className={`sj-hanja sj-el-${element}`} style={{ fontSize: 18 }}>{ELEMENT_HANJA[element]}</span>
            <span>{element} {counts[element]}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function DaeunStrip({ chart, year = new Date().getFullYear() }: { chart: ChartView; year?: number }) {
  const now = currentDaeun(chart, year);
  const nowIndex = now ? chart.daeun.periods.indexOf(now) : -1;
  const visible = chart.daeun.periods.slice(Math.max(0, nowIndex - 3), Math.max(0, nowIndex - 3) + 6);
  return (
    <ol className="sj-daeun-strip" aria-label="대운 구간">
      {visible.map((period) => {
        const index = chart.daeun.periods.indexOf(period);
        const className = index === nowIndex ? "sj-daeun-now" : nowIndex >= 0 && index < nowIndex ? "sj-daeun-past" : "sj-daeun";
        return (
          <li key={period.ganji + period.startAge} className={className} aria-current={index === nowIndex ? "true" : undefined}>
            <span className="sj-daeun-ganji">{period.ganji}</span>
            <span className="sj-daeun-age">{period.startAge}–{period.endAge}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function GanjiTile({ ganji, hanja }: { ganji: string; hanja: string }) {
  return <span className="sj-ganji-tile" aria-label={ganji} lang="zh-Hant">{hanja}</span>;
}
