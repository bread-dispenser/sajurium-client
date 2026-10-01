import Link from "next/link";

/**
 * App-wide 404. The root layout (`app/layout.tsx`) already renders `<html lang="ko">` and loads the
 * design system, so this file renders only the page content. It handles unmatched URLs and any
 * `notFound()` call without a closer `not-found.tsx`.
 */
export default function NotFound() {
  return (
    <div className="sj-public">
      <header className="sj-public-header" style={{ borderBottom: "1px solid var(--sj-line)", margin: "0 calc(-1 * var(--sj-gutter))", padding: "0 var(--sj-gutter)" }}>
        <Link className="sj-wordmark" href="/" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>사주리움</Link>
      </header>
      <main className="sj-page" aria-labelledby="not-found-title" style={{ flex: "1 1 auto", paddingTop: 28 }}>
        <section className="sj-section">
          <h1 id="not-found-title" className="sj-h1">페이지를 찾을 수 없어요</h1>
          <p className="sj-lead">주소가 바뀌었거나 잘못 입력됐을 수 있어요. 홈에서 다시 시작해 주세요.</p>
        </section>
        <Link className="sj-button sj-button-block" href="/">홈으로 가기</Link>
      </main>
    </div>
  );
}
