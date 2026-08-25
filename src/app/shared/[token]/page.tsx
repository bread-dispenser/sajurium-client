import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedCompatibilityPrototypeScreen } from "@/components/distribution-future-prototype";
import type { ShareLinkView } from "@/lib/contracts";

export const metadata: Metadata = {
  title: "공유된 관계 요약 | 사주리움",
  description: "개인정보를 제외한 읽기 전용 관계 요약",
  robots: { index: false, follow: false, noarchive: true },
};

const LOCAL_SHARE_LINKS: Readonly<Record<string, ShareLinkView>> = {
  V7m2Q9x4Ka8Nz3Rt: {
    id: "shr_7c1f9a2e4b6d8f03",
    targetType: "compatibility",
    targetId: "cmp_4e8b1d7a9c2f6035",
    url: "/shared/V7m2Q9x4Ka8Nz3Rt",
    status: "active",
    expiresAt: "2099-12-31T14:59:59.000Z",
    disabledAt: null,
    createdAt: "2026-08-25T12:00:00.000Z",
  },
  X4p8Lm2Qa7Nv5Rk9: {
    id: "shr_3a8d1f6c9e2b7045",
    targetType: "compatibility",
    targetId: "cmp_6b2e9a4d1c8f7035",
    url: "/shared/X4p8Lm2Qa7Nv5Rk9",
    status: "expired",
    expiresAt: "2026-08-24T14:59:59.000Z",
    disabledAt: null,
    createdAt: "2026-08-17T15:00:00.000Z",
  },
  B6t3Wm9Kq2Jx8Pc4: {
    id: "shr_9e4b2c7a1d8f6035",
    targetType: "compatibility",
    targetId: "cmp_1d7a4e9c2b8f6035",
    url: "/shared/B6t3Wm9Kq2Jx8Pc4",
    status: "disabled",
    expiresAt: "2099-12-31T14:59:59.000Z",
    disabledAt: "2026-08-25T12:30:00.000Z",
    createdAt: "2026-08-25T12:00:00.000Z",
  },
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export default async function SharedResultPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!TOKEN_PATTERN.test(token)) notFound();

  return <SharedCompatibilityPrototypeScreen token={token} state={LOCAL_SHARE_LINKS[token] ?? null} />;
}
