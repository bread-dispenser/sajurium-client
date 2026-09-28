"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiRequestError } from "@/lib/api/client";
import {
  createReportShare,
  deactivateShareLink,
  formatApiRequestError,
  getCurrentChart,
  getSharedContent,
  isAccountSessionExpired,
  listShareLinks,
  readServerJourney,
} from "@/lib/api/service";
import type { ChartView } from "@/lib/saju";
import { EmptyState, LoadingState } from "./page-state";
import { Banner } from "./ui/layout";

type ShareLink = Awaited<ReturnType<typeof listShareLinks>>[number];

const EXPIRY_OPTIONS = [
  { hours: 24, label: "24시간" },
  { hours: 72, label: "72시간" },
  { hours: 168, label: "7일" },
] as const;

const TARGET_LABELS: Record<string, string> = { report: "기본 사주 리포트", compatibility: "궁합 결과" };

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

export function ShareCreateScreen() {
  const [ready, setReady] = useState(false);
  const [hasReport, setHasReport] = useState(false);
  const [chart, setChart] = useState<ChartView | null>(null);
  const [hours, setHours] = useState<number>(72);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ShareLink | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const journey = readServerJourney();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount.
    setHasReport(Boolean(journey));
    setReady(true);
    if (!journey) return;
    // The card preview is optional; a failed chart request only hides it.
    void getCurrentChart().then(setChart).catch(() => setChart(null));
  }, []);

  if (!ready) return <LoadingState title="공유할 리포트를 확인하고 있어요" />;
  if (!hasReport) {
    return <EmptyState title="공유할 리포트가 아직 없어요" description="출생 정보를 입력하고 명식을 계산하면 기본 사주 리포트가 만들어져요. 그 리포트를 링크로 공유할 수 있어요." action={{ href: "/birth", label: "명식 계산하기" }} />;
  }

  async function create() {
    setCreating(true);
    setError("");
    setNeedsLogin(false);
    setStatus("");
    try {
      const link = await createReportShare(hours);
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

  const day = chart?.pillars.day ?? null;
  const expiryLabel = EXPIRY_OPTIONS.find((option) => option.hours === hours)?.label ?? `${hours}시간`;
  const createdExpiry = parseServerDate(created?.expires_at);

  return (
    <main className="sj-page" aria-labelledby="share-title">
      <section className="sj-section">
        <h1 id="share-title" className="sj-h1">기본 사주 리포트를 링크로 보내요</h1>
        <p className="sj-lead">링크를 받은 사람은 로그인 없이 리포트의 무료 섹션만 볼 수 있어요.</p>
      </section>

      {day && (
        <section className="sj-section" aria-labelledby="share-preview-title">
          <h2 id="share-preview-title" className="sj-group-title" style={{ margin: "0 4px" }}>카드 미리보기</h2>
          <div style={{ padding: "24px 28px", borderRadius: 12, background: "var(--sj-sunk)" }}>
            <figure className="sj-card" style={{ margin: 0, gap: 16, border: 0, boxShadow: "0 1px 3px rgb(24 27 33 / 10%), 0 8px 24px rgb(24 27 33 / 8%)" }} aria-label={`공유 카드 미리보기: ${day.stem.ko}${day.branch.ko} 일주`}>
              <span className="sj-wordmark" style={{ fontSize: 15 }}>사주리움</span>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div lang="zh-Hant" aria-hidden="true" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 12px", border: "1px solid var(--sj-line)", borderRadius: 8 }}>
                  <span className={`sj-hanja sj-el-${day.stem.element}`} style={{ fontSize: 40 }}>{day.stem.hanja}</span>
                  <span className={`sj-hanja sj-el-${day.branch.element}`} style={{ fontSize: 40 }}>{day.branch.hanja}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="sj-meta">{day.stem.ko}{day.branch.ko} 일주</span>
                  <p className="sj-h2" style={{ margin: 0 }}>기본 사주 리포트</p>
                </div>
              </div>
              <p className="sj-fine" style={{ paddingTop: 12, borderTop: "1px solid var(--sj-track)" }}>{expiryLabel} 동안 볼 수 있는 링크예요</p>
            </figure>
          </div>
        </section>
      )}

      <Banner tone="accent">공개 화면에는 출생일·출생 시간·출생지가 나가지 않아요. 리포트의 무료 섹션만 보여요.</Banner>

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
        <section className="sj-card" aria-labelledby="share-created-title">
          <h2 id="share-created-title" className="sj-h2">링크가 준비됐어요</h2>
          {createdUrl ? (
            <div className="sj-field">
              <label className="sj-label" htmlFor="share-created-url">공유 링크</label>
              <input id="share-created-url" className="sj-input" readOnly value={createdUrl} onFocus={(event) => event.currentTarget.select()} />
            </div>
          ) : (
            <p className="sj-meta">링크 주소를 받지 못했어요. 공유 링크 목록에서 다시 확인해 주세요.</p>
          )}
          {createdExpiry && <p className="sj-meta">{formatDayTime(createdExpiry)}까지 열려 있어요.</p>}
          {createdUrl && <button className="sj-button sj-button-block" type="button" onClick={() => void copyCreated()}>링크 복사</button>}
        </section>
      )}

      <p className="sj-meta" role="status">{status}</p>

      <div className="sj-sticky-cta">
        {!created && (
          <button className="sj-button sj-button-block" type="button" onClick={() => void create()} disabled={creating}>
            {creating ? "링크를 만들고 있어요" : "링크 만들기"}
          </button>
        )}
        <Link className="sj-text-button" href="/share/links" style={{ justifyContent: "center", color: "var(--sj-ink-strong-muted)" }}>내가 만든 공유 링크 보기</Link>
      </div>
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

function PublicHeader({ expires }: { expires?: Date | null }) {
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

export function LiveSharedResultScreen({ token }: { token: string }) {
  const [content, setContent] = useState<{ title: string; sections: SharedSection[]; expiresAt: Date | null } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void getSharedContent(token)
      .then((value) => setContent({ title: value.title, sections: toSections(value.sections), expiresAt: parseServerDate(value.expires_at) }))
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

  if (!content) {
    return (
      <div className="sj-public">
        <PublicHeader />
        <main className="sj-page" aria-labelledby="shared-title" style={{ flex: "1 1 auto", paddingTop: 28 }}>
          <section className="sj-section">
            <h1 id="shared-title" className="sj-h1">공유 결과를 열 수 없어요</h1>
            <p className="sj-lead" role="alert">{error}</p>
          </section>
          <div style={{ marginTop: "auto" }}><StartOwnChart /></div>
        </main>
      </div>
    );
  }

  return (
    <div className="sj-public">
      <PublicHeader expires={content.expiresAt} />
      <main className="sj-page" aria-labelledby="shared-title" style={{ flex: "1 1 auto", paddingTop: 28 }}>
        <section className="sj-section" style={{ gap: 10 }}>
          <h1 id="shared-title" className="sj-h1">{content.title}</h1>
          <p className="sj-lead">사주리움에서 만든 결과 중 공개된 요약만 담긴 화면이에요.</p>
        </section>

        {content.sections.length > 0 && (
          <section aria-label="공유된 내용" style={{ display: "flex", flexDirection: "column" }}>
            {content.sections.map((section, index) => (
              <div key={index} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "16px 0", borderBottom: "1px solid var(--sj-line)", borderTop: index === 0 ? "1px solid var(--sj-line)" : undefined }}>
                {section.title && <h2 className="sj-h3">{section.title}</h2>}
                <p className="sj-body">{section.body}</p>
              </div>
            ))}
          </section>
        )}

        <p className="sj-fine">출생 정보와 계산 근거는 공유되지 않아요. 사주 해석은 참고용이며 중요한 결정을 대신하지 않아요.</p>

        <div style={{ marginTop: "auto" }}><StartOwnChart /></div>
      </main>
    </div>
  );
}
