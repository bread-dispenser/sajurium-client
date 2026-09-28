import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveSharedResultScreen } from "@/components/distribution-future-prototype";

export const metadata: Metadata = {
  title: "공유된 사주 결과 | 사주리움",
  description: "출생 정보를 뺀 읽기 전용 공유 결과",
  robots: { index: false, follow: false, noarchive: true },
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export default async function SharedResultPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!TOKEN_PATTERN.test(token)) notFound();

  return <LiveSharedResultScreen token={token} />;
}
