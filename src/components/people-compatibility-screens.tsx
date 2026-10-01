"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import type { BirthInfo, CompatibilityData, CompatibilityRelationshipType, PeopleData } from "@/lib/domain";
import type { CalculationGender, OwnerRelationship } from "@/lib/contracts";
import { hasValidLeapMonthSemantics, parseBirthDate } from "@/lib/contracts";
import { INITIAL_BIRTH, INITIAL_PEOPLE_DATA } from "@/lib/fixtures";
import { compatibilityStore, peopleStore } from "@/lib/storage";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ChartView } from "@/lib/saju";
import { CorruptState, EmptyState, LoadingState } from "./page-state";
import { InfoIcon, PlusIcon } from "./ui/icons";
import { createCompatibility, createProfile, deleteProfile, formatApiRequestError, getChart, getCompatibility, getCurrentChart, isAccountSessionExpired, listProfiles, type ServerCompatibilityDetail, type ServerProfile } from "@/lib/api/service";
import { ApiRequestError } from "@/lib/api/client";

const PEOPLE_LIMIT = 20;

/** 사람 보관함 관계(서버 relationship_type 값) */
const RELATION_OPTIONS: readonly { id: Exclude<OwnerRelationship, "self">; label: string }[] = [
  { id: "partner", label: "연인" },
  { id: "friend", label: "친구" },
  { id: "family", label: "가족" },
  { id: "coworker", label: "동료" },
];

/** 궁합 관계(서버 relation_type 값) */
const COMPAT_RELATIONS: readonly { id: "couple" | "friend" | "family" | "colleague"; label: string }[] = [
  { id: "couple", label: "연인" },
  { id: "friend", label: "친구" },
  { id: "family", label: "가족" },
  { id: "colleague", label: "동료" },
];

const LOCAL_COMPAT_LABELS: Record<CompatibilityRelationshipType, string> = {
  dating: "연애",
  marriage: "결혼",
  family: "가족",
  friend: "친구",
  business: "동업",
};

function relationLabel(profile: ServerProfile) {
  if (profile.isSelf) return "본인";
  return RELATION_OPTIONS.find((option) => option.id === profile.relationship)?.label ?? "저장한 사람";
}

function profileSub(profile: ServerProfile) {
  return `${profile.birthYear}년생${profile.birthTimeUnknown ? ", 태어난 시간 모름" : ""}`;
}

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

function PersonTile({ profile, chart, size = "row" }: { profile: ServerProfile; chart: ChartView | null; size?: "row" | "pair" }) {
  const day = chart && chart.profileId === profile.id ? chart.pillars.day : null;
  const box = size === "pair" ? { width: 52, height: 64 } : { width: 44, height: 56 };
  if (day) {
    return (
      <span aria-label={`${day.stem.ko}${day.branch.ko} 일주`} lang="zh-Hant" style={{ ...box, display: "flex", flex: "0 0 auto", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 8, background: "var(--sj-ink)", fontSize: size === "pair" ? 22 : 19 }}>
        <span className={`sj-hanja sj-el-dark-${day.stem.element}`}>{day.stem.hanja}</span>
        <span className={`sj-hanja sj-el-dark-${day.branch.element}`}>{day.branch.hanja}</span>
      </span>
    );
  }
  return <span className="sj-initial-tile" aria-hidden="true" style={box}>{profile.nickname.slice(0, 1)}</span>;
}

function useProfilesWithChart() {
  const [profiles, setProfiles] = useState<ServerProfile[] | null>(null);
  const [chart, setChart] = useState<ChartView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    void listProfiles().then((items) => active && setProfiles(items)).catch((reason) => active && setLoadError(reason ?? new Error("load failed")));
    void getCurrentChart().then((value) => active && setChart(value)).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return { profiles, setProfiles, chart, loadError };
}

function LoadFailure({ error, title }: { error: unknown; title: string }) {
  if (isAccountSessionExpired(error)) return <EmptyState title="다시 로그인해 주세요" description="로그인 세션이 만료됐어요. 다시 로그인하면 저장한 사람을 이어볼 수 있어요." action={{ href: "/login", label: "로그인하기" }} />;
  return <CorruptState title={title} description={formatApiRequestError(error, "연결 상태를 확인한 뒤 다시 시도해 주세요.")} unavailable onReset={() => { window.location.reload(); return true; }} />;
}

export function LivePeopleScreen() {
  const { profiles, setProfiles, chart, loadError } = useProfilesWithChart();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!profiles && !loadError) return <LoadingState title="저장한 사람을 불러오고 있어요" />;
  if (loadError || !profiles) return <LoadFailure error={loadError} title="사람 보관함을 불러오지 못했어요" />;
  const others = profiles.filter((profile) => !profile.isSelf).length;
  const limitReached = others >= PEOPLE_LIMIT;
  const sorted = [...profiles].sort((left, right) => Number(right.isSelf) - Number(left.isSelf) || left.createdAt.localeCompare(right.createdAt));

  async function remove(profile: ServerProfile) {
    setError("");
    try {
      await deleteProfile(profile.id);
      setProfiles((items) => items?.filter((item) => item.id !== profile.id) ?? null);
      setPendingDeleteId(null);
      setMessage(`${profile.nickname}님을 보관함에서 삭제했어요.`);
    } catch (reason) {
      setError(formatApiRequestError(reason, "삭제하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
  }

  return (
    <main className="sj-page" aria-labelledby="people-title" style={{ gap: 24 }}>
      <div className="sj-section" style={{ gap: 8 }}>
        <div className="sj-section-head">
          <h1 id="people-title" className="sj-h1">저장한 사람</h1>
          <span className="sj-meta">{others} / {PEOPLE_LIMIT}명</span>
        </div>
        <p className="sj-lead">궁합과 상담에 쓸 사람을 저장해요. 나를 빼고 {PEOPLE_LIMIT}명까지 저장할 수 있어요.</p>
      </div>

      {profiles.length === 0 ? (
        <section className="sj-section" aria-labelledby="people-empty-title">
          <h2 id="people-empty-title" className="sj-h2">저장한 사람이 없어요</h2>
          <p className="sj-body">궁합을 보려면 나와 상대, 두 사람의 출생 정보가 필요해요.</p>
        </section>
      ) : (
        <ul className="sj-list" aria-label="저장한 사람" style={{ borderTop: "1px solid var(--sj-line)" }}>
          {sorted.map((profile) => (
            <li key={profile.id} style={{ borderBottom: "1px solid var(--sj-line)", padding: "14px 0", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <PersonTile profile={profile} chart={chart} />
                <span className="sj-row-main">
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{profile.nickname}</span>
                    <span className="sj-chip" style={{ minHeight: 22, padding: "0 8px" }}>{relationLabel(profile)}</span>
                  </span>
                  <span className="sj-row-sub">{profileSub(profile)}</span>
                </span>
                {pendingDeleteId !== profile.id && (
                  <>
                    <Link className="sj-text-button" href={`/people/${profile.id}/edit`} style={{ padding: "0 4px" }} aria-label={`${profile.nickname} 출생 정보 수정`}>수정</Link>
                    <button className="sj-text-button" type="button" style={{ color: "var(--sj-muted)", padding: "0 4px" }} aria-label={`${profile.nickname} 삭제`} onClick={() => { setPendingDeleteId(profile.id); setMessage(""); setError(""); }}>삭제</button>
                  </>
                )}
              </div>
              {pendingDeleteId === profile.id && (
                <div className="sj-banner" role="group" aria-label={`${profile.nickname} 삭제 확인`} style={{ flexDirection: "column" }}>
                  <p style={{ margin: 0 }}>{profile.nickname}님의 출생 정보를 삭제할까요? 삭제하면 되돌릴 수 없어요.</p>
                  <div className="sj-actions-row">
                    <button className="sj-button-danger" type="button" onClick={() => { void remove(profile); }}>기록 삭제</button>
                    <button className="sj-button-secondary" type="button" onClick={() => setPendingDeleteId(null)}>취소</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="sj-error" role="alert">{error}</p>}
      {message && <p className="sj-meta" role="status">{message}</p>}

      {limitReached ? (
        <p className="sj-banner" role="note">{PEOPLE_LIMIT}명을 모두 저장했어요. 새 사람을 추가하려면 먼저 한 명을 삭제해 주세요.</p>
      ) : (
        <Link className="sj-button-secondary" href="/people/new" style={{ minHeight: 52, borderColor: "var(--sj-ink)", fontWeight: 700 }}><PlusIcon />사람 추가</Link>
      )}
      <Link className="sj-text-button" href="/compatibility" style={{ alignSelf: "center" }}>두 사람 궁합 보기</Link>

      <p className="sj-fine">다른 사람의 생년월일은 목록에서 태어난 해만 보여요. 저장한 사람은 나에게만 보이고, 언제든 삭제할 수 있어요.</p>
    </main>
  );
}

export function PersonFormScreen() {
  const hydrated = useHydrated();
  if (!hydrated) return <LoadingState title="입력 화면을 준비하고 있어요" />;
  const data = getPeopleData();
  if (!data) return <CorruptState title="이 기기의 사람 정보를 읽을 수 없어요" description="손상된 정보를 확인 없이 덮어쓰지 않아요." unavailable={peopleStore.inspect().status === "unavailable"} onReset={peopleStore.remove} />;
  return <PersonForm />;
}

function PersonForm() {
  const router = useRouter();
  const [profile, setProfile] = useState<BirthInfo>({
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
  const [dateParts, setDateParts] = useState({ year: "", month: "", day: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const name = profile.displayName.trim();

  function updateProfile(update: Partial<BirthInfo>) {
    setProfile((current) => ({ ...current, ...update }));
    setError("");
  }

  function updateDate(part: "year" | "month" | "day", raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, part === "year" ? 4 : 2);
    const next = { ...dateParts, [part]: digits };
    setDateParts(next);
    const complete = next.year.length === 4 && next.month && next.day;
    updateProfile({ birthDate: complete ? `${next.year}-${next.month.padStart(2, "0")}-${next.day.padStart(2, "0")}` : "" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile.displayName.trim()) return setError("이름 또는 별칭을 입력해 주세요.");
    if (!parseBirthDate(profile.birthDate, new Date(), profile.calendar)) return setError("1900년 이후, 오늘보다 늦지 않은 올바른 생년월일을 입력해 주세요.");
    if (!hasValidLeapMonthSemantics(profile)) return setError("양력 날짜에는 윤달을 선택할 수 없어요.");
    if (!profile.birthTimeUnknown && !profile.birthTime) return setError("태어난 시각을 입력하거나 시간을 모른다고 선택해 주세요.");
    if (!profile.birthplace.trim()) return setError("출생지를 입력해 주세요.");
    if (!profile.timezone.trim()) return setError("시간대 정보가 없어요. 새로고침한 뒤 다시 시도해 주세요.");
    if (!profile.thirdPartyConsent) return setError("저장하려면 상대방의 동의나 저장 권한을 확인해 주세요.");
    if (profile.ownerRelationship === "self") return setError("나와의 관계를 골라 주세요.");
    const normalized: BirthInfo = {
      ...profile,
      displayName: profile.displayName.trim(), birthplace: profile.birthplace.trim(), timezone: profile.timezone.trim(),
      birthTime: profile.birthTimeUnknown ? null : profile.birthTime,
      personalization: { ...profile.personalization, relationshipStatus: profile.personalization.relationshipStatus?.trim() || null, occupationStatus: profile.personalization.occupationStatus?.trim() || null, primaryConcern: profile.personalization.primaryConcern?.trim() || null },
    };
    setSaving(true);
    try {
      await createProfile(normalized);
      router.push("/people");
    } catch (reason) {
      setError(formatApiRequestError(reason, "저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
      setSaving(false);
    }
  }

  const calendarValue = profile.calendar === "lunar" ? (profile.leapMonth ? "leap" : "lunar") : "solar";

  return (
    <form className="sj-page" onSubmit={submit} aria-labelledby="person-form-title" noValidate>
      <div className="sj-section" style={{ gap: 8 }}>
        <h1 id="person-form-title" className="sj-h1">누구를 저장할까요?</h1>
        <p className="sj-lead" style={{ fontSize: 14 }}>궁합을 보거나 이 사람과의 관계를 상담할 때 써요.</p>
      </div>

      <div className="sj-field">
        <label className="sj-label" htmlFor="person-display-name">이름 또는 별칭</label>
        <input id="person-display-name" className="sj-input" value={profile.displayName} onChange={(event) => updateProfile({ displayName: event.target.value })} autoComplete="off" />
      </div>

      <fieldset className="sj-field">
        <legend className="sj-label" style={{ marginBottom: 8 }}>나와의 관계</legend>
        <div className="sj-chips" style={{ gap: 8 }}>
          {RELATION_OPTIONS.map((option) => (
            <button key={option.id} type="button" className="sj-chip-button" style={{ minHeight: 44, padding: "0 18px", fontSize: 14 }} aria-pressed={profile.ownerRelationship === option.id} onClick={() => updateProfile({ ownerRelationship: option.id })}>{option.label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="sj-field">
        <legend className="sj-label" style={{ marginBottom: 8 }}>생년월일</legend>
        <div className="sj-segmented">
          {([["solar", "양력"], ["lunar", "음력"], ["leap", "음력 윤달"]] as const).map(([value, label]) => (
            <button key={value} type="button" className="sj-segment" aria-pressed={calendarValue === value} onClick={() => updateProfile({ calendar: value === "solar" ? "solar" : "lunar", leapMonth: value === "leap" })}>{label}</button>
          ))}
        </div>
        <div className="sj-date-grid">
          <span className="sj-unit-input">
            <input className="sj-unit-input-field" aria-label="태어난 해" inputMode="numeric" value={dateParts.year} onChange={(event) => updateDate("year", event.target.value)} placeholder="1991" />
            <span className="sj-unit" aria-hidden="true">년</span>
          </span>
          <span className="sj-unit-input">
            <input className="sj-unit-input-field" aria-label="태어난 달" inputMode="numeric" value={dateParts.month} onChange={(event) => updateDate("month", event.target.value)} />
            <span className="sj-unit" aria-hidden="true">월</span>
          </span>
          <span className="sj-unit-input">
            <input className="sj-unit-input-field" aria-label="태어난 날" inputMode="numeric" value={dateParts.day} onChange={(event) => updateDate("day", event.target.value)} />
            <span className="sj-unit" aria-hidden="true">일</span>
          </span>
        </div>
      </fieldset>

      <fieldset className="sj-field">
        <legend className="sj-label" style={{ marginBottom: 8 }}>태어난 시간</legend>
        <label className="sj-visually-hidden" htmlFor="person-birth-time">태어난 시각</label>
        <input id="person-birth-time" className="sj-input" type="time" value={profile.birthTime ?? ""} disabled={profile.birthTimeUnknown} onChange={(event) => updateProfile({ birthTime: event.target.value || null })} style={profile.birthTimeUnknown ? { background: "var(--sj-sunk)", borderColor: "var(--sj-sunk)", color: "var(--sj-muted)" } : undefined} />
        <label className="sj-check">
          <input className="sj-check-input" type="checkbox" checked={profile.birthTimeUnknown} onChange={(event) => updateProfile({ birthTimeUnknown: event.target.checked, birthTime: event.target.checked ? null : profile.birthTime })} />
          시간을 몰라요. 시주를 빼고 여섯 글자로 계산할게요.
        </label>
      </fieldset>

      <fieldset className="sj-field">
        <legend className="sj-label" style={{ marginBottom: 8 }}>계산 기준 성별</legend>
        <div className="sj-segmented">
          {([["female", "여성"], ["male", "남성"]] as const).map(([value, label]) => (
            <button key={value} type="button" className="sj-segment" aria-pressed={profile.calculationGender === value} onClick={() => updateProfile({ calculationGender: value as CalculationGender })}>{label}</button>
          ))}
        </div>
        <p className="sj-help">대운이 흐르는 방향을 정할 때만 쓰여요.</p>
      </fieldset>

      <div className="sj-field">
        <label className="sj-label" htmlFor="person-birthplace">출생지</label>
        <input id="person-birthplace" className="sj-input" value={profile.birthplace} onChange={(event) => updateProfile({ birthplace: event.target.value })} placeholder="예: 부산" />
      </div>

      <section className="sj-card" aria-labelledby="person-consent-title" style={{ padding: 18 }}>
        <h2 id="person-consent-title" className="sj-h3">다른 사람의 정보를 저장하기 전에</h2>
        <p className="sj-body" style={{ fontSize: 13 }}>생년월일은 그 사람의 개인정보예요. {name ? `${name}님에게` : "상대에게"} 알리고 동의를 받았을 때만 저장해 주세요. 저장한 정보는 궁합과 상담에만 쓰고, 공유 링크에는 보이지 않아요.</p>
        <label className="sj-check" style={{ borderTop: "1px solid var(--sj-track)", paddingTop: 14, color: "var(--sj-ink)" }}>
          <input className="sj-check-input" type="checkbox" checked={profile.thirdPartyConsent} onChange={(event) => updateProfile({ thirdPartyConsent: event.target.checked })} required />
          <span>{name ? `${name}님의` : "상대의"} 동의를 받았거나 이 정보를 저장할 권한이 있어요 <span style={{ color: "var(--sj-accent)", fontWeight: 700 }}>(필수)</span></span>
        </label>
      </section>

      <div className="sj-sticky-cta">
        {error && <p className="sj-error" role="alert">{error}</p>}
        <button className="sj-button sj-button-block" type="submit" disabled={saving}>사람 저장하기</button>
        <p className="sj-fine sj-center">저장한 뒤에도 사람 보관함에서 언제든 삭제할 수 있어요</p>
      </div>
    </form>
  );
}

function DeepReportCard({ sections = [] }: { sections?: string[] }) {
  return (
    <section className="sj-card" aria-labelledby="compat-deep-title">
      <div style={{ display: "flex", gap: 14 }}>
        <span className="sj-ganji-tile" aria-hidden="true" lang="zh-Hant" style={{ width: 48, height: 60, fontSize: 24 }}>合</span>
        <div className="sj-row-main" style={{ gap: 4 }}>
          <h2 id="compat-deep-title" className="sj-h2">궁합 심층 리포트</h2>
          <p className="sj-meta" style={{ color: "var(--sj-ink-strong-muted)" }}>관계 유형에 맞춘 분석과 두 사람의 소통 방식을 더 깊게 살펴봐요.</p>
        </div>
      </div>
      {sections.length > 0 && (
        <div className="sj-section" style={{ gap: 6 }}>
          <p className="sj-meta">결제하면 열리는 내용</p>
          <ul className="sj-chips" style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {sections.map((title) => <li key={title} className="sj-chip">{title}</li>)}
          </ul>
        </div>
      )}
      <button className="sj-button" type="button" disabled style={{ minHeight: 48, fontSize: 15 }}>결제 준비 중</button>
      <Link className="sj-text-button" href="/products/compatibility-report" style={{ alignSelf: "center" }}>리포트 구성 보기</Link>
    </section>
  );
}

function UnknownTimeNote({ subject }: { subject: string }) {
  return (
    <div className="sj-banner" role="note">
      <InfoIcon className="sj-banner-icon" />
      <p style={{ margin: 0 }}>{subject} 태어난 시간을 몰라서 시주를 빼고 여섯 글자로 비교했어요. 시주에 기대는 해석은 이 결과에 넣지 않았어요.</p>
    </div>
  );
}

export function LiveCompatibilityScreen() {
  const { profiles, chart, loadError } = useProfilesWithChart();
  const [partnerId, setPartnerId] = useState("");
  const [relation, setRelation] = useState<(typeof COMPAT_RELATIONS)[number]["id"]>("couple");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!profiles && !loadError) return <LoadingState title="궁합 볼 사람을 불러오고 있어요" />;
  if (loadError || !profiles) return <LoadFailure error={loadError} title="저장한 사람을 불러오지 못했어요" />;

  const me = profiles.find((profile) => profile.isSelf) ?? profiles[0];
  const candidates = profiles.filter((profile) => profile.id !== me?.id);
  const partner = candidates.find((profile) => profile.id === partnerId) ?? candidates[0];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me || !partner || me.id === partner.id) return setError("서로 다른 두 사람을 골라 주세요.");
    setPending(true);
    setError("");
    try {
      const value = await createCompatibility(me.id, partner.id, relation);
      router.push(`/compatibility/result/${value.id}`);
    } catch (reason) {
      setError(formatApiRequestError(reason, "궁합을 만들지 못했어요. 잠시 후 다시 시도해 주세요."));
      setPending(false);
    }
  }

  return (
    <main className="sj-split" aria-labelledby="compatibility-title">
      <div className="sj-page">
        <section className="sj-section" style={{ gap: 8 }}>
          <h1 id="compatibility-title" className="sj-h1">두 사람의 명식이<br />만나는 자리를 살펴봐요</h1>
          <p className="sj-lead">두 사람의 지금 명식을 계산해 나란히 놓고, 관계를 한 문장으로 정리해요. 점수로 좋고 나쁨을 가리지 않아요.</p>
          <Link className="sj-text-button" href="/people" style={{ alignSelf: "flex-start" }}>사람 보관함</Link>
        </section>

        {!me || candidates.length === 0 ? (
          <section className="sj-section" aria-labelledby="compat-empty-title">
            <h2 id="compat-empty-title" className="sj-h2">두 사람 이상 필요해요</h2>
            <p className="sj-body">나와 함께 볼 사람을 사람 보관함에 먼저 저장해 주세요.</p>
            <Link className="sj-button sj-button-block" href="/people/new">사람 추가</Link>
          </section>
        ) : (
          <form className="sj-page" onSubmit={submit} aria-label="궁합 보기" style={{ gap: 28 }}>
            {partner && (
              <section className="sj-card" aria-label="선택한 두 사람" style={{ display: "grid", gridTemplateColumns: "1fr 36px 1fr", alignItems: "center", padding: 16 }}>
                {[me, partner].map((person, index) => (
                  <div key={person.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, gridColumn: index === 0 ? 1 : 3 }}>
                    <PersonTile profile={person} chart={chart} size="pair" />
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{person.nickname}</span>
                      <span className="sj-fine">{index === 0 ? "나" : `${relationLabel(person)}${person.birthTimeUnknown ? ", 시간 모름" : ""}`}</span>
                    </span>
                  </div>
                ))}
                <span aria-hidden="true" style={{ gridColumn: 2, gridRow: 1, textAlign: "center", color: "var(--sj-faint)", fontSize: 18 }}>+</span>
              </section>
            )}

            <fieldset className="sj-field" style={{ gap: 0 }}>
              <legend className="sj-label" style={{ marginBottom: 4 }}>나와 함께 볼 사람</legend>
              <div style={{ borderTop: "1px solid var(--sj-line)" }}>
                {candidates.map((person) => (
                  <label key={person.id} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 60, padding: "8px 0", borderBottom: "1px solid var(--sj-line)", cursor: "pointer" }}>
                    <input className="sj-check-input" type="radio" name="compat-partner" value={person.id} checked={partner?.id === person.id} onChange={() => setPartnerId(person.id)} style={{ margin: 0 }} />
                    <span className="sj-row-main">
                      <span className="sj-row-title">{person.nickname}</span>
                      <span className="sj-row-sub">{relationLabel(person)}, {profileSub(person)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="sj-field">
              <legend className="sj-label" style={{ marginBottom: 8 }}>어떤 관계로 볼까요</legend>
              <div className="sj-segmented">
                {COMPAT_RELATIONS.map((item) => (
                  <button key={item.id} type="button" className="sj-segment" aria-pressed={relation === item.id} onClick={() => setRelation(item.id)}>{item.label}</button>
                ))}
              </div>
              {partner?.birthTimeUnknown && <p className="sj-help">{partner.nickname}님은 태어난 시간을 몰라서 시주를 뺀 범위로 살펴봐요.</p>}
            </fieldset>

            {error && <p className="sj-error" role="alert">{error}</p>}
            <button className="sj-button sj-button-block" type="submit" disabled={pending}>궁합 보기</button>
            {pending && <p className="sj-meta" role="status">두 사람의 명식을 계산하고 있어요</p>}
          </form>
        )}
      </div>

      <aside className="sj-aside" aria-label="궁합 안내">
        <p className="sj-fine sj-desktop-only">결과는 두 사람의 명식을 계산해 고정한 뒤 만들어요. 같은 두 사람과 관계로 다시 보면 같은 결과를 보여드려요.</p>
      </aside>
    </main>
  );
}

function DayPillarCard({ name, chart }: { name: string; chart: ChartView | null }) {
  const day = chart?.pillars.day ?? null;
  return (
    <div className="sj-card" style={{ alignItems: "center", gap: 8, padding: 16 }}>
      <span className="sj-meta">{name}님의 일주</span>
      {day ? (
        <span aria-label={`${day.stem.ko}${day.branch.ko}`} lang="zh-Hant" style={{ display: "flex", gap: 2, fontSize: 36 }}>
          <span className={`sj-hanja sj-el-${day.stem.element}`} aria-hidden="true">{day.stem.hanja}</span>
          <span className={`sj-hanja sj-el-${day.branch.element}`} aria-hidden="true">{day.branch.hanja}</span>
        </span>
      ) : <span className="sj-meta">불러오지 못했어요</span>}
      {day && <span className="sj-fine">일간 {day.stem.ko}{day.stem.element}</span>}
    </div>
  );
}

type ServerResultView = { result: ServerCompatibilityDetail; names: [string, string]; charts: [ChartView | null, ChartView | null] };

function ServerCompatibilityResult({ resultId }: { resultId: string }) {
  const [view, setView] = useState<ServerResultView | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await getCompatibility(resultId);
        // 이름과 일주는 곁들이는 정보라, 불러오지 못해도 결과는 보여준다.
        const [profiles, chartA, chartB] = await Promise.all([
          listProfiles().catch(() => [] as ServerProfile[]),
          getChart(result.snapshotAId).catch(() => null),
          getChart(result.snapshotBId).catch(() => null),
        ]);
        const nameOf = (id: string, fallback: string) => profiles.find((profile) => profile.id === id)?.nickname ?? fallback;
        if (active) setView({ result, names: [nameOf(result.profileAId, "첫 번째 사람"), nameOf(result.profileBId, "두 번째 사람")], charts: [chartA, chartB] });
      } catch (reason) {
        if (active) setError(reason ?? new Error("load failed"));
      }
    })();
    return () => { active = false; };
  }, [resultId]);

  if (error) {
    if (isAccountSessionExpired(error)) return <EmptyState title="다시 로그인해 주세요" description="로그인 세션이 만료됐어요. 다시 로그인하면 궁합 결과를 이어볼 수 있어요." action={{ href: "/login", label: "로그인하기" }} />;
    if (error instanceof ApiRequestError && error.status === 404) return <EmptyState title="궁합 결과를 찾을 수 없어요" description="삭제됐거나 다른 계정에서 만든 결과예요. 궁합 화면에서 다시 볼 수 있어요." action={{ href: "/compatibility", label: "궁합 다시 보기" }} />;
    return <EmptyState title="궁합 결과를 불러오지 못했어요" description={formatApiRequestError(error, "연결 상태를 확인한 뒤 다시 시도해 주세요.")} action={{ href: "/compatibility", label: "궁합 화면으로" }} />;
  }
  if (!view) return <LoadingState title="궁합 결과를 불러오고 있어요" />;

  const { result, names, charts } = view;
  const relation = COMPAT_RELATIONS.find((item) => item.id === result.relation)?.label ?? "저장한";
  const unknown = charts.map((chart) => chart !== null && chart.pillars.hour === null);
  const unknownSubject = unknown[0] && unknown[1] ? "두 사람 모두" : unknown[0] ? `${names[0]}님은` : unknown[1] ? `${names[1]}님은` : "두 사람 중 한 명이";

  return (
    <main className="sj-page" aria-labelledby="compatibility-result-title">
      <div className="sj-section" style={{ gap: 6 }}>
        <p className="sj-meta">{relation} 관계로 봤어요</p>
        <h1 id="compatibility-result-title" className="sj-h1" style={{ fontSize: 24 }}>{names[0]}님과 {names[1]}님</h1>
      </div>
      <section className="sj-section" aria-labelledby="compat-summary-title" style={{ gap: 6 }}>
        <h2 id="compat-summary-title" className="sj-h2">관계 요약</h2>
        <p className="sj-lead">{result.summary}</p>
      </section>
      <section className="sj-section" aria-labelledby="compat-daymaster-title">
        <h2 id="compat-daymaster-title" className="sj-h2">두 사람의 일주</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <DayPillarCard name={names[0]} chart={charts[0]} />
          <DayPillarCard name={names[1]} chart={charts[1]} />
        </div>
        {result.limitedByUnknownTime && <UnknownTimeNote subject={unknownSubject} />}
      </section>
      <DeepReportCard sections={result.lockedSections} />
      <Link className="sj-button-secondary" href="/compatibility">다른 사람과 궁합 보기</Link>
      <p className="sj-fine">두 명식의 계산 요소를 바탕으로 한 관점이에요. 관계의 좋고 나쁨을 정하지 않아요.</p>
    </main>
  );
}

/** 서버 결과(숫자 id)는 서버에서 읽고, 예전에 이 기기에 저장한 결과는 그대로 보여준다. */
export function CompatibilityResultScreen({ resultId }: { resultId: string }) {
  if (/^\d+$/.test(resultId)) return <ServerCompatibilityResult resultId={resultId} />;
  return <LocalCompatibilityResult resultId={resultId} />;
}

function LocalCompatibilityResult({ resultId }: { resultId: string }) {
  const hydrated = useHydrated();
  const raw = useSyncExternalStore(compatibilityStore.subscribe, compatibilityStore.rawSnapshot, () => null);
  if (!hydrated) return <LoadingState title="궁합 결과를 불러오고 있어요" />;
  void raw;
  const compatibility = getCompatibilityData();
  if (!compatibility) return <CorruptState title="궁합 결과를 읽을 수 없어요" description="손상된 궁합 기록을 확인 없이 초기화하지 않아요." unavailable={compatibilityStore.inspect().status === "unavailable"} onReset={compatibilityStore.remove} />;
  const result = compatibility.results.find((candidate) => candidate.id === resultId);
  if (!result) return <EmptyState title="궁합 결과를 찾을 수 없어요" description="이 기기에서 삭제됐거나 다른 브라우저에 저장된 결과예요. 궁합 화면에서 다시 볼 수 있어요." action={{ href: "/compatibility", label: "궁합 다시 보기" }} />;
  const unknownTime = result.personA.birthTimeUnknown || result.personB.birthTimeUnknown;
  const unknownSubject = result.personA.birthTimeUnknown && result.personB.birthTimeUnknown
    ? "두 사람 모두"
    : `${result.personA.birthTimeUnknown ? result.personA.displayName : result.personB.displayName}님은`;

  return (
    <main className="sj-page" aria-labelledby="compatibility-result-title">
      <div className="sj-section" style={{ gap: 6 }}>
        <p className="sj-meta">{result.personA.displayName}님과 {result.personB.displayName}님, {LOCAL_COMPAT_LABELS[result.relationshipType]} 관계로 봤어요</p>
        <h1 id="compatibility-result-title" className="sj-h1" style={{ fontSize: 24 }}>{result.summary}</h1>
      </div>
      {unknownTime && <UnknownTimeNote subject={unknownSubject} />}
      <DeepReportCard />
      <Link className="sj-button-secondary" href="/compatibility">다른 사람과 궁합 보기</Link>
      <p className="sj-fine">두 명식의 계산 요소를 바탕으로 한 관점이에요. 관계의 좋고 나쁨을 정하지 않아요.</p>
    </main>
  );
}
