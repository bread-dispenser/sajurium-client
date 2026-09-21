"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <head>
        <title>사주리움 | 화면을 불러오지 못했어요</title>
        <style>{`
          :root { color-scheme: light; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #f5f7f6;
            color: #152a2c;
            font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
          }
          main {
            display: grid;
            width: min(100% - 40px, 520px);
            min-height: 100svh;
            margin: 0 auto;
            align-content: center;
            gap: 16px;
            padding: 48px 0;
          }
          .context {
            color: #194d5b;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: .04em;
          }
          h1 {
            max-width: 12ch;
            margin: 0;
            font-size: clamp(30px, 9vw, 42px);
            font-weight: 650;
            letter-spacing: -.025em;
            line-height: 1.22;
          }
          p {
            max-width: 42ch;
            margin: 0;
            color: #44585a;
            font-size: 15px;
            line-height: 1.65;
          }
          button {
            width: 100%;
            min-height: 52px;
            margin-top: 16px;
            border: 0;
            border-radius: 4px;
            background: #194d5b;
            color: #fff;
            font: inherit;
            font-weight: 700;
            cursor: pointer;
            transition: background-color 160ms ease, transform 120ms cubic-bezier(.23, 1, .32, 1);
          }
          button:active { transform: scale(.985); }
          button:focus-visible { outline: 2px solid #194d5b; outline-offset: 3px; }
          @media (hover: hover) and (pointer: fine) {
            button:hover { background: #123b46; }
          }
          @media (prefers-reduced-motion: reduce) {
            button { transition: background-color 160ms ease; }
            button:active { transform: none; }
          }
        `}</style>
      </head>
      <body>
        <main>
          <p className="context">복구 안내</p>
          <h1>화면을 불러오지 못했어요</h1>
          <p>잠시 뒤 다시 시도해 주세요. 입력하던 내용은 가능한 한 그대로 유지됩니다.</p>
          <button type="button" onClick={reset}>다시 시도</button>
        </main>
      </body>
    </html>
  );
}
