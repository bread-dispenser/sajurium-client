"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type CalendarTopic = "all" | "relationship" | "work" | "money";
type FlowLevel = "차분" | "고른 흐름" | "활발";
type ReportPeriod = "year" | "decade";

const TOPICS: Array<{ value: CalendarTopic; label: string }> = [
  { value: "all", label: "전체" },
  { value: "relationship", label: "관계" },
  { value: "work", label: "일" },
  { value: "money", label: "재물" },
];

const LEVELS: Array<{ label: FlowLevel; color: string }> = [
  { label: "차분", color: "#66757f" },
  { label: "고른 흐름", color: "#9a712d" },
  { label: "활발", color: "#a94d3d" },
];

const TOPIC_DETAILS: Record<CalendarTopic, Record<FlowLevel, string>> = {
  all: {
    차분: "속도를 늦추고 관계·일·지출을 차례로 점검하는 날로 구성한 예시입니다.",
    "고른 흐름": "익숙한 순서를 유지하며 한 가지 약속을 마무리하는 날로 구성한 예시입니다.",
    활발: "여러 제안이 오갈 수 있어 우선순위를 먼저 정하는 날로 구성한 예시입니다.",
  },
  relationship: {
    차분: "답을 서두르기보다 상대의 말을 끝까지 듣는 관계 예시입니다.",
    "고른 흐름": "짧고 분명한 안부가 관계의 리듬을 잇는다는 예시입니다.",
    활발: "새로운 만남보다 이미 한 약속을 구체화하는 관계 예시입니다.",
  },
  work: {
    차분: "새 일을 벌이기보다 문서와 일정을 정리하는 업무 예시입니다.",
    "고른 흐름": "집중할 한 가지를 정해 끝까지 이어가는 업무 예시입니다.",
    활발: "제안과 협업이 늘 수 있어 역할을 명확히 하는 업무 예시입니다.",
  },
  money: {
    차분: "큰 결정보다 반복 지출을 살펴보는 재물 예시입니다.",
    "고른 흐름": "정한 예산 안에서 필요한 지출만 선택하는 재물 예시입니다.",
    활발: "충동적인 선택을 피하고 비교 시간을 두는 재물 예시입니다.",
  },
};

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const shifted = new Date(year, month - 1 + amount, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

function calendarDays(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const leading = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: count }, (_, index) => index + 1),
  ];
}

function levelFor(monthValue: string, day: number, topic: CalendarTopic) {
  const [year, month] = monthValue.split("-").map(Number);
  const topicOffset = TOPICS.findIndex((item) => item.value === topic) * 7;
  return LEVELS[(year * 3 + month * 5 + day * 11 + topicOffset) % LEVELS.length];
}

export function TimingCalendarScreen() {
  const [month, setMonth] = useState("2026-08");
  const [topic, setTopic] = useState<CalendarTopic>("all");
  const [selectedDay, setSelectedDay] = useState(1);
  const days = useMemo(() => calendarDays(month), [month]);
  const selectedLevel = levelFor(month, selectedDay, topic);
  const selectedDate = `${month}-${String(selectedDay).padStart(2, "0")}`;
  const topicLabel = TOPICS.find((item) => item.value === topic)?.label ?? "전체";

  function moveMonth(amount: number) {
    setMonth((current) => shiftMonth(current, amount));
    setSelectedDay(1);
  }

  return (
    <main className="screen-content flow-content" aria-labelledby="calendar-title">
      <div className="editorial-hero">
        <p className="section-kicker">시기 캘린더 · 결정형 프로토타입</p>
        <h1 id="calendar-title">날짜별 흐름을<br />달력으로 살펴보세요</h1>
        <p className="supporting">실제 사주를 계산하지 않습니다. 모든 날짜와 문장은 화면 상호작용을 확인하기 위해 정해진 규칙으로 만든 프로토타입 예시입니다.</p>
      </div>

      <div className="period-control">
        <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">‹</button>
        <label>
          <span className="sr-only">조회 월</span>
          <input
            type="month"
            value={month}
            onChange={(event) => {
              if (!event.target.value) return;
              setMonth(event.target.value);
              setSelectedDay(1);
            }}
          />
        </label>
        <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">›</button>
      </div>

      <fieldset className="report-section">
        <legend>주제 필터</legend>
        <div className="calendar-topic-options">
          {TOPICS.map((item) => (
            <label key={item.value}>
              <input
                type="radio"
                name="calendar-topic"
                value={item.value}
                checked={topic === item.value}
                onChange={() => setTopic(item.value)}
              />{" "}
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>

      <section aria-labelledby="month-grid-title">
        <h2 id="month-grid-title">{month.replace("-", "년 ")}월 흐름 예시</h2>
        <div className="prototype-calendar-grid" role="group" aria-label={`${month} 시기 달력`}>
          {["일", "월", "화", "수", "목", "금", "토"].map((weekday) => (
            <strong className="prototype-calendar-weekday" key={weekday}>{weekday}</strong>
          ))}
          {days.map((day, index) => {
            if (day === null) return <span key={`empty-${index}`} aria-hidden="true" />;
            const level = levelFor(month, day, topic);
            const selected = selectedDay === day;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={selected}
                aria-label={`${month}-${String(day).padStart(2, "0")}, ${level.label}`}
                onClick={() => setSelectedDay(day)}
                className={`prototype-calendar-day level-${LEVELS.findIndex((item) => item.label === level.label)}${selected ? " selected" : ""}`}
              >
                <strong>{day}</strong>
                <small>{level.label}</small>
              </button>
            );
          })}
        </div>
      </section>

      <div className="prototype-calendar-legend" aria-label="흐름 단계 범례">
        {LEVELS.map((level, index) => <span className={`level-${index}`} key={level.label}>● {level.label}</span>)}
      </div>

      <article className="insight-card current" aria-live="polite">
        <small>{selectedDate} · {topicLabel}</small>
        <strong>{selectedLevel.label} 흐름 예시</strong>
        <p>{TOPIC_DETAILS[topic][selectedLevel.label]}</p>
        <p>이 내용은 선택한 월·날짜·필터에 따라 같은 결과를 내는 결정형 화면 예시이며, 개인 출생 정보나 사주 원국을 사용하지 않았습니다.</p>
      </article>
    </main>
  );
}

const REPORTS: Record<ReportPeriod, {
  kicker: string;
  title: string;
  range: string;
  overview: string;
  sections: Array<{ id: string; label: string; title: string; body: string; points: string[] }>;
}> = {
  year: {
    kicker: "연간 리포트",
    title: "한 해의 방향을 네 장면으로 읽기",
    range: "2026년 예시",
    overview: "정리와 확장을 번갈아 배치해 한 해의 계획을 점검하도록 구성한 읽기 예시입니다.",
    sections: [
      { id: "overview", label: "큰 흐름", title: "한 해의 큰 흐름", body: "상반기에는 기준을 세우고 하반기에는 선택한 일의 밀도를 높인다는 서사로 구성했습니다.", points: ["1–3월: 진행 중인 일 목록 정리", "4–8월: 한 가지 역량에 집중", "9–12월: 결과를 기록하고 다음 기준 마련"] },
      { id: "work", label: "일", title: "일과 성장", body: "빠른 확장보다 역할과 기대치를 문장으로 합의하는 흐름을 제안하는 샘플입니다.", points: ["제안 전 성공 조건 적기", "월말에 배운 점 한 줄 기록", "과부하 신호가 보이면 범위 재협의"] },
      { id: "relationships", label: "관계", title: "관계와 생활", body: "관계의 수보다 반복해서 돌볼 수 있는 연결을 우선하는 서사 예시입니다.", points: ["답을 미룰 때 기한 알리기", "중요한 약속은 일정에 기록", "해석보다 사실을 먼저 확인"] },
    ],
  },
  decade: {
    kicker: "10년 리포트",
    title: "긴 호흡의 변화를 세 구간으로 읽기",
    range: "2026–2035년 예시",
    overview: "10년을 준비·전환·정착 구간으로 나누어 장기 선택을 점검하도록 구성한 읽기 예시입니다.",
    sections: [
      { id: "overview", label: "큰 흐름", title: "10년의 큰 흐름", body: "앞의 세 해에는 기반을 다지고, 가운데 네 해에는 방향을 시험하며, 마지막 세 해에는 지속 가능한 방식을 남긴다는 서사입니다.", points: ["2026–2028: 자원과 기준 파악", "2029–2032: 작은 규모로 방향 실험", "2033–2035: 유지할 구조와 관계 정착"] },
      { id: "work", label: "일과 자원", title: "일과 자원의 전환", body: "직함보다 오래 활용할 기술과 협업 방식을 중심에 두는 장기 계획 샘플입니다.", points: ["배움에 쓸 시간과 비용 상한 정하기", "2년마다 계속할 일과 멈출 일 검토", "수입 변화 전에 생활비 기준 확인"] },
      { id: "relationships", label: "관계", title: "관계와 생활 기반", body: "생애 사건을 예측하지 않고 변화에 대응할 생활 기반을 점검하는 예시입니다.", points: ["돌봄과 휴식에 필요한 조건 대화", "주거·건강 결정은 실제 정보로 검토", "관계의 경계와 책임을 주기적으로 합의"] },
    ],
  },
};

export function LongRangeReportScreen({ period }: { period: ReportPeriod }) {
  const router = useRouter();
  const report = REPORTS[period];

  return (
    <main className="screen-content report-content" aria-labelledby="long-report-title">
      <div className="editorial-hero">
        <p className="section-kicker">{report.kicker} · 결정형 프로토타입</p>
        <h1 id="long-report-title">{report.title}</h1>
        <p className="supporting">{report.range} · {report.overview}</p>
      </div>

      <label className="report-section">
        <strong>리포트 기간 선택</strong>
        <select
          value={period}
          onChange={(event) => router.push(`/reports/${event.target.value}`)}
          className="prototype-report-select"
        >
          <option value="year">연간 리포트</option>
          <option value="decade">10년 리포트</option>
        </select>
      </label>

      <nav className="prototype-anchor-nav" aria-label="리포트 섹션 바로가기">
        {report.sections.map((section) => <a className="text-link" href={`#${section.id}`} key={section.id}>{section.title}</a>)}
        <a className="text-link" href="#evidence">근거와 한계</a>
      </nav>

      <p className="accuracy-note">아래 내용은 실제 사주 계산이나 미래 예측이 아닙니다. 기간에 맞춰 미리 작성한 동일한 프로토타입 예시를 모든 방문자에게 보여줍니다.</p>

      <div className="report-sections">
        {report.sections.map((section) => (
          <article className="report-section" id={section.id} key={section.id}>
            <p className="section-kicker">{section.label}</p>
            <h2>{section.title}</h2>
            <strong>{section.body}</strong>
            <ul>{section.points.map((point) => <li key={point}>{point}</li>)}</ul>
          </article>
        ))}
      </div>

      <section className="report-section" id="evidence" aria-labelledby="evidence-title">
        <p className="section-kicker">근거와 한계</p>
        <h2 id="evidence-title">이 리포트가 보여주는 범위</h2>
        <ul>
          <li>근거: 기간별 화면 구조와 읽기 경험을 검토하기 위해 사람이 미리 작성한 고정 예시 문장입니다.</li>
          <li>사용하지 않은 정보: 출생일·출생 시간·사주 원국·현재 상황을 수집하거나 계산하지 않았습니다.</li>
          <li>한계: 실제 사건, 성향, 좋은 시기나 나쁜 시기를 예측하지 않으며 중요한 결정의 근거로 사용할 수 없습니다.</li>
        </ul>
      </section>

      <article className="report-section locked-report-section" aria-labelledby="locked-title">
        <p className="section-kicker">잠긴 구매 상태 예시</p>
        <h2 id="locked-title">개인화된 세부 시기와 해석</h2>
        <p>실제 사주 계산과 결제 기능이 연결되어 있지 않아 열거나 구매할 수 없습니다. 결제 정보는 요청하거나 저장하지 않습니다.</p>
        <button type="button" disabled>심층 리포트 구매 · 이용 불가</button>
      </article>

      <Link className="secondary-button" href="/calendar">시기 캘린더 예시 보기</Link>
    </main>
  );
}
