"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
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
import { hasValidLeapMonthSemantics, maskBirthDate, maskBirthTime, maskBirthplace, parseBirthDate, withAllowedLibraryActions } from "@/lib/contracts";
import { INITIAL_BIRTH, INITIAL_LIBRARY_ITEMS, INITIAL_PEOPLE_DATA } from "@/lib/fixtures";
import { compatibilityStore, createTransactionStep, libraryStore, peopleStore, runStorageTransaction } from "@/lib/storage";
import { useHydrated } from "@/hooks/use-hydrated";
import { CorruptState, EmptyState, LoadingState } from "./page-state";
import styles from "./saas-core-rollout.module.css";
import { createCompatibility, createProfile, deleteProfile, formatApiRequestError, listProfiles, type ServerProfile } from "@/lib/api/service";

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
  return { ...INITIAL_PEOPLE_DATA, people: [] };
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
    <main className={`screen-content people-content signal-screen signal-people ${styles.scope}`} aria-labelledby="people-title">
      <div className="signal-hero people-hero">
        <p className="section-kicker signal-kicker">사람 보관함</p>
        <h1 id="people-title">관계를 살펴볼 사람을<br />저장하세요</h1>
        <p className="supporting">출생 정보는 목록에서 가려 보여요. 정보는 이 브라우저에만 저장됩니다.</p>
      </div>
      <div className="limit-summary signal-panel signal-limit-summary"><span>저장한 사람</span><strong>{data.people.length} / {data.freeLimit}</strong></div>
      {limitReached ? <p className="limit-notice signal-evidence">무료 저장 한도에 도달했어요. 새 인물을 추가하려면 기존 인물을 삭제하세요.</p> : <Link className="primary-button signal-action signal-primary-action" href="/people/new">새 인물 추가</Link>}
      <div className="people-controls signal-controls"><label className="signal-field">검색<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 관계" /></label><label className="signal-field">정렬<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">최신순</option><option value="oldest">오래된순</option></select></label></div>
      {people.length === 0 ? <EmptyState title="조건에 맞는 인물이 없어요" description="검색어를 바꾸거나 새 인물을 추가하세요." /> : (
        <div className="people-list signal-row-list">
          {people.map((person) => (
            <article key={person.id} className="signal-row signal-person-row">
              <div className="signal-row-copy"><small>{RELATIONSHIP_LABELS[person.profile.ownerRelationship]}</small><h2>{person.profile.displayName}</h2><p>{maskBirthDate(person.profile.birthDate)} · {maskBirthTime(person.profile.birthTime, person.profile.birthTimeUnknown)} · {maskBirthplace(person.profile.birthplace)}</p></div>
              <div className="people-item-actions signal-row-actions">
                <Link className="signal-action" href={`/people/${person.id}/edit`}>수정</Link>
                {pendingDeleteId === person.id ? (
                  <div className="danger-confirm signal-danger person-delete-confirm">
                    <p>{person.profile.displayName}님의 저장 정보를 삭제할까요?</p>
                    <button className="signal-action" type="button" onClick={() => deletePerson(person.id)}>인물 삭제 확정</button>
                    <button className="signal-action" type="button" onClick={() => setPendingDeleteId(null)}>취소</button>
                  </div>
                ) : <button className="signal-action signal-destructive-action" type="button" onClick={() => { setPendingDeleteId(person.id); setMessage(""); }}>삭제</button>}
              </div>
            </article>
          ))}
        </div>
      )}
      {message && <p className="form-error signal-error" role="status">{message}</p>}
      <Link className="secondary-button signal-action" href="/compatibility">두 사람 선택하기</Link>
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
  return <PersonForm key={personId ?? "new"} existing={existing} />;
}

function PersonForm({ existing }: { existing?: PersonProfile }) {
  const router = useRouter();
  const [profile, setProfile] = useState<BirthInfo>(existing?.profile ?? {
    ...INITIAL_BIRTH,
    displayName: "",
    birthDate: "",
    birthTime: null,
    birthTimeUnknown: true,
    birthplace: "",
    profileType: "other",
    ownerRelationship: "partner",
    thirdPartyConsent: false,
  });
  const [error, setError] = useState("");

  function updateProfile(update: Partial<BirthInfo>) {
    setProfile((current) => ({ ...current, ...update }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile.displayName.trim()) return setError("이름 또는 별칭을 입력해 주세요.");
    if (!parseBirthDate(profile.birthDate, new Date(), profile.calendar)) return setError("1900년 이후, 오늘보다 늦지 않은 올바른 생년월일을 입력해 주세요.");
    if (!hasValidLeapMonthSemantics(profile)) return setError("양력 날짜에는 윤달을 선택할 수 없어요.");
    if (!profile.birthTimeUnknown && !profile.birthTime) return setError("출생 시간을 입력하거나 시간 미상을 선택해 주세요.");
    if (!profile.birthplace.trim()) return setError("출생지를 입력해 주세요.");
    if (!profile.timezone.trim()) return setError("시간대를 입력해 주세요.");
    if (profile.profileType === "other" && !profile.thirdPartyConsent) return setError("상대방의 정보를 저장할 권한이나 동의를 확인해 주세요.");
    if (profile.profileType === "self" && profile.ownerRelationship !== "self") return setError("본인 프로필의 관계는 본인이어야 해요.");
    if (profile.profileType === "other" && profile.ownerRelationship === "self") return setError("다른 사람과의 관계를 선택해 주세요.");
    if (existing) return setError("기존 프로필 수정은 서버 전환 중입니다. 사람 보관함에서 삭제 후 다시 등록해 주세요.");
    const normalized: BirthInfo = {
      ...profile,
      displayName: profile.displayName.trim(), birthplace: profile.birthplace.trim(), timezone: profile.timezone.trim(),
      birthTime: profile.birthTimeUnknown ? null : profile.birthTime,
      personalization: { ...profile.personalization, relationshipStatus: profile.personalization.relationshipStatus?.trim() || null, occupationStatus: profile.personalization.occupationStatus?.trim() || null, primaryConcern: profile.personalization.primaryConcern?.trim() || null },
    };
    try {
      await createProfile(normalized);
      router.push("/people");
    } catch (reason) {
      setError(formatApiRequestError(reason, "서버에 인물을 저장하지 못했어요."));
    }
  }

  return (
    <form className={`screen-content person-form signal-screen signal-person-form ${styles.scope}`} onSubmit={submit} aria-labelledby="person-form-title">
      <div className="signal-hero person-form-hero">
        <p className="section-kicker signal-kicker">{existing ? "인물 수정" : "새 인물"}</p>
        <h1 id="person-form-title">이 사람의 출생 정보를<br />입력해 주세요</h1>
        <p className="supporting">관계의 흐름을 살필 때 사용할 정보예요.</p>
      </div>
      <section className="signal-panel signal-form-section" aria-labelledby="person-basic-title">
        <h2 id="person-basic-title">기본 정보</h2>
        <label className="signal-field" htmlFor="person-display-name">이름 또는 별칭<input id="person-display-name" value={profile.displayName} onChange={(event) => updateProfile({ displayName: event.target.value })} /></label>
        <label className="signal-field" htmlFor="person-profile-type">프로필 유형<select id="person-profile-type" value={profile.profileType} onChange={(event) => updateProfile({ profileType: event.target.value as ProfileType })}><option value="self">본인</option><option value="other">다른 사람</option></select></label>
        <label className="signal-field" htmlFor="person-relationship">관계<select id="person-relationship" value={profile.ownerRelationship} onChange={(event) => updateProfile({ ownerRelationship: event.target.value as OwnerRelationship })}>{Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </section>
      <fieldset className="signal-panel signal-form-section">
        <legend>출생 정보</legend>
        <fieldset className="signal-fieldset"><legend>달력 기준</legend><div className="segmented-control signal-choice-row">{(["solar", "lunar"] as CalendarKind[]).map((calendar) => <button type="button" key={calendar} className={profile.calendar === calendar ? "selected signal-selected" : ""} aria-pressed={profile.calendar === calendar} onClick={() => updateProfile({ calendar, leapMonth: calendar === "lunar" ? profile.leapMonth : false })}>{calendar === "solar" ? "양력" : "음력"}</button>)}</div></fieldset>
        {profile.calendar === "lunar" && <label className="check-card signal-check-row"><input type="checkbox" checked={profile.leapMonth} onChange={(event) => updateProfile({ leapMonth: event.target.checked })} />윤달</label>}
        <label className="signal-field" htmlFor="person-birth-date">생년월일<input id="person-birth-date" type={profile.calendar === "lunar" ? "text" : "date"} placeholder={profile.calendar === "lunar" ? "YYYY-MM-DD (음력)" : undefined} value={profile.birthDate} onChange={(event) => updateProfile({ birthDate: event.target.value })} /></label>
        <label className="signal-field" htmlFor="person-birth-time">출생 시간<input id="person-birth-time" type="time" value={profile.birthTime ?? ""} disabled={profile.birthTimeUnknown} onChange={(event) => updateProfile({ birthTime: event.target.value || null })} /></label>
        <label className="check-card signal-check-row"><input type="checkbox" checked={profile.birthTimeUnknown} onChange={(event) => updateProfile({ birthTimeUnknown: event.target.checked, birthTime: event.target.checked ? null : profile.birthTime })} />출생 시간을 몰라요</label>
        <label className="signal-field" htmlFor="person-birthplace">출생지<input id="person-birthplace" value={profile.birthplace} onChange={(event) => updateProfile({ birthplace: event.target.value })} /></label>
        <label className="signal-field" htmlFor="person-timezone">시간대<input id="person-timezone" value={profile.timezone} onChange={(event) => updateProfile({ timezone: event.target.value })} placeholder="Asia/Seoul" /></label>
        <label className="signal-field" htmlFor="person-calculation-gender">계산 성별<select id="person-calculation-gender" value={profile.calculationGender} onChange={(event) => updateProfile({ calculationGender: event.target.value as CalculationGender })}><option value="female">여성</option><option value="male">남성</option></select></label>
      </fieldset>
      <fieldset className="signal-panel signal-form-section">
        <legend>관심 주제 <small>선택</small></legend>
        <div className="signal-choice-list">{(["love", "career", "money", "family"] as TopicId[]).map((topic) => <label className="check-card signal-check-row" key={topic}><input type="checkbox" checked={profile.personalization.interests.includes(topic)} onChange={(event) => updateProfile({ personalization: { ...profile.personalization, interests: event.target.checked ? [...profile.personalization.interests, topic] : profile.personalization.interests.filter((item) => item !== topic) } })} />{{ love: "연애", career: "커리어", money: "재물", family: "가족" }[topic as "love" | "career" | "money" | "family"]}</label>)}</div>
        <label className="signal-field" htmlFor="person-relationship-status">관계 상태 <small>선택</small><input id="person-relationship-status" value={profile.personalization.relationshipStatus ?? ""} onChange={(event) => updateProfile({ personalization: { ...profile.personalization, relationshipStatus: event.target.value || null } })} /></label>
        <label className="signal-field" htmlFor="person-occupation-status">직업 상태 <small>선택</small><input id="person-occupation-status" value={profile.personalization.occupationStatus ?? ""} onChange={(event) => updateProfile({ personalization: { ...profile.personalization, occupationStatus: event.target.value || null } })} /></label>
        <label className="signal-field" htmlFor="person-primary-concern">주요 고민 <small>선택</small><textarea id="person-primary-concern" value={profile.personalization.primaryConcern ?? ""} onChange={(event) => updateProfile({ personalization: { ...profile.personalization, primaryConcern: event.target.value || null } })} /></label>
      </fieldset>
      {profile.profileType === "other" && <label className="check-card signal-check-row"><input type="checkbox" checked={profile.thirdPartyConsent} onChange={(event) => updateProfile({ thirdPartyConsent: event.target.checked })} />이 정보를 저장할 권한이나 상대방의 동의를 확인했어요</label>}
      <p className="privacy-note signal-evidence">체험용 관계 요약에만 사용하며, 목록에서는 생년월일을 가려 보여요. 정보는 이 브라우저에만 저장됩니다.</p>
      {error && <p className="form-error signal-error" role="alert">{error}</p>}
      <button className="primary-button signal-action signal-primary-action" type="submit">{existing ? "변경 내용 저장" : "인물 저장"}</button>
      <Link className="text-button inline-action signal-action" href="/people">취소</Link>
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
  const effectivePersonAId = peopleData.people.some((person) => person.id === personAId)
    ? personAId
    : peopleData.people[0]?.id ?? "";
  const effectivePersonBId = peopleData.people.some((person) => person.id === personBId) && personBId !== effectivePersonAId
    ? personBId
    : peopleData.people.find((person) => person.id !== effectivePersonAId)?.id ?? "";
  const selectedPersonA = peopleData.people.find((person) => person.id === effectivePersonAId);
  const selectedPersonB = peopleData.people.find((person) => person.id === effectivePersonBId);

  function generateFixture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activePeopleData.people.length < 2) return setError("관계를 살펴보려면 두 사람 이상 저장해 주세요.");
    if (!effectivePersonAId || !effectivePersonBId || effectivePersonAId === effectivePersonBId) return setError("서로 다른 두 사람을 선택해 주세요.");
    const first = activePeopleData.people.find((person) => person.id === effectivePersonAId);
    const second = activePeopleData.people.find((person) => person.id === effectivePersonBId);
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
    <main className={`screen-content compatibility-content signal-screen signal-compatibility ${styles.scope}`} aria-labelledby="compatibility-title">
      <div className="signal-hero compatibility-hero">
        <p className="section-kicker signal-kicker">두 사람의 관계</p>
        <h1 id="compatibility-title">두 사람의 시간이<br />만나는 지점</h1>
        <p className="supporting">저장한 사람을 골라 관계의 흐름을 살펴봐요. 결과는 점수가 아닌 관점이에요.</p>
      </div>
      <Link className="secondary-button signal-action" href="/people">사람 보관함 관리</Link>
      {peopleData.people.length < 2 ? <EmptyState title="두 사람 이상 필요해요" description="사람 보관함에 관계를 살펴볼 인물을 추가하세요." action={{ href: "/people/new", label: "인물 추가" }} /> : (
        <>
          {selectedPersonA && selectedPersonB && <section className="signal-panel signal-pair-summary" aria-label="선택한 두 사람">
            <div className="signal-pair-person"><span className="signal-avatar" aria-hidden="true">{selectedPersonA.profile.displayName.slice(0, 1)}</span><strong>{selectedPersonA.profile.displayName}</strong><small>{maskBirthDate(selectedPersonA.profile.birthDate)} · {RELATIONSHIP_LABELS[selectedPersonA.profile.ownerRelationship]}</small></div>
            <span className="signal-pair-mark" aria-hidden="true">×</span>
            <div className="signal-pair-person"><span className="signal-avatar" aria-hidden="true">{selectedPersonB.profile.displayName.slice(0, 1)}</span><strong>{selectedPersonB.profile.displayName}</strong><small>{maskBirthDate(selectedPersonB.profile.birthDate)} · {RELATIONSHIP_LABELS[selectedPersonB.profile.ownerRelationship]}</small></div>
          </section>}
          <form className="compatibility-form signal-panel signal-compatibility-form" onSubmit={generateFixture}>
            <label className="signal-field" htmlFor="compatibility-person-a">첫 번째 사람<select id="compatibility-person-a" value={effectivePersonAId} onChange={(event) => setPersonAId(event.target.value)}>{peopleData.people.map((person) => <option key={person.id} value={person.id}>{person.profile.displayName} · {RELATIONSHIP_LABELS[person.profile.ownerRelationship]}</option>)}</select></label>
            <label className="signal-field" htmlFor="compatibility-person-b">두 번째 사람<select id="compatibility-person-b" value={effectivePersonBId} onChange={(event) => setPersonBId(event.target.value)}>{peopleData.people.map((person) => <option key={person.id} value={person.id}>{person.profile.displayName} · {RELATIONSHIP_LABELS[person.profile.ownerRelationship]}</option>)}</select></label>
            <label className="signal-field" htmlFor="compatibility-type">관계 유형<select id="compatibility-type" value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as CompatibilityRelationshipType)}>{Object.entries(COMPATIBILITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            {error && <p className="form-error signal-error" role="alert">{error}</p>}
            <button className="primary-button signal-action signal-primary-action" type="submit">예시 관계 요약 보기</button>
            <p className="action-note signal-evidence">실제 궁합 계산이 아닌 미리 준비한 여러 관점의 예시 결과를 보여줍니다.</p>
          </form>
        </>
      )}
      <section className="compatibility-history signal-section signal-compatibility-history" aria-labelledby="compatibility-history-title">
        <h2 id="compatibility-history-title">저장한 결과</h2>
        {compatibilityData.results.length === 0 ? <p>아직 저장된 관계 결과가 없어요.</p> : <div className="signal-row-list">{compatibilityData.results.map((result) => <Link className="signal-row signal-compatibility-row" key={result.id} href={`/compatibility/result/${result.id}`}><span className="signal-row-copy"><small>{COMPATIBILITY_LABELS[result.relationshipType]}</small><strong>{result.summary}</strong><span>{result.createdAt.slice(0, 10)}</span></span><span className="signal-row-arrow" aria-hidden="true">›</span></Link>)}</div>}
      </section>
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
    <main className={`screen-content compatibility-result signal-screen signal-compatibility-result ${styles.scope}`} aria-labelledby="compatibility-result-title">
      <div className="signal-hero compatibility-result-hero">
        <p className="section-kicker signal-kicker">{COMPATIBILITY_LABELS[result.relationshipType]} · 관계 요약</p>
        <h1 id="compatibility-result-title">{result.personA.displayName}님과<br />{result.personB.displayName}님의 관계</h1>
        <p className="lead signal-summary">{result.summary}</p>
      </div>
      <section className="signal-panel signal-pair-summary signal-result-pair" aria-label="관계 대상">
        <div className="signal-pair-person"><span className="signal-avatar" aria-hidden="true">{result.personA.displayName.slice(0, 1)}</span><strong>{result.personA.displayName}</strong><small>{result.personA.maskedBirthYear}</small></div>
        <span className="signal-pair-mark" aria-hidden="true">×</span>
        <div className="signal-pair-person"><span className="signal-avatar" aria-hidden="true">{result.personB.displayName.slice(0, 1)}</span><strong>{result.personB.displayName}</strong><small>{result.personB.maskedBirthYear}</small></div>
      </section>
      {unknownTime && <p className="accuracy-note signal-evidence">출생 시간 미상 상태가 포함돼요. 이 결과는 미리 준비한 예시이며 달라지지 않아요.</p>}
      <section className="signal-panel signal-insight signal-strengths" aria-labelledby="compatibility-strengths-title"><h2 id="compatibility-strengths-title">관계의 강점</h2><ul>{result.strengths.slice(0, 2).map((strength) => <li key={strength}>{strength}</li>)}</ul></section>
      <section className="signal-panel signal-insight signal-cautions" aria-labelledby="compatibility-cautions-title"><h2 id="compatibility-cautions-title">조율할 부분</h2><ul>{result.cautions.slice(0, 1).map((caution) => <li key={caution}>{caution}</li>)}</ul></section>
      <section className="signal-section signal-axis-section" aria-labelledby="compatibility-axes-title">
        <div className="signal-section-heading"><p className="section-kicker signal-kicker">무료 요약</p><h2 id="compatibility-axes-title">관계의 축</h2><p className="supporting">점수 대신 서로의 차이와 맞는 지점을 살펴봐요.</p></div>
        <div className="compatibility-dimensions signal-axis-list">{result.dimensions.map((dimension, index) => <article className="signal-axis signal-row" key={dimension.id}><span className="signal-axis-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div className="signal-row-copy"><h3>{dimension.title}</h3><p>{dimension.summary}</p></div><span className="signal-row-arrow" aria-hidden="true">›</span></article>)}</div>
      </section>
      <article className="locked-report-section compatibility-locked signal-panel signal-lock signal-preview signal-paywall">
        <p className="section-kicker signal-kicker">심층 미리보기</p>
        <h2>더 오래 함께하기 위한 관점</h2>
        <p>무료 요약에서 보인 축을 바탕으로 장기 흐름과 갈등 상황의 대화 문장을 살펴볼 수 있어요.</p>
        <ul className="signal-preview-list"><li>장기 관계 흐름</li><li>갈등 유형별 대화 문장</li></ul>
        <div className="signal-action-list">
          <button className="primary-button signal-action signal-paywall-action" type="button" disabled>심층 궁합 · 이용 불가</button>
          <Link className="text-button signal-action" href="/products/compatibility-report#generation-policy">리포트 구성 보기</Link>
        </div>
        <small className="signal-evidence">표시 가격과 주문 상태는 체험용 예시예요.</small>
      </article>
      <details className="signal-evidence"><summary>결과 근거와 한계</summary><p>이 결과는 화면 체험용으로 미리 준비한 예시이며 실제 사주 원국이나 두 사람의 궁합을 계산하지 않았습니다. 점수나 확정된 판단을 대신하지 않아요.</p><dl className="signal-evidence-list"><div><dt>관계 유형</dt><dd>{COMPATIBILITY_LABELS[result.relationshipType]}</dd></div><div><dt>차트 기록</dt><dd>{result.provenance.chartSnapshotId}</dd></div><div><dt>해석 버전</dt><dd>{result.provenance.interpretationVersion}</dd></div></dl></details>
      <Link className="secondary-button signal-action" href="/compatibility">다른 두 사람 선택</Link>
    </main>
  );
}

export function LivePeopleScreen() {
  const [profiles, setProfiles] = useState<ServerProfile[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void listProfiles().then(setProfiles).catch((reason) => setError(formatApiRequestError(reason, "프로필을 불러오지 못했어요."))); }, []);
  if (!profiles && !error) return <LoadingState title="서버 프로필을 불러오고 있어요" />;
  if (error) return <CorruptState title="사람 보관함 서버에 연결할 수 없어요" description={error} unavailable onReset={() => { window.location.reload(); return true; }} />;
  return <main className={`screen-content people-content signal-screen signal-people ${styles.scope}`} aria-labelledby="people-title">
    <div className="signal-hero people-hero"><p className="section-kicker signal-kicker">사람 보관함</p><h1 id="people-title">서버에 저장한 사람</h1><p className="supporting">출생 정보는 권한 있는 세션에서만 저장하고 목록에서는 가려 보여요.</p></div>
    <Link className="primary-button signal-action signal-primary-action" href="/people/new">새 인물 추가</Link>
    {profiles?.length === 0 ? <EmptyState title="저장한 사람이 없어요" description="궁합을 보려면 두 사람의 프로필이 필요해요." action={{ href: "/people/new", label: "인물 추가" }} /> : <div className="people-list signal-row-list">{profiles?.map((person) => <article key={person.id} className="signal-row signal-person-row"><div className="signal-row-copy"><small>{person.isSelf ? "본인" : person.relationship ?? "관계 프로필"}</small><h2>{person.nickname}</h2><p>{person.birthYear}년생 · {person.birthLocation ?? "출생지 비공개"}</p></div><button className="signal-action signal-destructive-action" type="button" onClick={() => { void deleteProfile(person.id).then(() => setProfiles((items) => items?.filter((item) => item.id !== person.id) ?? null)).catch(() => setError("삭제하지 못했어요.")); }}>삭제</button></article>)}</div>}
    <Link className="secondary-button signal-action" href="/compatibility">두 사람 궁합 보기</Link>
  </main>;
}

export function LiveCompatibilityScreen() {
  const [profiles, setProfiles] = useState<ServerProfile[] | null>(null);
  const [left, setLeft] = useState(""); const [right, setRight] = useState(""); const [result, setResult] = useState<{ summary: string; limited: boolean } | null>(null); const [error, setError] = useState("");
  useEffect(() => { void listProfiles().then((items) => { setProfiles(items); setLeft(items[0]?.id ?? ""); setRight(items[1]?.id ?? ""); }).catch((reason) => setError(formatApiRequestError(reason, "프로필을 불러오지 못했어요."))); }, []);
  if (!profiles && !error) return <LoadingState title="궁합 대상을 불러오고 있어요" />;
  return <main className={`screen-content compatibility-content signal-screen signal-compatibility ${styles.scope}`} aria-labelledby="compatibility-title"><div className="signal-hero compatibility-hero"><p className="section-kicker signal-kicker">두 사람의 관계</p><h1 id="compatibility-title">서버 명식으로 궁합 보기</h1><p className="supporting">두 프로필의 최신 계산 스냅샷을 고정해 결과를 만듭니다.</p></div>{profiles && profiles.length < 2 ? <EmptyState title="두 사람 이상 필요해요" description="사람 보관함에서 프로필을 추가하세요." action={{ href: "/people/new", label: "인물 추가" }} /> : <form className="compatibility-form signal-panel signal-compatibility-form" onSubmit={(event) => { event.preventDefault(); if (!left || !right || left === right) return setError("서로 다른 두 사람을 선택해 주세요."); void createCompatibility(left, right, "couple").then((value) => { setResult({ summary: value.summary, limited: value.limitedByUnknownTime }); setError(""); }).catch((reason) => setError(formatApiRequestError(reason, "궁합을 만들지 못했어요."))); }}><label className="signal-field">첫 번째 사람<select value={left} onChange={(event) => setLeft(event.target.value)}>{profiles?.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}</select></label><label className="signal-field">두 번째 사람<select value={right} onChange={(event) => setRight(event.target.value)}>{profiles?.map((item) => <option key={item.id} value={item.id}>{item.nickname}</option>)}</select></label><button className="primary-button signal-action signal-primary-action" type="submit">실제 궁합 계산하기</button></form>}{result && <section className="signal-panel"><h2>관계 요약</h2><p>{result.summary}</p>{result.limited && <p className="accuracy-note">출생 시간 미상으로 시주 기반 범위는 제외했어요.</p>}</section>}{error && <p className="form-error signal-error" role="alert">{error}</p>}</main>;
}
