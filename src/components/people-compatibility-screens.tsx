"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import type {
  CompatibilityData,
  CompatibilityRelationshipType,
  CompatibilityResult,
  LibraryData,
  PeopleData,
  PersonProfile,
  PersonRelationship,
} from "@/lib/domain";
import { COMPATIBILITY_DIMENSIONS, INITIAL_LIBRARY_ITEMS, INITIAL_PEOPLE_DATA } from "@/lib/fixtures";
import { compatibilityStore, createTransactionStep, libraryStore, peopleStore, runStorageTransaction } from "@/lib/storage";
import { useHydrated } from "@/hooks/use-hydrated";
import { CorruptState, EmptyState, LoadingState } from "./page-state";

const RELATIONSHIP_LABELS: Record<PersonRelationship, string> = {
  self: "본인",
  partner: "연인·배우자",
  family: "가족",
  friend: "친구",
  coworker: "동료",
};

const COMPATIBILITY_LABELS: Record<CompatibilityRelationshipType, string> = {
  dating: "연애",
  marriage: "결혼",
  family: "가족",
  friend: "친구",
  business: "동업",
};

function getPeopleData(): PeopleData | null {
  const inspection = peopleStore.inspect();
  if (inspection.status === "ok") return inspection.value;
  if (inspection.status !== "empty") return null;
  return { ...INITIAL_PEOPLE_DATA, people: [...INITIAL_PEOPLE_DATA.people] };
}

function getCompatibilityData(): CompatibilityData | null {
  const inspection = compatibilityStore.inspect();
  if (inspection.status === "ok") return inspection.value;
  if (inspection.status !== "empty") return null;
  return { version: 1, results: [] };
}

function maskBirthDate(value: string) {
  return `${value.slice(0, 4)}. **. **`;
}

function buildLibraryWithCompatibility(result: CompatibilityResult, names: string): LibraryData | null {
  const inspection = libraryStore.inspect();
  if (inspection.status === "corrupt" || inspection.status === "unavailable") return null;
  const current = inspection.status === "ok" ? inspection.value.items : [...INITIAL_LIBRARY_ITEMS];
  return {
    version: 1,
    items: [
      {
        id: `library-${result.id}`,
        type: "compatibility",
        title: `${names} 관계 요약`,
        subtitle: `${COMPATIBILITY_LABELS[result.relationshipType]} 예시 분석`,
        createdAt: result.createdAt,
        href: `/compatibility/result/${result.id}`,
        hidden: false,
      },
      ...current.filter((item) => item.id !== `library-${result.id}`),
    ],
  };
}

export function PeopleScreen() {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(peopleStore.subscribe, peopleStore.rawSnapshot, () => null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [message, setMessage] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  if (!hydrated) return <LoadingState title="사람 보관함을 확인하고 있어요" />;
  void raw;
  const data = getPeopleData();
  if (!data) return <CorruptState title="사람 데이터를 읽을 수 없어요" description="손상된 인물 정보를 확인 없이 체험용 예시로 바꾸지 않습니다." unavailable={peopleStore.inspect().status === "unavailable"} onReset={peopleStore.remove} />;
  const activeData: PeopleData = data;
  const people = [...data.people]
    .filter((person) => `${person.name} ${RELATIONSHIP_LABELS[person.relationship]}`.includes(query.trim()))
    .sort((left, right) => sort === "newest" ? right.createdAt.localeCompare(left.createdAt) : left.createdAt.localeCompare(right.createdAt));
  const limitReached = data.people.length >= data.freeLimit;

  function deletePerson(id: string) {
    if (!peopleStore.write({ ...activeData, people: activeData.people.filter((person) => person.id !== id) })) {
      setMessage("이 인물을 삭제할 수 없어요.");
      return;
    }
    setPendingDeleteId(null);
    setMessage("인물을 이 기기에서 삭제했어요.");
  }

  return (
    <main className="screen-content people-content" aria-labelledby="people-title">
      <p className="section-kicker">사람 보관함</p>
      <h1 id="people-title">관계를 살펴볼 사람을<br />이 기기에 저장하세요</h1>
      <p className="supporting">출생 정보는 마스킹해 표시하며 외부로 전송하지 않습니다.</p>
      <div className="limit-summary"><span>무료 저장</span><strong>{data.people.length} / {data.freeLimit}</strong></div>
      {limitReached ? <p className="limit-notice">체험용 무료 저장 한도에 도달했어요. 새 인물을 추가하려면 기존 인물을 삭제하세요.</p> : <Link className="primary-button" href="/people/new">새 인물 추가</Link>}
      <div className="people-controls"><label>검색<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 관계" /></label><label>정렬<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">최신순</option><option value="oldest">오래된순</option></select></label></div>
      {people.length === 0 ? <EmptyState title="조건에 맞는 인물이 없어요" description="검색어를 바꾸거나 새 인물을 추가하세요." /> : (
        <div className="people-list">
          {people.map((person) => (
            <article key={person.id}>
              <div><small>{RELATIONSHIP_LABELS[person.relationship]}</small><h2>{person.name}</h2><p>{maskBirthDate(person.birth.birthDate)} · {person.birth.unknownTime ? "출생 시간 미상" : "시간 저장됨"}</p></div>
              <div className="people-item-actions">
                <Link href={`/people/${person.id}/edit`}>수정</Link>
                {pendingDeleteId === person.id ? (
                  <div className="danger-confirm person-delete-confirm">
                    <p>{person.name}님의 저장 정보를 삭제할까요?</p>
                    <button type="button" onClick={() => deletePerson(person.id)}>인물 삭제 확정</button>
                    <button type="button" onClick={() => setPendingDeleteId(null)}>취소</button>
                  </div>
                ) : <button type="button" onClick={() => { setPendingDeleteId(person.id); setMessage(""); }}>삭제</button>}
              </div>
            </article>
          ))}
        </div>
      )}
      {message && <p className="form-error" role="status">{message}</p>}
      <Link className="secondary-button" href="/compatibility">두 사람 선택하기</Link>
    </main>
  );
}

export function PersonFormScreen({ personId }: { personId?: string }) {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingState title="인물 정보를 준비하고 있어요" />;
  const data = getPeopleData();
  if (!data) return <CorruptState title="사람 데이터를 읽을 수 없어요" description="손상된 인물 정보를 확인 없이 덮어쓰지 않습니다." unavailable={peopleStore.inspect().status === "unavailable"} onReset={peopleStore.remove} />;
  const existing = personId ? data.people.find((person) => person.id === personId) : undefined;
  if (personId && !existing) return <EmptyState title="인물을 찾을 수 없어요" description="삭제됐거나 다른 브라우저에 저장된 인물일 수 있어요." action={{ href: "/people", label: "사람 보관함으로" }} />;
  return <PersonForm key={personId ?? "new"} data={data} existing={existing} />;
}

function PersonForm({ data, existing }: { data: PeopleData; existing?: PersonProfile }) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  const [relationship, setRelationship] = useState<PersonRelationship>(existing?.relationship ?? "partner");
  const [birthDate, setBirthDate] = useState(existing?.birth.birthDate ?? "1990-01-01");
  const [birthTime, setBirthTime] = useState(existing?.birth.birthTime ?? "12:00");
  const [unknownTime, setUnknownTime] = useState(existing?.birth.unknownTime ?? false);
  const [hasAuthority, setHasAuthority] = useState(Boolean(existing));
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return setError("이름 또는 별칭을 입력해 주세요.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return setError("올바른 생년월일을 입력해 주세요.");
    if (!existing && data.people.length >= data.freeLimit) return setError("체험용 무료 저장 한도에 도달했어요.");
    if (relationship !== "self" && !hasAuthority) return setError("상대방의 정보를 저장할 권한이나 동의를 확인해 주세요.");
    const now = new Date().toISOString();
    const person: PersonProfile = {
      id: existing?.id ?? `person-${now.replace(/\D/g, "")}`,
      name: name.trim(),
      relationship,
      birth: { nickname: name.trim(), calendar: existing?.birth.calendar ?? "solar", birthDate, birthTime, unknownTime },
      createdAt: existing?.createdAt ?? now,
    };
    const people = existing ? data.people.map((candidate) => candidate.id === existing.id ? person : candidate) : [...data.people, person];
    if (!peopleStore.write({ ...data, people })) return setError("이 브라우저에서는 인물을 저장할 수 없어요.");
    router.push("/people");
  }

  return (
    <form className="screen-content person-form" onSubmit={submit} aria-labelledby="person-form-title">
      <p className="section-kicker">{existing ? "인물 수정" : "새 인물"}</p>
      <h1 id="person-form-title">출생 정보를<br />알려주세요</h1>
      <label>이름 또는 별칭<input value={name} onChange={(event) => { setName(event.target.value); setError(""); }} /></label>
      <label>관계<select value={relationship} onChange={(event) => setRelationship(event.target.value as PersonRelationship)}>{Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>생년월일<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} /></label>
      <label>출생 시간<input type="time" value={birthTime} disabled={unknownTime} onChange={(event) => setBirthTime(event.target.value)} /></label>
      <label className="check-card"><input type="checkbox" checked={unknownTime} onChange={(event) => setUnknownTime(event.target.checked)} />출생 시간을 몰라요</label>
      {relationship !== "self" && <label className="check-card"><input type="checkbox" checked={hasAuthority} onChange={(event) => setHasAuthority(event.target.checked)} />이 정보를 저장할 권한이나 상대방의 동의를 확인했어요</label>}
      <p className="privacy-note">체험용 관계 요약을 표시하는 목적으로만 사용합니다. 목록에서는 생년월일을 마스킹하며 정보는 이 브라우저에만 저장됩니다.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit">{existing ? "변경 내용 저장" : "인물 저장"}</button>
      <Link className="text-button inline-action" href="/people">취소</Link>
    </form>
  );
}

export function CompatibilityHomeScreen() {
  const hydrated = useHydrated();
  const peopleRaw = useSyncExternalStore(peopleStore.subscribe, peopleStore.rawSnapshot, () => null);
  const resultRaw = useSyncExternalStore(compatibilityStore.subscribe, compatibilityStore.rawSnapshot, () => null);
  const router = useRouter();
  const [personAId, setPersonAId] = useState("person-self");
  const [personBId, setPersonBId] = useState("person-partner");
  const [relationshipType, setRelationshipType] = useState<CompatibilityRelationshipType>("dating");
  const [error, setError] = useState("");
  if (!hydrated) return <LoadingState title="관계 분석 정보를 확인하고 있어요" />;
  void peopleRaw;
  void resultRaw;
  const peopleData = getPeopleData();
  const compatibilityData = getCompatibilityData();
  if (!peopleData) return <CorruptState title="사람 데이터를 읽을 수 없어요" description="손상된 인물 정보를 확인 없이 체험용 예시로 바꾸지 않습니다." unavailable={peopleStore.inspect().status === "unavailable"} onReset={peopleStore.remove} />;
  if (!compatibilityData) return <CorruptState title="궁합 데이터를 읽을 수 없어요" description="손상된 궁합 기록을 확인 없이 초기화하지 않습니다." unavailable={compatibilityStore.inspect().status === "unavailable"} onReset={compatibilityStore.remove} />;
  const activePeopleData: PeopleData = peopleData;
  const activeCompatibilityData: CompatibilityData = compatibilityData;

  function generateFixture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activePeopleData.people.length < 2) return setError("관계를 살펴보려면 두 사람 이상 저장해 주세요.");
    if (!personAId || !personBId || personAId === personBId) return setError("서로 다른 두 사람을 선택해 주세요.");
    const first = activePeopleData.people.find((person) => person.id === personAId);
    const second = activePeopleData.people.find((person) => person.id === personBId);
    if (!first || !second) return setError("선택한 인물 정보를 찾을 수 없어요.");
    const now = new Date().toISOString();
    const result: CompatibilityResult = {
      id: `compat-${now.replace(/\D/g, "")}`,
      personAId,
      personBId,
      personA: { name: first.name, relationship: first.relationship, birthYear: first.birth.birthDate.slice(0, 4), unknownTime: first.birth.unknownTime },
      personB: { name: second.name, relationship: second.relationship, birthYear: second.birth.birthDate.slice(0, 4), unknownTime: second.birth.unknownTime },
      relationshipType,
      createdAt: now,
      summary: "서로 다른 속도를 존중하고 기대하는 방식을 말로 확인하는 것이 중요한 관계로 보여요.",
      dimensions: [...COMPATIBILITY_DIMENSIONS],
      fixtureVersion: 1,
      fixture: true,
    };
    const nextCompatibility = { version: 1 as const, results: [result, ...activeCompatibilityData.results] };
    const nextLibrary = buildLibraryWithCompatibility(result, `${first.name} · ${second.name}`);
    if (!nextLibrary) return setError("보관함 데이터를 확인한 뒤 다시 시도해 주세요.");
    const transaction = runStorageTransaction([
      createTransactionStep(compatibilityStore, nextCompatibility),
      createTransactionStep(libraryStore, nextLibrary),
    ]);
    if (transaction !== "committed") return setError(transaction === "rolled-back" ? "궁합 결과 저장에 실패해 모든 변경을 취소했어요." : "저장 복구가 필요해 설정에서 기기 저장 정보를 확인해 주세요.");
    router.push(`/compatibility/result/${result.id}`);
  }

  return (
    <main className="screen-content compatibility-content" aria-labelledby="compatibility-title">
      <p className="section-kicker">두 사람의 관계</p>
      <h1 id="compatibility-title">두 사람을 선택해<br />관계를 살펴보세요</h1>
      <p className="supporting">실제 궁합 계산이 아닌 미리 준비한 여러 관점의 예시 결과를 보여줍니다.</p>
      <Link className="secondary-button" href="/people">사람 보관함 관리</Link>
      {peopleData.people.length < 2 ? <EmptyState title="두 사람 이상 필요해요" description="사람 보관함에 관계를 살펴볼 인물을 추가하세요." action={{ href: "/people/new", label: "인물 추가" }} /> : <form className="compatibility-form" onSubmit={generateFixture}><label>첫 번째 사람<select value={personAId} onChange={(event) => setPersonAId(event.target.value)}>{peopleData.people.map((person) => <option key={person.id} value={person.id}>{person.name} · {RELATIONSHIP_LABELS[person.relationship]}</option>)}</select></label><label>두 번째 사람<select value={personBId} onChange={(event) => setPersonBId(event.target.value)}>{peopleData.people.map((person) => <option key={person.id} value={person.id}>{person.name} · {RELATIONSHIP_LABELS[person.relationship]}</option>)}</select></label><label>관계 유형<select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as CompatibilityRelationshipType)}>{Object.entries(COMPATIBILITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit">예시 관계 요약 보기</button></form>}
      <section className="compatibility-history"><h2>저장한 결과</h2>{compatibilityData.results.length === 0 ? <p>아직 저장된 관계 결과가 없어요.</p> : compatibilityData.results.map((result) => <Link key={result.id} href={`/compatibility/result/${result.id}`}><small>{COMPATIBILITY_LABELS[result.relationshipType]}</small><strong>{result.summary}</strong><span>{result.createdAt.slice(0, 10)}</span></Link>)}</section>
    </main>
  );
}

export function CompatibilityResultScreen({ resultId }: { resultId: string }) {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(compatibilityStore.subscribe, compatibilityStore.rawSnapshot, () => null);
  if (!hydrated) return <LoadingState title="저장한 관계 결과를 확인하고 있어요" />;
  void raw;
  const compatibility = getCompatibilityData();
  if (!compatibility) return <CorruptState title="궁합 데이터를 읽을 수 없어요" description="손상된 궁합 기록을 확인 없이 초기화하지 않습니다." unavailable={compatibilityStore.inspect().status === "unavailable"} onReset={compatibilityStore.remove} />;
  const result = compatibility.results.find((candidate) => candidate.id === resultId);
  if (!result) return <EmptyState title="관계 결과를 찾을 수 없어요" description="이 기기에서 삭제됐거나 다른 브라우저에 저장된 결과일 수 있어요." action={{ href: "/compatibility", label: "궁합 화면으로" }} />;
  const unknownTime = result.personA.unknownTime || result.personB.unknownTime;

  return (
    <main className="screen-content compatibility-result" aria-labelledby="compatibility-result-title">
      <p className="section-kicker">{COMPATIBILITY_LABELS[result.relationshipType]} · 관계 요약</p>
      <h1 id="compatibility-result-title">{result.personA.name}님과<br />{result.personB.name}님의 관계</h1>
      <p className="lead">{result.summary}</p>
      {unknownTime && <p className="accuracy-note">출생 시간 미상 상태만 화면에 표시하며 미리 준비한 예시 결과는 달라지지 않습니다.</p>}
      <div className="compatibility-dimensions">{result.dimensions.map((dimension, index) => <article key={dimension.id}><small>{String(index + 1).padStart(2, "0")}</small><div><h2>{dimension.title}</h2><p>{dimension.summary}</p></div></article>)}</div>
      <article className="locked-report-section compatibility-locked"><p className="section-kicker">잠긴 심층 영역</p><h2>장기 흐름과 구체적인 시기</h2><p>실제 계산 엔진과 결제가 연결되지 않아 열 수 없습니다.</p><button type="button" disabled>심층 궁합 · 이용 불가</button></article>
      <details><summary>결과 근거와 한계</summary><p>이 결과는 화면 체험용으로 미리 준비한 예시이며 실제 사주 원국이나 두 사람의 궁합을 계산하지 않았습니다.</p></details>
      <Link className="secondary-button" href="/compatibility">다른 두 사람 선택</Link>
    </main>
  );
}
