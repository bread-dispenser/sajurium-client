"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "./saas-core-rollout.module.css";

type CalendarTopic = "love" | "conversation" | "contract" | "career" | "interview" | "money" | "rest" | "new-start";
type FlowLevel = "활용하기 좋은 날" | "무난한 날" | "점검이 필요한 날";
type ReportPeriod = "year" | "decade";

const TOPICS: Array<{
  value: CalendarTopic;
  label: string;
  consultationTopic: "love" | "career" | "money" | "family";
  focus: string;
  usefulAction: string;
  cautionAction: string;
}> = [
  { value: "love", label: "연애", consultationTopic: "love", focus: "마음을 표현하는 속도", usefulAction: "전하고 싶은 마음을 한 문장으로 정리해 보세요.", cautionAction: "상대의 반응을 미리 단정하지 마세요." },
  { value: "conversation", label: "대화", consultationTopic: "family", focus: "말을 주고받는 순서", usefulAction: "확인하고 싶은 내용을 질문 하나로 좁혀 보세요.", cautionAction: "답을 재촉하거나 침묵의 뜻을 추측하지 마세요." },
  { value: "contract", label: "계약", consultationTopic: "career", focus: "조건과 책임의 범위", usefulAction: "금액·기한·해지 조건을 문서에서 다시 확인하세요.", cautionAction: "구두 설명만 듣고 중요한 조건을 넘기지 마세요." },
  { value: "career", label: "이직", consultationTopic: "career", focus: "변화에 필요한 조건", usefulAction: "옮기려는 이유와 포기할 수 없는 조건을 적어 보세요.", cautionAction: "한 번의 감정으로 퇴사 시점을 정하지 마세요." },
  { value: "interview", label: "면접", consultationTopic: "career", focus: "경험을 전달하는 방식", usefulAction: "대표 경험 하나를 상황·행동·결과 순서로 말해 보세요.", cautionAction: "준비한 답을 빠르게 쏟아내지 마세요." },
  { value: "money", label: "돈", consultationTopic: "money", focus: "지출과 선택의 기준", usefulAction: "필요한 지출과 미룰 수 있는 지출을 나눠 보세요.", cautionAction: "비교 없이 큰 금액을 바로 결정하지 마세요." },
  { value: "rest", label: "휴식", consultationTopic: "family", focus: "회복에 필요한 여백", usefulAction: "방해받지 않는 짧은 휴식 시간을 일정에 넣어 보세요.", cautionAction: "쉬는 시간을 남은 일로 다시 채우지 마세요." },
  { value: "new-start", label: "새로운 시작", consultationTopic: "career", focus: "첫 단계를 정하는 기준", usefulAction: "오늘 끝낼 수 있는 가장 작은 첫 단계를 정하세요.", cautionAction: "완벽한 계획을 기다리며 시작을 미루지 마세요." },
];

const LEVELS: Array<{ label: FlowLevel; color: string }> = [
  { label: "활용하기 좋은 날", color: "#a94d3d" },
  { label: "무난한 날", color: "#9a712d" },
  { label: "점검이 필요한 날", color: "#66757f" },
];

const FLOW_DETAILS: Record<FlowLevel, string> = {
  "활용하기 좋은 날": "준비한 기준을 실제 행동으로 옮겨 보기 좋은 흐름",
  "무난한 날": "익숙한 순서를 지키며 한 가지를 마무리하는 흐름",
  "점검이 필요한 날": "결론보다 빠뜨린 조건이 없는지 먼저 살피는 흐름",
};

const ACTION_TIMINGS = ["오전에", "오후에", "하루를 마치기 전에"] as const;
const REVIEW_PROMPTS = ["실행 전에 한 번 더 확인하세요.", "관련된 사람과 사실을 맞춰 보세요.", "결정 이유를 짧게 기록해 두세요."] as const;

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
  const [topic, setTopic] = useState<CalendarTopic>("love");
  const [selectedDay, setSelectedDay] = useState(1);
  const days = useMemo(() => calendarDays(month), [month]);
  const selectedLevel = levelFor(month, selectedDay, topic);
  const selectedDate = `${month}-${String(selectedDay).padStart(2, "0")}`;
  const selectedTopic = TOPICS.find((item) => item.value === topic) ?? TOPICS[0];
  const fixtureRule = ((Number(month.replace("-", "")) + selectedDay * 17 + TOPICS.findIndex((item) => item.value === topic) * 13) % 97) + 1;
  const actionTiming = ACTION_TIMINGS[fixtureRule % ACTION_TIMINGS.length];
  const reviewPrompt = REVIEW_PROMPTS[(fixtureRule + 1) % REVIEW_PROMPTS.length];
  const consultationHref = `/consult/new?topic=${selectedTopic.consultationTopic}&period=${selectedDate}`;

  function moveMonth(amount: number) {
    setMonth((current) => shiftMonth(current, amount));
    setSelectedDay(1);
  }

  return (
    <main className={`screen-content flow-content ${styles.scope}`} aria-labelledby="calendar-title">
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
        <small>{selectedDate} · {selectedTopic.label}</small>
        <strong>{selectedLevel.label} 흐름 예시</strong>
        <dl>
          <div><dt>핵심 흐름</dt><dd>{selectedTopic.focus}을 중심으로 {FLOW_DETAILS[selectedLevel.label]}입니다.</dd></div>
          <div><dt>활용 행동</dt><dd>{actionTiming} {selectedTopic.usefulAction}</dd></div>
          <div><dt>주의 행동</dt><dd>{selectedTopic.cautionAction} {reviewPrompt}</dd></div>
          <div><dt>관련 근거</dt><dd>{selectedDate}과 {selectedTopic.label} 필터를 조합한 로컬 예시 규칙 #{fixtureRule}에 따른 내용입니다.</dd></div>
        </dl>
        <p>이 내용은 선택한 날짜와 필터에 따라 같은 결과를 내는 결정형 화면 예시이며, 개인 출생 정보나 사주 원국을 사용한 실제 계산이 아닙니다.</p>
        <Link className="secondary-button" href={consultationHref}>이 날짜와 주제로 상담 시작하기</Link>
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
    <main className={`screen-content report-content ${styles.scope}`} aria-labelledby="long-report-title">
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
