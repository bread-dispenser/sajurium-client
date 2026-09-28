"use client";

import Link from "next/link";
import { useState } from "react";
import "./design-system.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState("");

  async function copyReference() {
    if (!error.digest) return;
    try {
      await navigator.clipboard.writeText(error.digest);
      setCopied("참조 번호를 복사했어요.");
    } catch {
      setCopied("복사하지 못했어요. 참조 번호를 직접 적어 주세요.");
    }
  }

  return (
    <html lang="ko">
      <head>
        <title>사주리움 | 화면을 불러오지 못했어요</title>
      </head>
      <body>
        <div className="sj-public">
          <header className="sj-public-header">
            <Link className="sj-wordmark" href="/">사주리움</Link>
          </header>
          <main className="sj-state" role="alert" aria-labelledby="global-error-title">
            <h1 id="global-error-title" className="sj-h1">화면을 불러오지 못했어요</h1>
            <p className="sj-lead">잠시 뒤 다시 시도해 주세요. 입력한 내용과 기록은 그대로 있어요.</p>
            <button className="sj-button sj-button-block" type="button" onClick={reset} style={{ marginTop: 8 }}>다시 시도</button>
            {error.digest && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 4px 4px 14px", borderRadius: 8, background: "var(--sj-sunk)", marginTop: 12 }}>
                <span className="sj-fine" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  계속 안 되면 문의할 때 알려주세요
                  <span style={{ fontSize: 14, color: "var(--sj-ink-body)" }}>참조 번호 {error.digest}</span>
                </span>
                <button className="sj-text-button" type="button" aria-label="참조 번호 복사" onClick={() => void copyReference()} style={{ minWidth: 44, padding: "0 12px", fontSize: 13, fontWeight: 500 }}>복사</button>
              </div>
            )}
            <p className="sj-fine" role="status">{copied}</p>
          </main>
        </div>
      </body>
    </html>
  );
}
