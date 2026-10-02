"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { ApiRequestError } from "@/lib/api/client";
import {
  DEFAULT_SHARE_INCLUDE,
  createReportShare,
  deactivateShareLink,
  formatApiRequestError,
  getCurrentChart,
  getCurrentReport,
  getSharedContent,
  isAccountSessionExpired,
  listShareLinks,
  readServerJourney,
  type ShareIncludeKey,
} from "@/lib/api/service";
import { ELEMENTS, branchGlyph, stemGlyph, type ChartView, type Element } from "@/lib/saju";
import { EmptyState, LoadingState } from "./page-state";
import { ElementBalance } from "./ui/chart-display";

type ShareLink = Awaited<ReturnType<typeof listShareLinks>>[number];

const EXPIRY_OPTIONS = [
  { hours: 24, label: "24시간" },
  { hours: 72, label: "72시간" },
  { hours: 168, label: "7일" },
] as const;

const TARGET_LABELS: Record<string, string> = { report: "기본 사주 리포트", compatibility: "궁합 결과" };

export type ShareOption = { key: ShareIncludeKey; title: string; desc: string; sensitive: boolean };

/** What a report link may carry, in the order the server lists them. Birth fields start off and ask first. */
export const SHARE_OPTIONS: readonly ShareOption[] = [
  { key: "summary", title: "한 줄 요약", desc: "리포트의 핵심 한 문장", sensitive: false },
  { key: "day_pillar", title: "일주", desc: "나를 뜻하는 일간과 그 아래 글자", sensitive: false },
  { key: "five_elements", title: "오행 균형", desc: "목 화 토 금 수의 개수", sensitive: false },
  { key: "birth_date", title: "출생일", desc: "양력 또는 음력 생년월일", sensitive: true },
  { key: "birth_time", title: "출생 시간", desc: "태어난 시각, 모르면 모름으로 보여요", sensitive: true },
];

/** What a compatibility link may carry. Neither holds birth data, so neither asks first. */
export const COMPATIBILITY_SHARE_OPTIONS: readonly ShareOption[] = [
  { key: "summary", title: "관계 요약", desc: "두 사람의 관계를 정리한 한 문장", sensitive: false },
  { key: "dimensions", title: "관점별 요약", desc: "대화 방식, 갈등이 생기는 지점, 서로에게 힘이 되는 부분", sensitive: false },
];

/** Server relation_type values for a compatibility result, as people read them. */
export const COMPATIBILITY_RELATION_LABELS: Record<string, string> = { couple: "연인", friend: "친구", family: "가족", colleague: "동료" };

/** The backend stores naive UTC timestamps; treat a value without an offset as UTC. */
function parseServerDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(date);
}

function formatDayTime(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

/** The server returns `/api/v1/shared/{token}`; people open the public page at `/shared/{token}`. */
function publicShareUrl(link: ShareLink): string | null {
  const token = link.share_url?.split("/").filter(Boolean).at(-1);
  if (!token) return null;
  return `${window.location.origin}/shared/${token}`;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function LoginAgain() {
  return <Link className="sj-button-secondary" href="/login">다시 로그인하기</Link>;
}

type ShareLinkBuilderProps = {
  /** Toggles for what the link carries, in the server's order. */
  options: readonly ShareOption[];
  defaultInclude: readonly ShareIncludeKey[];
  /** Creates the link on the server with the chosen expiry and fields. */
  create: (hours: number, include: ShareIncludeKey[]) => Promise<ShareLink>;
  /** Small print under the toggles while nothing sensitive is on. */
  hint: string;
  /** Optional live preview of the card for the current choice. */
  preview?: (state: { include: readonly ShareIncludeKey[]; expiryLabel: string }) => ReactNode;
  /** Heading level for the builder's groups, so it nests under the screen's own headings. */
  level?: 2 | 3;
  /** Keep the create button pinned to the bottom (full share screen) or inline (inside another screen). */
  sticky?: boolean;
};

/** Include toggles, expiry choice, link creation and copy: one flow for every share target. */
export function ShareLinkBuilder({ options, defaultInclude, create, hint, preview, level = 2, sticky = true }: ShareLinkBuilderProps) {
  const ids = useId();
  const Heading = level === 2 ? "h2" : "h3";
  const [hours, setHours] = useState<number>(72);
  const [include, setInclude] = useState<ShareIncludeKey[]>([...defaultInclude]);
  const [confirming, setConfirming] = useState<ShareIncludeKey | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ShareLink | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [status, setStatus] = useState("");

  function setIncluded(key: ShareIncludeKey, on: boolean) {
    setInclude((current) => (on ? [...current.filter((item) => item !== key), key] : current.filter((item) => item !== key)));
    setError("");
  }

  function toggle(key: ShareIncludeKey, on: boolean) {
    const option = options.find((item) => item.key === key);
    if (on && option?.sensitive) {
      setConfirming(key);
      return;
    }
    if (confirming === key) setConfirming(null);
    setIncluded(key, on);
  }

  async function submit() {
    if (include.length === 0) {
      setError("링크에 담을 정보를 하나 이상 골라 주세요.");
      return;
    }
    setCreating(true);
    setError("");
    setNeedsLogin(false);
    setStatus("");
    try {
      const link = await create(hours, include);
      setCreated(link);
      setCreatedUrl(publicShareUrl(link));
      setStatus("링크를 만들었어요.");
    } catch (reason) {
      setError(formatApiRequestError(reason, "링크를 만들지 못했어요. 잠시 후 다시 시도해 주세요."));
      setNeedsLogin(isAccountSessionExpired(reason));
    } finally {
      setCreating(false);
    }
  }

  async function copyCreated() {
    if (!createdUrl) return;
    setStatus((await copyText(createdUrl)) ? "링크를 복사했어요." : "복사하지 못했어요. 위 링크를 직접 선택해 복사해 주세요.");
  }

  const expiryLabel = EXPIRY_OPTIONS.find((option) => option.hours === hours)?.label ?? `${hours}시간`;
  const createdExpiry = parseServerDate(created?.expires_at);
  const shows = (key: ShareIncludeKey) => include.includes(key);
  const sensitiveOn = options.some((option) => option.sensitive && include.includes(option.key));
  const confirmingOption = options.find((item) => item.key === confirming) ?? null;

  return (
    <>
      {preview?.({ include, expiryLabel })}

      <section className="sj-section" style={{ gap: 0 }} aria-labelledby={`${ids}-include`}>
        <Heading id={`${ids}-include`} className="sj-group-title">링크에 담을 정보</Heading>
        <div className="sj-group">
          {options.map((option) => (
            <label key={option.key} className="sj-row-in-group" style={{ cursor: created ? "default" : "pointer" }}>
              <span className="sj-row-main">
                <span className="sj-row-title">{option.title}</span>
                <span className="sj-row-sub">{option.desc}</span>
              </span>
              <input className="sj-switch" type="checkbox" role="switch" checked={shows(option.key)} disabled={Boolean(created)} onChange={(event) => toggle(option.key, event.target.checked)} />
            </label>
          ))}
        </div>
        {confirmingOption ? (
          <div className="sj-banner sj-banner-accent" role="alert" style={{ flexDirection: "column", marginTop: 12 }}>
            <p style={{ margin: 0 }}>{confirmingOption.title}은 링크를 받은 누구나 보게 돼요. 링크는 다른 사람에게 다시 전달될 수 있어요. 그래도 담을까요?</p>
            <div className="sj-actions-row">
              <button className="sj-button-danger" type="button" onClick={() => { setIncluded(confirmingOption.key, true); setConfirming(null); }}>{confirmingOption.title} 담기</button>
              <button className="sj-button-secondary" type="button" onClick={() => setConfirming(null)}>담지 않기</button>
            </div>
          </div>
        ) : sensitiveOn ? (
          <p className="sj-banner sj-banner-accent" role="note" style={{ margin: "12px 0 0" }}>출생 정보를 담았어요. 링크를 받은 누구나 볼 수 있으니 믿는 사람에게만 보내 주세요.</p>
        ) : (
          <p className="sj-fine" style={{ margin: "8px 4px 0" }}>{hint}</p>
        )}
      </section>

      <fieldset className="sj-field">
        <legend className="sj-group-title" style={{ padding: 0 }}>링크를 열어둘 기간</legend>
        <div className="sj-segmented" role="group" aria-label="링크를 열어둘 기간">
          {EXPIRY_OPTIONS.map((option) => (
            <button
              key={option.hours}
              type="button"
              className="sj-segment"
              aria-pressed={hours === option.hours}
              onClick={() => setHours(option.hours)}
              disabled={Boolean(created)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="sj-help">기간이 지나면 링크가 저절로 닫혀요. 그 전에도 언제든 비활성화할 수 있어요.</p>
      </fieldset>

      {error && (
        <div className="sj-actions">
          <p className="sj-error" role="alert">{error}</p>
          {needsLogin && <LoginAgain />}
        </div>
      )}

      {created && (
        <section className="sj-card" aria-labelledby={`${ids}-created`}>
          <Heading id={`${ids}-created`} className="sj-h2">링크가 준비됐어요</Heading>
          {createdUrl ? (
            <div className="sj-field">
              <label className="sj-label" htmlFor={`${ids}-url`}>공유 링크</label>
              <input id={`${ids}-url`} className="sj-input" readOnly value={createdUrl} onFocus={(event) => event.currentTarget.select()} />
            </div>
          ) : (
            <p className="sj-meta">링크 주소를 받지 못했어요. 공유 링크 목록에서 다시 확인해 주세요.</p>
          )}
          {createdExpiry && <p className="sj-meta">{formatDayTime(createdExpiry)}까지 열려 있어요.</p>}
          {createdUrl && <button className="sj-button sj-button-block" type="button" onClick={() => void copyCreated()}>링크 복사</button>}
        </section>
      )}

      <p className="sj-meta" role="status">{status}</p>

      <div className={sticky ? "sj-sticky-cta" : "sj-actions"}>
        {!created && (
          <button className="sj-button sj-button-block" type="button" onClick={() => void submit()} disabled={creating || include.length === 0 || confirming !== null}>
            {creating ? "링크를 만들고 있어요" : "링크 만들기"}
          </button>
        )}
        <Link className="sj-text-button" href="/share/links" style={{ justifyContent: "center", color: "var(--sj-ink-strong-muted)" }}>내가 만든 공유 링크 보기</Link>
      </div>
    </>
  );
}

export function ShareCreateScreen() {
  const [ready, setReady] = useState(false);
  const [hasReport, setHasReport] = useState(false);
  const [chart, setChart] = useState<ChartView | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    const journey = readServerJourney();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount.
    setHasReport(Boolean(journey));
    setReady(true);
    if (!journey) return;
    // The card preview is optional; a failed request only hides that part of it.
    void getCurrentChart().then(setChart).catch(() => setChart(null));
    void getCurrentReport()
      .then((report) => setSummary(report?.sections.find((section) => section.section_id === "summary")?.content ?? report?.sections[0]?.content ?? null))
      .catch(() => setSummary(null));
  }, []);

  if (!ready) return <LoadingState title="공유할 리포트를 확인하고 있어요" />;
  if (!hasReport) {
    return <EmptyState title="공유할 리포트가 아직 없어요" description="출생 정보를 입력하고 명식을 계산하면 기본 사주 리포트가 만들어져요. 그 리포트를 링크로 공유할 수 있어요." action={{ href: "/birth", label: "명식 계산하기" }} />;
  }

  const day = chart?.pillars.day ?? null;

  return (
    <main className="sj-page" aria-labelledby="share-title">
      <section className="sj-section">
        <h1 id="share-title" className="sj-h1">기본 사주 리포트를 링크로 보내요</h1>
        <p className="sj-lead">링크를 받은 사람은 로그인 없이, 아래에서 고른 정보만 볼 수 있어요.</p>
      </section>

      <ShareLinkBuilder
        options={SHARE_OPTIONS}
        defaultInclude={DEFAULT_SHARE_INCLUDE.report}
        create={(hours, include) => createReportShare(hours, include)}
        hint="출생일과 출생 시간은 링크를 받은 누구나 보게 돼요. 켜면 한 번 더 확인할게요. 출생지는 담을 수 없어요."
        preview={({ include, expiryLabel }) => {
          const shows = (key: ShareIncludeKey) => include.includes(key);
          if (!day && !summary) return null;
          return (
            <section className="sj-section" aria-labelledby="share-preview-title">
              <h2 id="share-preview-title" className="sj-group-title" style={{ margin: "0 4px" }}>카드 미리보기</h2>
              <div style={{ padding: "24px 28px", borderRadius: 12, background: "var(--sj-sunk)" }}>
                <figure className="sj-card" style={{ margin: 0, gap: 16, border: 0, boxShadow: "0 1px 3px rgb(24 27 33 / 10%), 0 8px 24px rgb(24 27 33 / 8%)" }} aria-label={day && shows("day_pillar") ? `공유 카드 미리보기: ${day.stem.ko}${day.branch.ko} 일주` : "공유 카드 미리보기"}>
                  <span className="sj-wordmark" style={{ fontSize: 15 }}>사주리움</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    {day && shows("day_pillar") && (
                      <div lang="zh-Hant" aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 12px", border: "1px solid var(--sj-line)", borderRadius: 8 }}>
                        <span className={`sj-hanja sj-el-${day.stem.element}`} style={{ fontSize: 40 }}>{day.stem.hanja}</span>
                        <span className={`sj-hanja sj-el-${day.branch.element}`} style={{ fontSize: 40 }}>{day.branch.hanja}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {day && shows("day_pillar") && <span className="sj-meta">{day.stem.ko}{day.branch.ko} 일주</span>}
                      <p className="sj-h2" style={{ margin: 0 }}>기본 사주 리포트</p>
                      {summary && shows("summary") && <p className="sj-body" style={{ fontSize: 14 }}>{summary}</p>}
                    </div>
                  </div>
                  {chart && shows("five_elements") && <ElementBalance counts={chart.fiveElements} />}
                  <p className="sj-fine" style={{ paddingTop: 12, borderTop: "1px solid var(--sj-track)" }}>{expiryLabel} 동안 볼 수 있는 링크예요</p>
                </figure>
              </div>
            </section>
          );
        }}
      />
    </main>
  );
}

function ShareLinkRow({ link, now, onCopy, onDeactivate, busy }: { link: ShareLink; now: number; onCopy: (link: ShareLink) => void; onDeactivate: (link: ShareLink) => void; busy: boolean }) {
  const created = parseServerDate(link.created_at);
  const expires = parseServerDate(link.expires_at);
  const expired = expires ? expires.getTime() <= now : false;
  const open = link.is_active && !expired;
  const target = TARGET_LABELS[link.target_type.toLowerCase()] ?? "공유 결과";
  const opened = link.access_count > 0 ? `${link.access_count}번 열렸어요.` : "아직 열린 적이 없어요.";
  const meta = open
    ? `${created ? `${formatDay(created)}에 만들었어요. ` : ""}${expires ? `${formatDayTime(expires)}까지 열려 있어요. ` : ""}${opened}`
    : `${created ? `${formatDay(created)}에 만들었어요. ` : ""}${link.is_active ? "기간이 지나 닫혔어요." : "직접 비활성화했어요."} ${opened}`;

  return (
    <li className="sj-row-in-group" style={{ flexDirection: "column", alignItems: "stretch", gap: 4, padding: 16, cursor: "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h3 className="sj-h3" style={{ fontWeight: open ? 700 : 500, color: open ? undefined : "var(--sj-ink-strong-muted)" }}>{target}</h3>
        <span className={open ? "sj-badge sj-badge-accent" : "sj-badge"}>{open ? "볼 수 있어요" : link.is_active ? "기간 지남" : "비활성화함"}</span>
      </div>
      <p className="sj-meta">{meta}</p>
      {open && (
        <div className="sj-actions-row" style={{ marginTop: 4 }}>
          <button className="sj-button-secondary" type="button" style={{ flex: "1 1 0", minHeight: 44, borderColor: "var(--sj-ink)", fontWeight: 700 }} onClick={() => onCopy(link)} disabled={!link.share_url}>링크 복사</button>
          <button className="sj-button-secondary" type="button" style={{ flex: "1 1 0", minHeight: 44 }} onClick={() => onDeactivate(link)} disabled={busy}>
            {busy ? "비활성화하고 있어요" : "비활성화"}
          </button>
        </div>
      )}
    </li>
  );
}

export function LiveShareLinksScreen() {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    void listShareLinks().then((items) => { setNow(Date.now()); setLinks(items); }).catch((reason) => {
      setLoadError(formatApiRequestError(reason, "공유 링크를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
      setNeedsLogin(isAccountSessionExpired(reason));
    });
  }, []);

  if (!links && !loadError) return <LoadingState title="공유 링크를 불러오고 있어요" />;

  if (!links) {
    return (
      <main className="sj-state" aria-labelledby="share-links-title">
        <h1 id="share-links-title" className="sj-h1">공유 링크를 불러오지 못했어요</h1>
        <p className="sj-lead" role="alert">{loadError}</p>
        <div className="sj-actions">
          {needsLogin ? <LoginAgain /> : <button className="sj-button sj-button-block" type="button" onClick={() => window.location.reload()}>다시 시도</button>}
        </div>
      </main>
    );
  }

  async function copy(link: ShareLink) {
    const url = publicShareUrl(link);
    setStatus(url && (await copyText(url)) ? "링크를 복사했어요." : "복사하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  async function deactivate(link: ShareLink) {
    setBusyId(link.id);
    setError("");
    setStatus("");
    try {
      const updated = await deactivateShareLink(link.id);
      setLinks((items) => items?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
      setStatus("링크를 비활성화했어요. 이제 이 링크로는 내용을 볼 수 없어요.");
    } catch (reason) {
      setError(formatApiRequestError(reason, "링크를 비활성화하지 못했어요. 잠시 후 다시 시도해 주세요."));
      setNeedsLogin(isAccountSessionExpired(reason));
    } finally {
      setBusyId(null);
    }
  }

  const isOpen = (link: ShareLink) => link.is_active && (parseServerDate(link.expires_at)?.getTime() ?? Infinity) > now;
  const open = links.filter(isOpen);
  const closed = links.filter((link) => !isOpen(link));

  return (
    <main className="sj-page" aria-labelledby="share-links-title">
      <section className="sj-section">
        <h1 id="share-links-title" className="sj-h1">내가 만든 공유 링크</h1>
        <p className="sj-lead">링크를 받은 사람은 리포트의 공개 내용만 볼 수 있어요. 필요 없어진 링크는 바로 비활성화하세요.</p>
      </section>

      {error && (
        <div className="sj-actions">
          <p className="sj-error" role="alert">{error}</p>
          {needsLogin && <LoginAgain />}
        </div>
      )}
      <p className="sj-meta" role="status">{status}</p>

      {links.length === 0 ? (
        <section className="sj-card" aria-labelledby="share-links-empty">
          <h2 id="share-links-empty" className="sj-h2">아직 만든 공유 링크가 없어요</h2>
          <p className="sj-body">기본 사주 리포트를 링크로 만들어 보내면 여기에서 기간과 상태를 관리할 수 있어요.</p>
        </section>
      ) : (
        <>
          <section className="sj-section" aria-labelledby="share-links-open">
            <h2 id="share-links-open" className="sj-group-title" style={{ margin: "0 4px" }}>열려 있는 링크 {open.length}개</h2>
            {open.length === 0 ? (
              <p className="sj-meta" style={{ margin: "0 4px" }}>지금 열려 있는 링크가 없어요.</p>
            ) : (
              <ul className="sj-group sj-list">
                {open.map((link) => <ShareLinkRow key={link.id} link={link} now={now} onCopy={(item) => void copy(item)} onDeactivate={(item) => void deactivate(item)} busy={busyId === link.id} />)}
              </ul>
            )}
          </section>

          {closed.length > 0 && (
            <section className="sj-section" aria-labelledby="share-links-closed">
              <h2 id="share-links-closed" className="sj-group-title" style={{ margin: "0 4px" }}>닫힌 링크</h2>
              <ul className="sj-group sj-list">
                {closed.map((link) => <ShareLinkRow key={link.id} link={link} now={now} onCopy={(item) => void copy(item)} onDeactivate={(item) => void deactivate(item)} busy={busyId === link.id} />)}
              </ul>
              <p className="sj-fine" style={{ margin: "0 4px" }}>닫힌 링크로 들어온 사람에게는 내용 없이 볼 수 없는 링크라고만 보여요.</p>
            </section>
          )}
        </>
      )}

      <Link className="sj-button-secondary" href="/share" style={{ borderColor: "var(--sj-ink)", fontWeight: 700 }}>새 공유 링크 만들기</Link>
    </main>
  );
}

type SharedSection = { title: string; body: string };

function toSections(value: unknown[]): SharedSection[] {
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { title, body } = item as { title?: unknown; body?: unknown };
    if (typeof body !== "string" || !body.trim()) return [];
    return [{ title: typeof title === "string" ? title : "", body }];
  });
}

export function PublicHeader({ expires }: { expires?: Date | null }) {
  return (
    <header className="sj-public-header" style={{ borderBottom: "1px solid var(--sj-line)", margin: "0 calc(-1 * var(--sj-gutter))", padding: "0 var(--sj-gutter)" }}>
      <Link className="sj-wordmark" href="/" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>사주리움</Link>
      {expires && <span className="sj-fine">{formatDayTime(expires)}까지 볼 수 있어요</span>}
    </header>
  );
}

function StartOwnChart() {
  return (
    <section className="sj-card-accent" aria-labelledby="shared-cta-title" style={{ gap: 14 }}>
      <h2 id="shared-cta-title" className="sj-h2" style={{ fontSize: 18 }}>내 명식은 어떤 모습일까요?</h2>
      <p className="sj-body" style={{ fontSize: 14 }}>생년월일시로 여덟 글자를 계산하고 오행과 대운을 근거와 함께 보여드려요. 가입 없이 시작할 수 있어요.</p>
      <Link className="sj-button sj-button-block" href="/">나도 명식 보기</Link>
    </section>
  );
}

type SharedDimension = { key: string; title: string; summary: string };

/** A shared compatibility result: names, relation, summary and perspectives only, never birth data. */
type SharedCompatibilityView = {
  kind: "compatibility";
  title: string;
  expiresAt: Date | null;
  people: string[];
  relationType: string | null;
  summary: string | null;
  dimensions: SharedDimension[];
};

type SharedView = {
  kind: "report";
  title: string;
  sections: SharedSection[];
  expiresAt: Date | null;
  /** null for links made before the server stored an include list: only `sections` are public. */
  include: string[] | null;
  summary: string | null;
  dayPillar: { gan: string; ji: string } | null;
  fiveElements: Record<Element, number> | null;
  birthDate: { calendar: string; leapMonth: boolean; date: string } | null;
  birthTime: string | null;
  birthTimeUnknown: boolean;
};

type SharedContent = Awaited<ReturnType<typeof getSharedContent>>;

function toSharedDimensions(value: SharedContent["dimensions"]): SharedDimension[] {
  return (value ?? []).flatMap((item) => {
    if (!item || typeof item.title !== "string" || typeof item.summary !== "string" || !item.summary.trim()) return [];
    return [{ key: String(item.key ?? item.title), title: item.title, summary: item.summary }];
  });
}

function isCompatibilityPayload(value: SharedContent) {
  return typeof value.relation_type === "string" || Array.isArray(value.dimensions) || Array.isArray(value.people);
}

export function toSharedView(value: SharedContent): SharedView | SharedCompatibilityView {
  if (isCompatibilityPayload(value)) {
    // Only the public compatibility fields are read; anything else in the payload is ignored.
    return {
      kind: "compatibility",
      title: value.title,
      expiresAt: parseServerDate(value.expires_at),
      people: (value.people ?? []).flatMap((person) => (person && typeof person.nickname === "string" && person.nickname.trim() ? [person.nickname] : [])),
      relationType: typeof value.relation_type === "string" ? value.relation_type : null,
      summary: typeof value.summary === "string" && value.summary.trim() ? value.summary : null,
      dimensions: toSharedDimensions(value.dimensions),
    };
  }
  const include = Array.isArray(value.include) ? value.include : null;
  const day = value.day_pillar && typeof value.day_pillar.gan === "string" && typeof value.day_pillar.ji === "string" ? { gan: value.day_pillar.gan, ji: value.day_pillar.ji } : null;
  const five = value.five_elements ? Object.fromEntries(ELEMENTS.map((element) => [element, Number(value.five_elements?.[element] ?? 0)])) as Record<Element, number> : null;
  const rawDate = value.birth_date as { calendar_type?: unknown; is_leap_month?: unknown; date?: unknown } | null | undefined;
  const birthDate = rawDate && typeof rawDate.date === "string" ? { calendar: String(rawDate.calendar_type ?? "solar"), leapMonth: rawDate.is_leap_month === true, date: rawDate.date } : null;
  return {
    kind: "report",
    title: value.title,
    sections: toSections(value.sections),
    expiresAt: parseServerDate(value.expires_at),
    include,
    summary: typeof value.summary === "string" && value.summary.trim() ? value.summary : null,
    dayPillar: day,
    fiveElements: five,
    birthDate,
    birthTime: typeof value.birth_time === "string" ? value.birth_time : null,
    birthTimeUnknown: value.birth_time_unknown === true,
  };
}

function sharedDateLabel(value: NonNullable<SharedView["birthDate"]>) {
  const [year, month, day] = value.date.split("-").map(Number);
  const calendar = value.calendar === "lunar" ? (value.leapMonth ? "음력 윤달" : "음력") : "양력";
  return `${calendar} ${year}년 ${month}월 ${day}일`;
}

function sharedTimeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const base = `${hour < 12 ? "오전" : "오후"} ${hour % 12 === 0 ? 12 : hour % 12}시`;
  return minute ? `${base} ${minute}분` : base;
}

function SharedBody({ view }: { view: SharedView }) {
  if (!view.include) {
    return view.sections.length > 0 ? (
      <section aria-label="공유된 내용" style={{ display: "flex", flexDirection: "column" }}>
        {view.sections.map((section, index) => (
          <div key={index} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "16px 0", borderBottom: "1px solid var(--sj-line)", borderTop: index === 0 ? "1px solid var(--sj-line)" : undefined }}>
            {section.title && <h2 className="sj-h3">{section.title}</h2>}
            <p className="sj-body">{section.body}</p>
          </div>
        ))}
      </section>
    ) : null;
  }
  const stem = view.dayPillar ? stemGlyph(view.dayPillar.gan) : null;
  const branch = view.dayPillar ? branchGlyph(view.dayPillar.ji) : null;
  const birthShown = Boolean(view.birthDate) || Boolean(view.birthTime) || view.birthTimeUnknown;
  return (
    <>
      {view.summary && (
        <section className="sj-section" aria-labelledby="shared-summary-title" style={{ gap: 4 }}>
          <h2 id="shared-summary-title" className="sj-h3">한 줄 요약</h2>
          <p className="sj-body">{view.summary}</p>
        </section>
      )}
      {view.dayPillar && (
        <section className="sj-section" aria-labelledby="shared-day-title" style={{ gap: 8 }}>
          <h2 id="shared-day-title" className="sj-h3">일주</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {stem && branch && (
              <span lang="zh-Hant" aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 12px", border: "1px solid var(--sj-line)", borderRadius: 8, fontSize: 36 }}>
                <span className={`sj-hanja sj-el-${stem.element}`}>{stem.hanja}</span>
                <span className={`sj-hanja sj-el-${branch.element}`}>{branch.hanja}</span>
              </span>
            )}
            <p className="sj-body">{view.dayPillar.gan}{view.dayPillar.ji} 일주{stem ? `, 일간 ${stem.ko}${stem.element}` : ""}</p>
          </div>
        </section>
      )}
      {view.fiveElements && (
        <section className="sj-section" aria-labelledby="shared-elements-title" style={{ gap: 8 }}>
          <h2 id="shared-elements-title" className="sj-h3">오행 균형</h2>
          <ElementBalance counts={view.fiveElements} />
        </section>
      )}
      {birthShown && (
        <section className="sj-section" aria-labelledby="shared-birth-title" style={{ gap: 4 }}>
          <h2 id="shared-birth-title" className="sj-h3">출생 정보</h2>
          {view.birthDate && <p className="sj-body">{sharedDateLabel(view.birthDate)}</p>}
          {view.birthTime ? <p className="sj-body">{sharedTimeLabel(view.birthTime)}</p> : view.birthTimeUnknown ? <p className="sj-body">태어난 시간 모름</p> : null}
        </section>
      )}
    </>
  );
}

function sharedCompatibilityLead(view: SharedCompatibilityView) {
  const relation = view.relationType ? COMPATIBILITY_RELATION_LABELS[view.relationType] : undefined;
  const pair = view.people.length === 2 ? `${view.people[0]}님과 ${view.people[1]}님의 관계를` : "두 사람의 관계를";
  return relation ? `${pair} ${relation} 관계로 살펴보고 공유한 요약이에요.` : `${pair} 살펴보고 공유한 요약이에요.`;
}

function SharedCompatibilityBody({ view }: { view: SharedCompatibilityView }) {
  return (
    <>
      {view.summary && (
        <section className="sj-section" aria-labelledby="shared-summary-title" style={{ gap: 4 }}>
          <h2 id="shared-summary-title" className="sj-h3">관계 요약</h2>
          <p className="sj-body">{view.summary}</p>
        </section>
      )}
      {view.dimensions.length > 0 && (
        <section aria-label="관점별 요약" style={{ display: "flex", flexDirection: "column" }}>
          {view.dimensions.map((dimension, index) => (
            <div key={dimension.key} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "16px 0", borderBottom: "1px solid var(--sj-line)", borderTop: index === 0 ? "1px solid var(--sj-line)" : undefined }}>
              <h2 className="sj-h3">{dimension.title}</h2>
              <p className="sj-body">{dimension.summary}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

export const MALFORMED_SHARE_LINK_MESSAGE = "링크 주소가 잘렸거나 올바르지 않아요. 공유한 사람에게 링크를 다시 보내 달라고 부탁해 주세요.";

/** Shared failure state for every way a share link can fail to open: expired, closed, missing or malformed. */
export function SharedResultUnavailable({ message }: { message: string }) {
  return (
    <div className="sj-public">
      <PublicHeader />
      <main className="sj-page" aria-labelledby="shared-title" style={{ flex: "1 1 auto", paddingTop: 28 }}>
        <section className="sj-section">
          <h1 id="shared-title" className="sj-h1">공유 결과를 열 수 없어요</h1>
          <p className="sj-lead" role="alert">{message}</p>
        </section>
        <div style={{ marginTop: "auto" }}><StartOwnChart /></div>
      </main>
    </div>
  );
}

export function LiveSharedResultScreen({ token }: { token: string }) {
  const [content, setContent] = useState<SharedView | SharedCompatibilityView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void getSharedContent(token)
      .then((value) => setContent(toSharedView(value)))
      .catch((reason) => {
        setError(reason instanceof ApiRequestError && reason.status === 404
          ? "링크 기간이 지났거나 공유한 사람이 링크를 닫았어요. 공유한 사람에게 새 링크를 부탁해 주세요."
          : formatApiRequestError(reason, "공유 결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
      });
  }, [token]);

  if (!content && !error) {
    return (
      <div className="sj-public">
        <PublicHeader />
        <LoadingState title="공유 결과를 불러오고 있어요" />
      </div>
    );
  }

  if (!content) return <SharedResultUnavailable message={error} />;

  if (content.kind === "compatibility") {
    return (
      <div className="sj-public">
        <PublicHeader expires={content.expiresAt} />
        <main className="sj-page" aria-labelledby="shared-title" style={{ flex: "1 1 auto", paddingTop: 28 }}>
          <section className="sj-section" style={{ gap: 10 }}>
            <h1 id="shared-title" className="sj-h1">{content.title}</h1>
            <p className="sj-lead">{sharedCompatibilityLead(content)}</p>
          </section>

          <SharedCompatibilityBody view={content} />

          <p className="sj-fine">출생 정보와 계산 근거는 공유되지 않아요. 두 명식을 바탕으로 한 관점이며 관계의 좋고 나쁨을 정하지 않아요.</p>

          <div style={{ marginTop: "auto" }}><StartOwnChart /></div>
        </main>
      </div>
    );
  }

  const birthShown = Boolean(content.birthDate) || Boolean(content.birthTime) || content.birthTimeUnknown;
  return (
    <div className="sj-public">
      <PublicHeader expires={content.expiresAt} />
      <main className="sj-page" aria-labelledby="shared-title" style={{ flex: "1 1 auto", paddingTop: 28 }}>
        <section className="sj-section" style={{ gap: 10 }}>
          <h1 id="shared-title" className="sj-h1">{content.title}</h1>
          <p className="sj-lead">사주리움에서 만든 결과 중 공유한 사람이 고른 내용만 담긴 화면이에요.</p>
        </section>

        <SharedBody view={content} />

        <p className="sj-fine">{birthShown ? "출생지와 계산 근거는 공유되지 않아요." : "출생 정보와 계산 근거는 공유되지 않아요."} 사주 해석은 참고용이며 중요한 결정을 대신하지 않아요.</p>

        <div style={{ marginTop: "auto" }}><StartOwnChart /></div>
      </main>
    </div>
  );
}
