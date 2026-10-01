"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiRequestError } from "@/lib/api/client";
import { parseBirthDate } from "@/lib/contracts";
import {
  formatApiRequestError,
  getProfile,
  isAccountSessionExpired,
  readServerJourney,
  updateProfileBirth,
  type ServerProfileDetail,
} from "@/lib/api/service";
import { EmptyState, LoadingState } from "./page-state";
import { SIJIN, sijinSpan } from "./saju-screens";
import { Banner } from "./ui/layout";

type CalendarChoice = "solar" | "lunar" | "leap";
const CALENDAR_CHOICES: ReadonlyArray<{ id: CalendarChoice; label: string }> = [
  { id: "solar", label: "양력" },
  { id: "lunar", label: "음력" },
  { id: "leap", label: "음력 윤달" },
];

type FormState = {
  nickname: string;
  calendar: CalendarChoice;
  year: string;
  month: string;
  day: string;
  timeMode: "sijin" | "exact";
  sijinIndex: number | null;
  hour: string;
  minute: string;
  timeUnknown: boolean;
  gender: "female" | "male";
  birthplace: string;
};

function digits(value: string, max: number) {
  return value.replace(/\D/g, "").slice(0, max);
}

/** A stored time that sits exactly on a sijin start is shown as that sijin; anything else as an exact time. */
function toFormState(profile: ServerProfileDetail): FormState {
  const hour = profile.birthTimeHour;
  const minute = profile.birthTimeMinute ?? 0;
  const sijinIndex = hour !== null && minute === 0 ? SIJIN.findIndex((sijin) => sijin.hour === hour) : -1;
  return {
    nickname: profile.nickname,
    calendar: profile.calendar === "solar" ? "solar" : profile.leapMonth ? "leap" : "lunar",
    year: String(profile.birthYear),
    month: String(profile.birthMonth),
    day: String(profile.birthDay),
    timeMode: hour === null || sijinIndex >= 0 ? "sijin" : "exact",
    sijinIndex: sijinIndex >= 0 ? sijinIndex : null,
    hour: hour === null ? "" : String(hour),
    minute: hour === null ? "" : String(minute),
    timeUnknown: profile.birthTimeUnknown,
    gender: profile.gender,
    birthplace: profile.birthLocation ?? "",
  };
}

function composeDate(state: FormState) {
  if (!state.year || !state.month || !state.day) return "";
  return `${state.year.padStart(4, "0")}-${state.month.padStart(2, "0")}-${state.day.padStart(2, "0")}`;
}

function chosenTime(state: FormState): { hour: number; minute: number } | null {
  if (state.timeMode === "sijin") return state.sijinIndex === null ? null : { hour: SIJIN[state.sijinIndex].hour, minute: 0 };
  if (!/^\d{1,2}$/.test(state.hour) || !/^\d{0,2}$/.test(state.minute)) return null;
  const hour = Number(state.hour);
  const minute = Number(state.minute || "0");
  return hour > 23 || minute > 59 ? null : { hour, minute };
}

export function validateProfileForm(state: FormState, now = new Date()): string | null {
  if (!state.nickname.trim()) return "부를 이름을 입력해 주세요.";
  const calendar = state.calendar === "solar" ? "solar" : "lunar";
  if (!parseBirthDate(composeDate(state), now, calendar)) return "1900년 이후, 오늘보다 늦지 않은 올바른 생년월일을 입력해 주세요.";
  if (!state.timeUnknown && !chosenTime(state)) {
    return state.timeMode === "sijin" ? "태어난 시간을 고르거나 ‘시간을 몰라요’를 선택해 주세요." : "정확한 시각은 0시부터 23시, 0분부터 59분 사이로 입력해 주세요.";
  }
  return null;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "no-profile" }
  | { kind: "error"; error: unknown }
  | { kind: "ready"; profile: ServerProfileDetail };

/**
 * Edits the birth information of a stored profile. Without `profileId` it edits the profile this
 * browser's chart was calculated from. Saving keeps earlier charts and reports and calculates a new
 * chart from the edited values.
 */
export function ProfileEditScreen({ profileId }: { profileId?: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  useEffect(() => {
    let active = true;
    const id = profileId ?? readServerJourney()?.profileId ?? null;
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the journey lives in localStorage, readable only after mount.
      setState({ kind: "no-profile" });
      return;
    }
    void getProfile(id)
      .then((profile) => { if (active) setState({ kind: "ready", profile }); })
      .catch((error) => { if (active) setState({ kind: "error", error }); });
    return () => { active = false; };
  }, [profileId]);

  if (state.kind === "loading") return <LoadingState title="출생 정보를 불러오고 있어요" />;
  if (state.kind === "no-profile") {
    return <EmptyState title="아직 계산한 명식이 없어요" description="출생 정보를 입력하고 명식을 계산하면, 그 정보를 여기서 고칠 수 있어요." action={{ href: "/birth", label: "명식 계산하기" }} />;
  }
  if (state.kind === "error") {
    if (isAccountSessionExpired(state.error)) return <EmptyState title="다시 로그인해 주세요" description="로그인 세션이 만료됐어요. 다시 로그인하면 출생 정보를 고칠 수 있어요." action={{ href: "/login", label: "로그인하기" }} />;
    if (state.error instanceof ApiRequestError && (state.error.status === 404 || state.error.status === 403)) {
      return <EmptyState title="이 출생 정보를 찾을 수 없어요" description="삭제됐거나 다른 계정에 저장된 정보예요. 사람 보관함에서 다시 골라 주세요." action={{ href: "/people", label: "사람 보관함 보기" }} />;
    }
    return <EmptyState title="출생 정보를 불러오지 못했어요" description={formatApiRequestError(state.error, "연결 상태를 확인한 뒤 다시 시도해 주세요.")} action={{ href: profileId ? "/people" : "/settings", label: "돌아가기" }} />;
  }
  return <ProfileEditForm key={state.profile.id} profile={state.profile} self={!profileId || state.profile.isSelf} />;
}

function ProfileEditForm({ profile, self }: { profile: ServerProfileDetail; self: boolean }) {
  const [form, setForm] = useState<FormState>(() => toFormState(profile));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ journeyUpdated: boolean } | null>(null);
  const backHref = self ? "/settings" : "/people";

  function update(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
    setError("");
    setSaved(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateProfileForm(form);
    if (problem) return setError(problem);
    const time = form.timeUnknown ? null : chosenTime(form);
    setSaving(true);
    setError("");
    try {
      const result = await updateProfileBirth(profile.id, {
        nickname: form.nickname.trim(),
        birthYear: Number(form.year),
        birthMonth: Number(form.month),
        birthDay: Number(form.day),
        birthTimeHour: time?.hour ?? null,
        birthTimeMinute: time?.minute ?? null,
        birthTimeUnknown: form.timeUnknown,
        calendar: form.calendar === "solar" ? "solar" : "lunar",
        leapMonth: form.calendar === "leap",
        birthLocation: form.birthplace.trim() || null,
        gender: form.gender,
      });
      setForm(toFormState(result.profile));
      setSaved({ journeyUpdated: result.journey !== null });
    } catch (reason) {
      setError(formatApiRequestError(reason, "저장하지 못했어요. 입력한 내용은 그대로 두었으니 잠시 후 다시 시도해 주세요."));
    } finally {
      setSaving(false);
    }
  }

  const name = form.nickname.trim() || profile.nickname;

  return (
    <form className="sj-page" onSubmit={submit} noValidate aria-labelledby="profile-edit-title">
      <div className="sj-section" style={{ gap: 8 }}>
        <h1 id="profile-edit-title" className="sj-h1">{self ? "내 출생 정보" : `${profile.nickname}님의 출생 정보`}</h1>
        <Banner>수정하면 새 명식이 만들어지고 이전 리포트는 그대로 남아요.</Banner>
      </div>

      <div className="sj-field">
        <label className="sj-label" htmlFor="profile-nickname">{self ? "부를 이름" : "이름 또는 별칭"}</label>
        <input id="profile-nickname" className="sj-input" value={form.nickname} maxLength={20} autoComplete="off" onChange={(event) => update({ nickname: event.target.value })} />
      </div>

      <fieldset className="sj-field">
        <legend className="sj-label" style={{ marginBottom: 8 }}>생년월일</legend>
        <div className="sj-segmented" role="group" aria-label="달력 기준">
          {CALENDAR_CHOICES.map((choice) => (
            <button key={choice.id} className="sj-segment" type="button" aria-pressed={form.calendar === choice.id} onClick={() => update({ calendar: choice.id })}>{choice.label}</button>
          ))}
        </div>
        <div className="sj-date-grid">
          <label className="sj-unit-input">
            <input className="sj-unit-input-field" aria-label="태어난 해" inputMode="numeric" value={form.year} onChange={(event) => update({ year: digits(event.target.value, 4) })} />
            <span className="sj-unit" aria-hidden="true">년</span>
          </label>
          <label className="sj-unit-input">
            <input className="sj-unit-input-field" aria-label="태어난 달" inputMode="numeric" value={form.month} onChange={(event) => update({ month: digits(event.target.value, 2) })} />
            <span className="sj-unit" aria-hidden="true">월</span>
          </label>
          <label className="sj-unit-input">
            <input className="sj-unit-input-field" aria-label="태어난 날" inputMode="numeric" value={form.day} onChange={(event) => update({ day: digits(event.target.value, 2) })} />
            <span className="sj-unit" aria-hidden="true">일</span>
          </label>
        </div>
      </fieldset>

      <div className="sj-field" role="group" aria-labelledby="profile-time-label">
        <div className="sj-section-head" style={{ alignItems: "center" }}>
          <span id="profile-time-label" className="sj-label">태어난 시간</span>
          <button className="sj-text-button" type="button" disabled={form.timeUnknown} onClick={() => update({ timeMode: form.timeMode === "sijin" ? "exact" : "sijin" })}>
            {form.timeMode === "sijin" ? "정확한 시각 입력" : "시진으로 고르기"}
          </button>
        </div>
        {form.timeMode === "sijin" ? (
          <div className="sj-choice-grid" role="group" aria-label="시진">
            {SIJIN.map((sijin, index) => (
              <button key={sijin.name} className="sj-choice" type="button" aria-pressed={!form.timeUnknown && form.sijinIndex === index} aria-label={`${sijin.name}, ${sijinSpan(sijin)}`} disabled={form.timeUnknown} onClick={() => update({ sijinIndex: index })} style={form.timeUnknown ? { opacity: 0.45, cursor: "not-allowed" } : undefined}>
                <span className="sj-choice-title" aria-hidden="true">{sijin.name}</span>
                <span className="sj-choice-sub" aria-hidden="true">{sijin.range}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="sj-date-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="sj-unit-input">
                <input className="sj-unit-input-field" aria-label="태어난 시" inputMode="numeric" value={form.hour} disabled={form.timeUnknown} onChange={(event) => update({ hour: digits(event.target.value, 2) })} />
                <span className="sj-unit" aria-hidden="true">시</span>
              </label>
              <label className="sj-unit-input">
                <input className="sj-unit-input-field" aria-label="태어난 분" inputMode="numeric" value={form.minute} disabled={form.timeUnknown} onChange={(event) => update({ minute: digits(event.target.value, 2) })} />
                <span className="sj-unit" aria-hidden="true">분</span>
              </label>
            </div>
            <p className="sj-help">24시간 기준으로 입력해 주세요. 오후 2시 30분이면 14시 30분이에요.</p>
          </>
        )}
        <label className="sj-check">
          <input className="sj-check-input" type="checkbox" checked={form.timeUnknown} onChange={(event) => update({ timeUnknown: event.target.checked })} />
          <span>시간을 몰라요. 시주를 빼고 여섯 글자로 계산할게요.</span>
        </label>
      </div>

      <fieldset className="sj-field">
        <legend className="sj-label" style={{ marginBottom: 8 }}>계산 기준 성별</legend>
        <div className="sj-segmented" role="group" aria-label="계산 기준 성별">
          {(["female", "male"] as const).map((gender) => (
            <button key={gender} className="sj-segment" type="button" aria-pressed={form.gender === gender} onClick={() => update({ gender })}>{gender === "female" ? "여성" : "남성"}</button>
          ))}
        </div>
        <p className="sj-help">대운이 흐르는 방향을 정할 때만 쓰여요.</p>
      </fieldset>

      <div className="sj-field">
        <label className="sj-label" htmlFor="profile-birthplace">출생지 <span className="sj-meta" style={{ fontWeight: 400 }}>(선택)</span></label>
        <input id="profile-birthplace" className="sj-input" value={form.birthplace} autoComplete="off" onChange={(event) => update({ birthplace: event.target.value })} placeholder="예: 서울, 부산" />
      </div>

      {saved && (
        <section className="sj-card" aria-labelledby="profile-saved-title">
          <h2 id="profile-saved-title" className="sj-h2">새 명식으로 저장했어요</h2>
          <p className="sj-body" role="status">{saved.journeyUpdated ? `${name}님의 새 명식과 기본 리포트를 만들었어요. 이전 리포트는 보관함에 그대로 있어요.` : `${name}님의 새 명식을 만들었어요. 궁합을 다시 보면 새 명식으로 계산해요.`}</p>
          <Link className="sj-button sj-button-block" href={saved.journeyUpdated ? "/report" : "/people"}>{saved.journeyUpdated ? "새 명식 보기" : "사람 보관함으로"}</Link>
        </section>
      )}

      <div className="sj-sticky-cta">
        {error && <p className="sj-error" role="alert">{error}</p>}
        {saving && <p className="sj-meta" role="status">새 명식을 계산하고 있어요</p>}
        <button className="sj-button sj-button-block" type="submit" disabled={saving}>새 명식으로 저장하기</button>
        <Link className="sj-text-button" href={backHref} style={{ justifyContent: "center", color: "var(--sj-ink-strong-muted)" }}>수정하지 않고 돌아가기</Link>
      </div>
    </form>
  );
}
