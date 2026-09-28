import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronIcon, InfoIcon } from "./icons";

export function RowLink({ href, title, sub, value, leading }: { href: string; title: ReactNode; sub?: ReactNode; value?: ReactNode; leading?: ReactNode }) {
  return (
    <Link className="sj-row" href={href}>
      {leading}
      <span className="sj-row-main">
        <span className="sj-row-title">{title}</span>
        {sub && <span className="sj-row-sub">{sub}</span>}
      </span>
      {value && <span className="sj-row-value">{value}</span>}
      <ChevronIcon className="sj-chevron" />
    </Link>
  );
}

export function GroupRowLink({ href, title, sub, value, danger = false }: { href: string; title: ReactNode; sub?: ReactNode; value?: ReactNode; danger?: boolean }) {
  return (
    <Link className={`sj-row-in-group${danger ? " sj-row-danger" : ""}`} href={href}>
      <span className="sj-row-main">
        <span className="sj-row-title">{title}</span>
        {sub && <span className="sj-row-sub">{sub}</span>}
      </span>
      {value && <span className="sj-row-value">{value}</span>}
    </Link>
  );
}

export function Banner({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <div className={`sj-banner${tone === "accent" ? " sj-banner-accent" : ""}`} role="note">
      <InfoIcon className="sj-banner-icon" />
      <div>{children}</div>
    </div>
  );
}
