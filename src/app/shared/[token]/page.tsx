import type { Metadata } from "next";
import { LiveSharedResultScreen, MALFORMED_SHARE_LINK_MESSAGE, SharedResultUnavailable } from "@/components/share-screens";

export const metadata: Metadata = {
  title: "공유된 사주 결과 | 사주리움",
  description: "출생 정보를 뺀 읽기 전용 공유 결과",
  robots: { index: false, follow: false, noarchive: true },
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export default async function SharedResultPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // A token that cannot be a share token is usually a link a messenger cut short. It gets the same
  // Korean failure state and "나도 명식 보기" recovery as an expired or closed link, not a bare 404.
  // `notFound()` with a segment `not-found.tsx` was tried, but on a direct load Next 16.3 rendered
  // the root not-found page instead, so the state is rendered here. The page metadata keeps it noindex.
  if (!TOKEN_PATTERN.test(token)) return <SharedResultUnavailable message={MALFORMED_SHARE_LINK_MESSAGE} />;

  return <LiveSharedResultScreen token={token} />;
}
