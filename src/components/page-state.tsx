"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

type PageStateProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
  action?: { href: string; label: string };
};

function PageState({ eyebrow, title, description, children, action }: PageStateProps) {
  return (
    <section className="page-state" aria-labelledby="page-state-title">
      {eyebrow && <p className="section-kicker">{eyebrow}</p>}
      <h1 id="page-state-title">{title}</h1>
      <p className="supporting">{description}</p>
      {children}
      {action && (
        <Link className="primary-button state-action" href={action.href}>
          {action.label}
        </Link>
      )}
    </section>
  );
}

export function LoadingState({ title = "내용을 정리하고 있어요" }: { title?: string }) {
  return (
    <PageState title={title} description="잠시만 기다려 주세요.">
      <div className="state-lines" aria-hidden="true"><span /><span /><span /></div>
    </PageState>
  );
}

export function EmptyState({ title, description, action }: Omit<PageStateProps, "children">) {
  return <PageState eyebrow="비어 있음" title={title} description={description} action={action} />;
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
    <PageState eyebrow={unavailable ? "브라우저 저장소 사용 불가" : "기기 저장 오류"} title={title} description={unavailable ? "저장소 접근이 차단되어 데이터를 확인할 수 없어요. 브라우저 설정을 확인한 뒤 다시 시도해 주세요." : description}>
      {error && <p className="form-error" role="alert">{error}</p>}
      {unavailable
        ? <button className="primary-button state-action" type="button" onClick={() => window.location.reload()}>다시 확인하기</button>
        : <button className="primary-button state-action" type="button" onClick={reset}>손상 데이터 초기화</button>}
    </PageState>
  );
}
