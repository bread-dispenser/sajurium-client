"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type Provider = "카카오" | "Apple" | "Google";
type GuestState = "active" | "expired" | "recovered";
type DuplicateChoice = "merge" | "keep";
type Calendar = "solar" | "lunar";

type ProfileDraft = {
  nickname: string;
  birthDate: string;
  calendar: Calendar;
  leapMonth: boolean;
  birthTime: string;
  unknownTime: boolean;
  birthplace: string;
  genderBasis: string;
  interests: string[];
  relationship: string;
  job: string;
  concern: string;
};

type Snapshot = ProfileDraft & {
  id: number;
  label: string;
};

const PROVIDERS: Provider[] = ["카카오", "Apple", "Google"];
const INTERESTS = ["연애·관계", "일·커리어", "재물", "건강", "가족"];

const INITIAL_PROFILE: ProfileDraft = {
  nickname: "다온",
  birthDate: "1992-08-17",
  calendar: "solar",
  leapMonth: false,
  birthTime: "14:30",
  unknownTime: false,
  birthplace: "서울특별시",
  genderBasis: "여성",
  interests: ["일·커리어"],
  relationship: "연애 중",
  job: "직장인",
  concern: "지금 맡은 일과 새로운 기회 사이에서 어떤 선택을 해야 할지 고민이에요.",
};

function maskBirthDate(value: string) {
  const year = value.slice(0, 4) || "****";
  return `${year}. **. **`;
}

function maskBirthTime(value: string, unknown: boolean) {
  return unknown ? "시간 미상" : `${value.slice(0, 2) || "**"}:**`;
}

export function AccountPrototypeScreen() {
  const [guestState, setGuestState] = useState<GuestState>("active");
  const [provider, setProvider] = useState<Provider>("카카오");
  const [signedIn, setSignedIn] = useState(false);
  const [migrated, setMigrated] = useState(false);
  const [duplicateChoice, setDuplicateChoice] = useState<DuplicateChoice>("merge");
  const [duplicateResolved, setDuplicateResolved] = useState(false);
  const [deletionReview, setDeletionReview] = useState(false);
  const [deletionConfirmed, setDeletionConfirmed] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleted, setDeleted] = useState(false);

  function connectAccount() {
    setSignedIn(true);
    setMigrated(guestState !== "expired");
    setDuplicateResolved(false);
  }

  function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deletionConfirmed || deletePhrase !== "계정 삭제") return;
    setDeleted(true);
    setSignedIn(false);
    setMigrated(false);
    setDeletionReview(false);
  }

  return (
    <main className="screen-content settings-content" aria-labelledby="account-title">
      <header>
        <p className="section-kicker">계정 여정 · 화면 체험</p>
        <h1 id="account-title">계정과 임시 결과<br />이어보기</h1>
        <p className="supporting">가입 전 결과부터 계정 삭제 검토까지 화면 흐름을 안전하게 체험해요.</p>
      </header>

      <aside className="privacy-panel">
        <strong>인터랙티브 화면 프로토타입</strong>
        <p>실제 계정·임시 식별자·서버는 없고 소셜 서비스에도 연결되지 않습니다. 모든 선택은 현재 React 화면 상태에서만 바뀌며, 계산·결제·저장도 수행하지 않아요.</p>
      </aside>

      <section className="settings-section" aria-labelledby="guest-result-title">
        <div>
          <small>비회원 무료 결과</small>
          <h2 id="guest-result-title">임시 결과 상태</h2>
          <p>로그인하지 않아도 무료 결과를 먼저 본 상황을 재현합니다. 결제 직전에는 계정 생성이 필요하다는 안내가 표시돼요.</p>
        </div>
        <div className="segmented-control" role="group" aria-label="임시 결과 상태 선택">
          <button type="button" className={guestState === "active" ? "selected" : ""} aria-pressed={guestState === "active"} onClick={() => setGuestState("active")}>유효한 결과</button>
          <button type="button" className={guestState === "expired" ? "selected" : ""} aria-pressed={guestState === "expired"} onClick={() => setGuestState("expired")}>만료 상황</button>
        </div>
        {guestState === "active" && (
          <article className="insight-card current" aria-live="polite">
            <small>임시 결과 · 동일 브라우저</small>
            <h2>오늘의 무료 사주 요약</h2>
            <p>임시 결과가 남아 있어 로그인 후 계정으로 이전할 수 있어요.</p>
            <button type="button" className="secondary-button" onClick={() => setGuestState("recovered")}>재방문 결과 복구 체험</button>
          </article>
        )}
        {guestState === "recovered" && (
          <p className="action-note" role="status">이 브라우저의 유효 기간 안에 있는 임시 결과를 복구했어요. 실제 브라우저 저장은 사용하지 않았습니다.</p>
        )}
        {guestState === "expired" && (
          <div className="danger-confirm" role="status">
            <strong>임시 결과가 만료됐어요</strong>
            <p>이전 결과는 복구하거나 계정으로 이전할 수 없습니다. 출생 정보를 다시 입력해야 해요.</p>
            <button type="button" onClick={() => setGuestState("active")}>출생 정보 재입력 완료로 보기</button>
          </div>
        )}
        <p className="limit-notice">유료 리포트 구매 단계로 가기 전에는 결과 보존을 위해 계정 생성이 필요합니다. 이 프로토타입에는 실제 구매가 없어요.</p>
      </section>

      <section className="settings-section" aria-labelledby="social-login-title">
        <div>
          <small>소셜 로그인</small>
          <h2 id="social-login-title">연결 방법 선택</h2>
          <p>국내 사용 흐름을 고려해 카카오를 기본 선택했어요.</p>
        </div>
        <fieldset>
          <legend>로그인 제공자</legend>
          <div className="topic-list">
            {PROVIDERS.map((item) => (
              <label className={`topic-card${provider === item ? " selected" : ""}`} key={item}>
                <input type="radio" name="account-provider" value={item} checked={provider === item} onChange={() => setProvider(item)} />
                <span><strong>{item}</strong><small>실제 인증 없이 선택만 체험</small></span>
                <span className="row-marker" aria-hidden="true">{provider === item ? "선택" : "○"}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="primary-button" type="button" onClick={connectAccount}>{provider} 로그인과 결과 이전 체험</button>
        {signedIn && (
          <p className="action-note" role="status">
            {provider} 연결 화면을 완료한 상태예요. {migrated ? "비회원 무료 결과를 잃지 않고 계정으로 이전했습니다." : "만료된 결과는 이전하지 않았습니다."}
          </p>
        )}
      </section>

      {signedIn && (
        <section className="settings-section" aria-labelledby="duplicate-title">
          <div>
            <small>중복 프로필 확인</small>
            <h2 id="duplicate-title">같은 출생 정보가 있어요</h2>
            <p>계정의 ‘다온’ 프로필과 임시 프로필이 같아 자동으로 중복 생성하지 않습니다.</p>
          </div>
          <fieldset>
            <legend>처리 방법</legend>
            <label className="check-card">
              <input type="radio" name="duplicate-choice" checked={duplicateChoice === "merge"} onChange={() => setDuplicateChoice("merge")} />
              <span><strong>하나로 병합</strong><br />기존 프로필에 임시 무료 결과를 연결해요.</span>
            </label>
            <label className="check-card">
              <input type="radio" name="duplicate-choice" checked={duplicateChoice === "keep"} onChange={() => setDuplicateChoice("keep")} />
              <span><strong>기존 프로필만 유지</strong><br />임시 프로필은 만들지 않고 결과 이전도 건너뛰어요.</span>
            </label>
          </fieldset>
          <button className="secondary-button" type="button" onClick={() => setDuplicateResolved(true)}>선택 적용</button>
          {duplicateResolved && (
            <p className="action-note" role="status">{duplicateChoice === "merge" ? "프로필 하나로 병합하고 임시 결과를 연결했어요." : "기존 프로필만 유지하고 중복 생성을 막았어요."} 화면 상태만 변경됐습니다.</p>
          )}
        </section>
      )}

      <section className="settings-section" aria-labelledby="delete-title">
        <div>
          <small>계정 삭제</small>
          <h2 id="delete-title">삭제 전 처리 내용 검토</h2>
          <p>일반 콘텐츠와 법적으로 보관해야 할 수 있는 결제 기록을 분리해 안내합니다.</p>
        </div>
        {deleted ? (
          <div className="danger-confirm" role="status">
            <strong>계정 삭제 화면을 완료했어요</strong>
            <p>출생 정보·리포트·상담 내용은 서비스에서 조회할 수 없는 상태로 표시됩니다. 실제 데이터는 삭제되지 않았어요.</p>
            <button type="button" onClick={() => { setDeleted(false); setDeletePhrase(""); setDeletionConfirmed(false); }}>체험 상태 초기화</button>
          </div>
        ) : !deletionReview ? (
          <button className="secondary-button" type="button" onClick={() => setDeletionReview(true)}>계정 삭제 검토 시작</button>
        ) : (
          <form className="birth-fields danger-confirm" onSubmit={deleteAccount}>
            <article>
              <small>일반 콘텐츠 · 서비스에서 삭제</small>
              <h2>출생 정보, 저장 리포트, 상담 내용</h2>
              <p>삭제 완료 후 계정 기능에서 더 이상 조회하거나 복구할 수 없는 항목입니다.</p>
            </article>
            <article>
              <small>법정 보관 대상 · 별도 분리</small>
              <h2>결제·거래 기록</h2>
              <p>관련 법령이 요구하는 기간에 한해 서비스 콘텐츠와 분리 보관될 수 있으며, 기간 종료 후 파기됩니다. 이 화면에는 실제 결제 기록이 없어요.</p>
            </article>
            <label className="check-card">
              <input type="checkbox" checked={deletionConfirmed} onChange={(event) => setDeletionConfirmed(event.target.checked)} required />
              <span>일반 콘텐츠는 복구할 수 없고 결제 기록은 법적 의무에 따라 별도 보관될 수 있음을 확인했습니다.</span>
            </label>
            <label className="field-group" htmlFor="delete-phrase">
              <span className="field-label">확인을 위해 “계정 삭제” 입력</span>
              <input id="delete-phrase" value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value)} autoComplete="off" required />
            </label>
            <button type="submit" disabled={deletePhrase !== "계정 삭제" || !deletionConfirmed}>계정 삭제 확정</button>
            <button type="button" onClick={() => { setDeletionReview(false); setDeletePhrase(""); setDeletionConfirmed(false); }}>취소</button>
          </form>
        )}
      </section>
    </main>
  );
}

export function ProfilePrototypeScreen() {
  const [draft, setDraft] = useState<ProfileDraft>(INITIAL_PROFILE);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([{ ...INITIAL_PROFILE, id: 1, label: "최초 입력 스냅샷" }]);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");

  function update<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function toggleInterest(value: string) {
    update("interests", draft.interests.includes(value)
      ? draft.interests.filter((item) => item !== value)
      : [...draft.interests, value]);
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextId = snapshots.length + 1;
    setSnapshots((current) => [
      ...current,
      { ...draft, id: nextId, label: current.length === 0 ? "최초 입력 스냅샷" : `수정 스냅샷 ${nextId}` },
    ]);
    setEditing(false);
    setMessage(snapshots.length === 0 ? "프로필 화면을 만들었어요." : "새 스냅샷을 만들었어요. 기존 리포트는 이전 정보로 남아 있습니다.");
  }

  const latest = snapshots.at(-1);

  return (
    <main className="screen-content settings-content" aria-labelledby="profile-title">
      <header>
        <p className="section-kicker">프로필 여정 · 화면 체험</p>
        <h1 id="profile-title">나의 사주 프로필</h1>
        <p className="supporting">민감한 출생 정보는 가려 보고, 수정할 때마다 별도 스냅샷으로 남기는 흐름입니다.</p>
      </header>

      <aside className="privacy-panel">
        <strong>화면 체험 전용</strong>
        <p>실제 프로필·계정·서버·사주 계산은 없습니다. 입력값과 스냅샷은 현재 React 화면 상태에만 있고 저장·전송·공유되지 않아요. 공유 결과에도 정확한 출생 정보가 포함되지 않는다는 정책을 재현합니다.</p>
      </aside>

      {!editing && latest && (
        <section className="settings-section" aria-labelledby="masked-profile-title">
          <div>
            <small>기본 마스킹 목록 미리보기</small>
            <h2 id="masked-profile-title">{latest.nickname}</h2>
            <p>{maskBirthDate(latest.birthDate)} · {maskBirthTime(latest.birthTime, latest.unknownTime)} · {latest.birthplace.replace(/(.{1}).+/, "$1**")}</p>
            <p>{latest.calendar === "solar" ? "양력" : latest.leapMonth ? "음력 윤달" : "음력 평달"} · 성별 기준값 {latest.genderBasis}</p>
          </div>
          <button className="primary-button" type="button" onClick={() => { setDraft({ ...latest }); setEditing(true); setMessage(""); }}>프로필 수정</button>
        </section>
      )}

      {editing && (
        <form className="birth-fields" onSubmit={saveProfile} aria-labelledby="profile-form-title">
          <h2 id="profile-form-title">{snapshots.length > 0 ? "프로필 수정" : "프로필 만들기"}</h2>
          <label className="field-group">이름 또는 닉네임<input value={draft.nickname} onChange={(event) => update("nickname", event.target.value)} required /></label>
          <label className="field-group">생년월일<input type="date" value={draft.birthDate} onChange={(event) => update("birthDate", event.target.value)} required /></label>

          <fieldset>
            <legend>달력 기준</legend>
            <label className="check-card"><input type="radio" name="calendar" checked={draft.calendar === "solar"} onChange={() => update("calendar", "solar")} />양력</label>
            <label className="check-card"><input type="radio" name="calendar" checked={draft.calendar === "lunar"} onChange={() => update("calendar", "lunar")} />음력</label>
            {draft.calendar === "lunar" && (
              <label className="check-card"><input type="checkbox" checked={draft.leapMonth} onChange={(event) => update("leapMonth", event.target.checked)} />음력 윤달입니다</label>
            )}
          </fieldset>

          <label className="field-group">출생 시간<input type="time" value={draft.birthTime} disabled={draft.unknownTime} onChange={(event) => update("birthTime", event.target.value)} required={!draft.unknownTime} /></label>
          <label className="check-card"><input type="checkbox" checked={draft.unknownTime} onChange={(event) => update("unknownTime", event.target.checked)} />출생 시간을 몰라요</label>
          {draft.unknownTime && (
            <aside className="privacy-panel" role="status">
              <strong>시간을 추정해 채우지 않습니다</strong>
              <p>시주를 제외한 범위만 사용하고 시주 의존 해석은 만들지 않는 흐름이에요. 정확도가 제한되며 출생 시간이 필요한 유료 리포트 구매 전 경고가 필요합니다. 실제 계산·구매는 없습니다.</p>
            </aside>
          )}

          <label className="field-group">출생지<input value={draft.birthplace} onChange={(event) => update("birthplace", event.target.value)} placeholder="시·군·구" required /></label>
          <label className="field-group">명리 계산 성별 기준값<select value={draft.genderBasis} onChange={(event) => update("genderBasis", event.target.value)} required><option value="여성">여성</option><option value="남성">남성</option><option value="선택하지 않음">선택하지 않음</option></select></label>

          <fieldset>
            <legend>현재 관심사 (선택)</legend>
            <p>초기 결과와 추천 질문을 개인화하는 용도로만 선택하는 항목입니다.</p>
            {INTERESTS.map((item) => (
              <label className="check-card" key={item}><input type="checkbox" checked={draft.interests.includes(item)} onChange={() => toggleInterest(item)} />{item}</label>
            ))}
          </fieldset>

          <label className="field-group">연애 상태 (선택)<select value={draft.relationship} onChange={(event) => update("relationship", event.target.value)}><option>선택하지 않음</option><option>솔로</option><option>연애 중</option><option>기혼</option><option>관계 고민 중</option></select></label>
          <label className="field-group">직업 상태 (선택)<select value={draft.job} onChange={(event) => update("job", event.target.value)}><option>선택하지 않음</option><option>학생</option><option>직장인</option><option>프리랜서·사업</option><option>구직·전환 중</option></select></label>
          <label className="field-group">현재 가장 큰 고민 (선택)<textarea rows={4} value={draft.concern} onChange={(event) => update("concern", event.target.value)} maxLength={300} /></label>

          <button className="primary-button" type="submit">{snapshots.length > 0 ? "새 스냅샷으로 저장" : "프로필 만들기"}</button>
          <button className="secondary-button" type="button" onClick={() => { setEditing(false); setDraft(latest ? { ...latest } : INITIAL_PROFILE); }}>취소</button>
        </form>
      )}

      {message && <p className="action-note" role="status">{message}</p>}

      <section className="settings-section" aria-labelledby="snapshot-title">
        <div>
          <small>변경 이력</small>
          <h2 id="snapshot-title">사주 계산 스냅샷</h2>
          <p>정보 수정 시 기존 결과를 덮어쓰지 않는 동작을 보여줍니다. 실제 계산은 하지 않아요.</p>
        </div>
        <div className="library-list" aria-live="polite">
          {[...snapshots].reverse().map((snapshot, index) => (
            <article key={snapshot.id}>
              <div>
                <small>{index === 0 ? "현재 프로필" : "이전 정보로 생성됨 · 기존 리포트"}</small>
                <h2>{snapshot.label}</h2>
                <p>{maskBirthDate(snapshot.birthDate)} · {maskBirthTime(snapshot.birthTime, snapshot.unknownTime)} · {snapshot.calendar === "solar" ? "양력" : snapshot.leapMonth ? "음력 윤달" : "음력 평달"}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {!editing && snapshots.length === 0 && <button className="primary-button" type="button" onClick={() => setEditing(true)}>프로필 만들기</button>}
    </main>
  );
}
