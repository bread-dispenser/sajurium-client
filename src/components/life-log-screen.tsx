"use client";

import { FormEvent, useState } from "react";

type LifeEvent = {
  id: string;
  date: string;
  category: "관계" | "일" | "재물" | "가족";
  title: string;
  note: string;
};

const INITIAL_EVENTS: readonly LifeEvent[] = [
  { id: "event-1", date: "2026-08-12", category: "일", title: "새 프로젝트 제안을 받음", note: "업무 범위와 협업 방식을 먼저 확인했다." },
  { id: "event-2", date: "2026-07-28", category: "관계", title: "미뤄둔 대화를 나눔", note: "기대하는 방식을 짧고 분명하게 전달했다." },
] as const;

export function LifeLogPrototypeScreen() {
  const [events, setEvents] = useState<LifeEvent[]>([...INITIAL_EVENTS]);
  const [category, setCategory] = useState<"전체" | LifeEvent["category"]>("전체");
  const [date, setDate] = useState("2026-08-25");
  const [eventCategory, setEventCategory] = useState<LifeEvent["category"]>("일");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  const visibleEvents = events.filter((event) => category === "전체" || event.category === category);

  function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setMessage("기록 제목을 입력해 주세요.");
      return;
    }
    setEvents((current) => [{ id: `event-${Date.now()}`, date, category: eventCategory, title: title.trim(), note: note.trim() }, ...current]);
    setTitle("");
    setNote("");
    setMessage("현재 화면의 프로토타입 기록에 추가했어요. 브라우저를 닫으면 사라집니다.");
  }

  return (
    <main className="screen-content life-log-content" aria-labelledby="life-log-title">
      <div className="platform-hero">
        <p className="section-kicker">라이프 로그 · 프로토타입</p>
        <h1 id="life-log-title">실제 사건과 선택을<br />시간순으로 기록하세요</h1>
        <p className="supporting">과거의 사건과 그때의 판단을 나란히 보며 반복되는 패턴을 점검하는 화면입니다. 실제 사주 계산이나 서버 저장은 하지 않습니다.</p>
      </div>

      <form className="prototype-form" onSubmit={addEvent}>
        <h2>새 사건 기록</h2>
        <label><span>날짜</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span>주제</span><select value={eventCategory} onChange={(event) => setEventCategory(event.target.value as LifeEvent["category"])}>{["관계", "일", "재물", "가족"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>제목</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="무슨 일이 있었나요?" /></label>
        <label><span>메모</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="선택한 이유와 실제 결과를 적어보세요" /></label>
        <button className="primary-button" type="submit">프로토타입 기록 추가</button>
        {message && <p className="form-error" role="status">{message}</p>}
      </form>

      <section className="prototype-section" aria-labelledby="life-timeline-title">
        <div className="platform-section-heading">
          <p className="section-kicker">타임라인</p>
          <h2 id="life-timeline-title">기록한 사건</h2>
        </div>
        <label className="prototype-filter"><span>주제 필터</span><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>{["전체", "관계", "일", "재물", "가족"].map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="life-event-list">
          {visibleEvents.map((event) => <article key={event.id}><time dateTime={event.date}>{event.date}</time><small>{event.category}</small><h3>{event.title}</h3><p>{event.note || "추가 메모 없음"}</p></article>)}
        </div>
      </section>
    </main>
  );
}
