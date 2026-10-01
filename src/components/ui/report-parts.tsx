import Link from "next/link";
import type { ReportSectionView } from "@/lib/api/service";
import { LockIcon } from "./icons";

/** The chart elements a section was read from, as small chips. Nothing renders without evidence. */
export function EvidenceChips({ evidence }: { evidence: readonly string[] }) {
  if (!evidence.length) return null;
  return (
    <div className="sj-chips">
      <span className="sj-fine" aria-hidden="true">이렇게 읽었어요</span>
      <ul className="sj-evidence" aria-label="이렇게 읽었어요">
        {evidence.map((item) => <li key={item} className="sj-chip">{item}</li>)}
      </ul>
    </div>
  );
}

/** Server sections that are open to read: free previews, and paid ones once purchased. */
export function OpenSections({ sections, label }: { sections: readonly ReportSectionView[]; label: string }) {
  return (
    <section className="sj-group" aria-label={label}>
      {sections.map((section, index) => (
        <article key={section.key} className="sj-section" aria-labelledby={`section-${section.key}`} style={{ gap: 10, padding: 20, borderTop: index ? "1px solid var(--sj-track)" : undefined }}>
          <h2 id={`section-${section.key}`} className="sj-h2">{section.title}</h2>
          <p className="sj-body">{section.body}</p>
          <EvidenceChips evidence={section.evidence} />
        </article>
      ))}
    </section>
  );
}

/**
 * Paid sections the server sent as titles only. Payment is not open yet, so the purchase button stays
 * disabled and the link leads to the product page (or the product list when there is no product).
 */
export function LockedSections({ sections, heading, productName, productHref }: { sections: readonly ReportSectionView[]; heading: string; productName: string | null; productHref: string | null }) {
  if (!sections.length) return null;
  return (
    <section className="sj-section" aria-labelledby="locked-title">
      <h2 id="locked-title" className="sj-h2">{heading}</h2>
      <div className="sj-card" style={{ gap: 12 }}>
        <ul className="sj-list" aria-label="구매하면 열리는 내용">
          {sections.map((section, index) => (
            <li key={section.key} className="sj-locked-item" style={{ borderTop: index ? "1px solid var(--sj-track)" : undefined }}>
              <LockIcon style={{ flex: "0 0 auto", marginTop: 2, color: "var(--sj-muted)" }} />
              <h3 className="sj-h3">{section.title}</h3>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--sj-track)", paddingTop: 16 }}>
          {productName && <p className="sj-meta" style={{ color: "var(--sj-ink-strong-muted)" }}>{productName}</p>}
          <button className="sj-button sj-button-block" type="button" disabled>결제 준비 중</button>
          <p className="sj-fine">
            지금은 결제를 받지 않고 있어요.{" "}
            <Link href={productHref ?? "/products"} style={{ color: "var(--sj-accent)", fontWeight: 700 }}>{productHref ? "리포트 구성 보기" : "리포트 상품 보기"}</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
