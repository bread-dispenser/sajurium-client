"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import type {
  BirthInfo,
  CompatibilityData,
  CompatibilityRelationshipType,
  CompatibilityResult,
  LibraryData,
  PeopleData,
  PersonProfile,
  PersonRelationship,
} from "@/lib/domain";
import type { CalendarKind, CalculationGender, OwnerRelationship, ProfileType, TopicId } from "@/lib/contracts";
import { hasValidLeapMonthSemantics, maskBirthDate, maskBirthTime, maskBirthplace, withAllowedLibraryActions } from "@/lib/contracts";
import { INITIAL_BIRTH, INITIAL_LIBRARY_ITEMS, INITIAL_PEOPLE_DATA } from "@/lib/fixtures";
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

const COMPATIBILITY_DIMENSIONS = [
  { id: "emotional-expression", title: "감정 표현", summary: "감정을 드러내는 속도와 방식의 차이를 확인해요." },
  { id: "communication-style", title: "대화 방식", summary: "결론에 도달하는 속도가 달라 확인 질문이 중요해요." },
  { id: "intimacy", title: "친밀감", summary: "함께하는 시간과 각자의 공간에 대한 기대를 살펴봐요." },
  { id: "lifestyle-rhythm", title: "생활 리듬", summary: "쉬는 시간과 활동하는 시간의 기준을 맞춰보세요." },
  { id: "conflict-style", title: "갈등 방식", summary: "감정이 커지기 전에 사실과 기대를 나누는 편이 좋아요." },
  { id: "values-goals", title: "가치관과 목표", summary: "중요한 선택에서 서로 포기할 수 없는 조건을 확인해요." },
  { id: "long-term", title: "장기 관계", summary: "관계를 이어가기 위해 필요한 약속과 역할을 살펴봐요." },
  { id: "mutual-influence", title: "서로에게 주는 영향", summary: "서로의 선택과 일상에 주는 긍정적인 자극을 확인해요." },
] as const;

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

function buildLibraryWithCompatibility(result: CompatibilityResult, names: string): LibraryData | null {
  const inspection = libraryStore.inspect();
  if (inspection.status === "corrupt" || inspection.status === "unavailable") return null;
  const current = inspection.status === "ok" ? inspection.value.items : [...INITIAL_LIBRARY_ITEMS];
  return {
    version: 1,
    items: [
      withAllowedLibraryActions({
        id: `library-${result.id}`,
        type: "compatibility",
        title: `${names} 관계 요약`,
        subtitle: `${COMPATIBILITY_LABELS[result.relationshipType]} 예시 분석`,
        createdAt: result.createdAt,
        href: `/compatibility/result/${result.id}`,
        access: "available",
        purchased: false,
        read: false,
        hidden: false,
        profile: { id: result.personA.profileId, displayName: result.personA.displayName },
        topic: "relationships",
      }),
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
    .filter((person) => `${person.profile.displayName} ${RELATIONSHIP_LABELS[person.profile.ownerRelationship]}`.includes(query.trim()))
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
              <div><small>{RELATIONSHIP_LABELS[person.profile.ownerRelationship]}</small><h2>{person.profile.displayName}</h2><p>{maskBirthDate(person.profile.birthDate)} · {maskBirthTime(person.profile.birthTime, person.profile.birthTimeUnknown)} · {maskBirthplace(person.profile.birthplace)}</p></div>
              <div className="people-item-actions">
                <Link href={`/people/${person.id}/edit`}>수정</Link>
                {pendingDeleteId === person.id ? (
                  <div className="danger-confirm person-delete-confirm">
                    <p>{person.profile.displayName}님의 저장 정보를 삭제할까요?</p>
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
  const [profile, setProfile] = useState<BirthInfo>(existing?.profile ?? {
    ...INITIAL_BIRTH,
    displayName: "",
    profileType: "other",
    ownerRelationship: "partner",
    thirdPartyConsent: false,
  });
  const [error, setError] = useState("");

  function updateProfile(update: Partial<BirthInfo>) {
    setProfile((current) => ({ ...current, ...update }));
    setError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile.displayName.trim()) return setError("이름 또는 별칭을 입력해 주세요.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate)) return setError("올바른 생년월일을 입력해 주세요.");
    if (!hasValidLeapMonthSemantics(profile)) return setError("양력 날짜에는 윤달을 선택할 수 없어요.");
    if (!profile.birthTimeUnknown && !profile.birthTime) return setError("출생 시간을 입력하거나 시간 미상을 선택해 주세요.");
    if (!profile.birthplace.trim()) return setError("출생지를 입력해 주세요.");
    if (!profile.timezone.trim()) return setError("시간대를 입력해 주세요.");
    if (!existing && data.people.length >= data.freeLimit) return setError("체험용 무료 저장 한도에 도달했어요.");
    if (profile.profileType === "other" && !profile.thirdPartyConsent) return setError("상대방의 정보를 저장할 권한이나 동의를 확인해 주세요.");
    if (profile.profileType === "self" && profile.ownerRelationship !== "self") return setError("본인 프로필의 관계는 본인이어야 해요.");
    if (profile.profileType === "other" && profile.ownerRelationship === "self") return setError("다른 사람과의 관계를 선택해 주세요.");
    const now = new Date().toISOString();
    const person: PersonProfile = {
      id: existing?.id ?? `person-${now.replace(/\D/g, "")}`,
      profile: {
        ...profile,
        displayName: profile.displayName.trim(),
        birthplace: profile.birthplace.trim(),
        timezone: profile.timezone.trim(),
        birthTime: profile.birthTimeUnknown ? null : profile.birthTime,
        personalization: {
          ...profile.personalization,
          relationshipStatus: profile.personalization.relationshipStatus?.trim() || null,
          occupationStatus: profile.personalization.occupationStatus?.trim() || null,
          primaryConcern: profile.personalization.primaryConcern?.trim() || null,
        },
      },
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
      <label>이름 또는 별칭<input value={profile.displayName} onChange={(event) => updateProfile({ displayName: event.target.value })} /></label>
      <label>프로필 유형<select value={profile.profileType} onChange={(event) => updateProfile({ profileType: event.target.value as ProfileType })}><option value="self">본인</option><option value="other">다른 사람</option></select></label>
      <label>관계<select value={profile.ownerRelationship} onChange={(event) => updateProfile({ ownerRelationship: event.target.value as OwnerRelationship })}>{Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <fieldset><legend>달력 기준</legend><div className="segmented-control">{(["solar", "lunar"] as CalendarKind[]).map((calendar) => <button type="button" key={calendar} className={profile.calendar === calendar ? "selected" : ""} aria-pressed={profile.calendar === calendar} onClick={() => updateProfile({ calendar, leapMonth: calendar === "lunar" ? profile.leapMonth : false })}>{calendar === "solar" ? "양력" : "음력"}</button>)}</div></fieldset>
      {profile.calendar === "lunar" && <label className="check-card"><input type="checkbox" checked={profile.leapMonth} onChange={(event) => updateProfile({ leapMonth: event.target.checked })} />윤달</label>}
      <label>생년월일<input type="date" value={profile.birthDate} onChange={(event) => updateProfile({ birthDate: event.target.value })} /></label>
      <label>출생 시간<input type="time" value={profile.birthTime ?? ""} disabled={profile.birthTimeUnknown} onChange={(event) => updateProfile({ birthTime: event.target.value || null })} /></label>
      <label className="check-card"><input type="checkbox" checked={profile.birthTimeUnknown} onChange={(event) => updateProfile({ birthTimeUnknown: event.target.checked, birthTime: event.target.checked ? null : profile.birthTime })} />출생 시간을 몰라요</label>
      <label>출생지<input value={profile.birthplace} onChange={(event) => updateProfile({ birthplace: event.target.value })} /></label>
      <label>시간대<input value={profile.timezone} onChange={(event) => updateProfile({ timezone: event.target.value })} placeholder="Asia/Seoul" /></label>
      <label>계산 성별<select value={profile.calculationGender} onChange={(event) => updateProfile({ calculationGender: event.target.value as CalculationGender })}><option value="female">여성</option><option value="male">남성</option></select></label>
      <fieldset><legend>관심 주제 (선택)</legend>{(["love", "career", "money", "family"] as TopicId[]).map((topic) => <label className="check-card" key={topic}><input type="checkbox" checked={profile.personalization.interests.includes(topic)} onChange={(event) => updateProfile({ personalization: { ...profile.personalization, interests: event.target.checked ? [...profile.personalization.interests, topic] : profile.personalization.interests.filter((item) => item !== topic) } })} />{{ love: "연애", career: "커리어", money: "재물", family: "가족" }[topic as "love" | "career" | "money" | "family"]}</label>)}</fieldset>
      <label>관계 상태 (선택)<input value={profile.personalization.relationshipStatus ?? ""} onChange={(event) => updateProfile({ personalization: { ...profile.personalization, relationshipStatus: event.target.value || null } })} /></label>
      <label>직업 상태 (선택)<input value={profile.personalization.occupationStatus ?? ""} onChange={(event) => updateProfile({ personalization: { ...profile.personalization, occupationStatus: event.target.value || null } })} /></label>
      <label>주요 고민 (선택)<textarea value={profile.personalization.primaryConcern ?? ""} onChange={(event) => updateProfile({ personalization: { ...profile.personalization, primaryConcern: event.target.value || null } })} /></label>
      {profile.profileType === "other" && <label className="check-card"><input type="checkbox" checked={profile.thirdPartyConsent} onChange={(event) => updateProfile({ thirdPartyConsent: event.target.checked })} />이 정보를 저장할 권한이나 상대방의 동의를 확인했어요</label>}
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
  const [personAId, setPersonAId] = useState(INITIAL_PEOPLE_DATA.people[0]?.id ?? "");
  const [personBId, setPersonBId] = useState(INITIAL_PEOPLE_DATA.people[1]?.id ?? "");
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
    const resultId = `compat-${crypto.randomUUID()}`;
    const personAChartSnapshotId = `chart-${crypto.randomUUID()}`;
    const personBChartSnapshotId = `chart-${crypto.randomUUID()}`;
    const result: CompatibilityResult = {
      id: resultId,
      personA: { profileId: first.id, displayName: first.profile.displayName, maskedBirthYear: `${first.profile.birthDate.slice(0, 2)}**`, birthTimeUnknown: first.profile.birthTimeUnknown, chartSnapshotId: personAChartSnapshotId },
      personB: { profileId: second.id, displayName: second.profile.displayName, maskedBirthYear: `${second.profile.birthDate.slice(0, 2)}**`, birthTimeUnknown: second.profile.birthTimeUnknown, chartSnapshotId: personBChartSnapshotId },
      relationshipType,
      createdAt: now,
      summary: "서로 다른 속도를 존중하고 기대하는 방식을 말로 확인하는 것이 중요한 관계로 보여요.",
      strengths: ["상대의 다른 관점을 통해 선택의 폭을 넓힐 수 있어요.", "서로의 생활 리듬을 존중하면 안정적인 관계를 만들 수 있어요."],
      cautions: ["기대를 말하지 않고 짐작하면 작은 속도 차이가 갈등으로 이어질 수 있어요."],
      provenance: {
        chartSnapshotId: `chart-${crypto.randomUUID()}`,
        interpretationVersion: "compatibility-fixture-1",
        modelVersion: null,
        promptVersion: null,
        templateVersion: "compatibility-free-1",
        generatedAt: now,
      },
      dimensions: COMPATIBILITY_DIMENSIONS.map((dimension) => ({ ...dimension })),
      fixtureVersion: 1,
      fixture: true,
    };
    const nextCompatibility = { version: 1 as const, results: [result, ...activeCompatibilityData.results] };
    const nextLibrary = buildLibraryWithCompatibility(result, `${first.profile.displayName} · ${second.profile.displayName}`);
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
      {peopleData.people.length < 2 ? <EmptyState title="두 사람 이상 필요해요" description="사람 보관함에 관계를 살펴볼 인물을 추가하세요." action={{ href: "/people/new", label: "인물 추가" }} /> : <form className="compatibility-form" onSubmit={generateFixture}><label>첫 번째 사람<select value={personAId} onChange={(event) => setPersonAId(event.target.value)}>{peopleData.people.map((person) => <option key={person.id} value={person.id}>{person.profile.displayName} · {RELATIONSHIP_LABELS[person.profile.ownerRelationship]}</option>)}</select></label><label>두 번째 사람<select value={personBId} onChange={(event) => setPersonBId(event.target.value)}>{peopleData.people.map((person) => <option key={person.id} value={person.id}>{person.profile.displayName} · {RELATIONSHIP_LABELS[person.profile.ownerRelationship]}</option>)}</select></label><label>관계 유형<select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as CompatibilityRelationshipType)}>{Object.entries(COMPATIBILITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit">예시 관계 요약 보기</button></form>}
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
  const unknownTime = result.personA.birthTimeUnknown || result.personB.birthTimeUnknown;

  return (
    <main className="screen-content compatibility-result" aria-labelledby="compatibility-result-title">
      <p className="section-kicker">{COMPATIBILITY_LABELS[result.relationshipType]} · 관계 요약</p>
      <h1 id="compatibility-result-title">{result.personA.displayName}님과<br />{result.personB.displayName}님의 관계</h1>
      <p className="lead">{result.summary}</p>
      {unknownTime && <p className="accuracy-note">출생 시간 미상 상태만 화면에 표시하며 미리 준비한 예시 결과는 달라지지 않습니다.</p>}
      <section><h2>잘 맞는 부분</h2><ul>{result.strengths.slice(0, 2).map((strength) => <li key={strength}>{strength}</li>)}</ul></section>
      <section><h2>부딪히기 쉬운 부분</h2><ul>{result.cautions.slice(0, 1).map((caution) => <li key={caution}>{caution}</li>)}</ul></section>
      <h2>상세 내용</h2>
      <div className="compatibility-dimensions">{result.dimensions.map((dimension, index) => <article key={dimension.id}><small>{String(index + 1).padStart(2, "0")}</small><div><h2>{dimension.title}</h2><p>{dimension.summary}</p></div></article>)}</div>
      <article className="locked-report-section compatibility-locked"><p className="section-kicker">잠긴 심층 영역</p><h2>장기 흐름과 구체적인 시기</h2><p>실제 계산 엔진과 결제가 연결되지 않아 열 수 없습니다.</p><button type="button" disabled>심층 궁합 · 이용 불가</button></article>
      <details><summary>결과 근거와 한계</summary><p>이 결과는 화면 체험용으로 미리 준비한 예시이며 실제 사주 원국이나 두 사람의 궁합을 계산하지 않았습니다.</p></details>
      <Link className="secondary-button" href="/compatibility">다른 두 사람 선택</Link>
    </main>
  );
}
