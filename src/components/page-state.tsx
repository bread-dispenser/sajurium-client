"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

type PageStateProps = {
  title: string;
  description: string;
  children?: ReactNode;
  action?: { href: string; label: string };
};

function PageState({ title, description, children, action }: PageStateProps) {
  return (
    <section className="sj-state" aria-labelledby="page-state-title">
      <h1 id="page-state-title" className="sj-h1">{title}</h1>
      <p className="sj-lead">{description}</p>
      {children}
      {action && (
        <Link className="sj-button sj-button-block" href={action.href} style={{ marginTop: 16 }}>
          {action.label}
        </Link>
      )}
    </section>
  );
}

export function LoadingState({ title = "내용을 정리하고 있어요" }: { title?: string }) {
  return (
    <section className="sj-state" aria-labelledby="loading-state-title" aria-busy="true" role="status">
      <h1 id="loading-state-title" className="sj-h2">{title}</h1>
      <div className="sj-skeleton" aria-hidden="true">
        <div className="sj-skeleton-block" />
        <div className="sj-skeleton-line" style={{ width: "88%" }} />
        <div className="sj-skeleton-line" style={{ width: "72%" }} />
        <div className="sj-skeleton-line" style={{ width: "54%" }} />
      </div>
    </section>
  );
}

export function EmptyState({ title, description, action }: Omit<PageStateProps, "children">) {
  return <PageState title={title} description={description} action={action} />;
}

export function UnavailableScreen({ title, description }: { title: string; description: string }) {
  return <PageState title={title} description={description} action={{ href: "/home", label: "홈으로 돌아가기" }} />;
}

export function CorruptState({ title, description, unavailable = false, onReset }: { title: string; description: string; unavailable?: boolean; onReset: () => boolean }) {
  const [error, setError] = useState("");

  function reset() {
    if (!onReset()) {
      setError("손상 데이터를 초기화하지 못했어요. 브라우저 저장소 설정을 확인해 주세요.");
      return;
    }
    window.location.reload();
  }

  return (
    <PageState title={title} description={unavailable ? "저장소 접근이 차단되어 데이터를 확인할 수 없어요. 브라우저 설정을 확인한 뒤 다시 시도해 주세요." : description}>
      {error && <p className="sj-error" role="alert">{error}</p>}
      {unavailable
        ? <button className="sj-button sj-button-block" type="button" onClick={() => window.location.reload()}>다시 확인하기</button>
        : <button className="sj-button sj-button-block" type="button" onClick={reset}>손상 데이터 초기화</button>}
    </PageState>
  );
}
