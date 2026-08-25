import type { Metadata } from "next";
import { SharedCompatibilityPrototypeScreen } from "@/components/distribution-future-prototype";

export const metadata: Metadata = {
  title: "공유된 관계 요약 | 사주리움",
  description: "개인정보를 제외한 읽기 전용 관계 요약",
  robots: { index: false, follow: false, noarchive: true },
};

export default function SharedCompatibilityPage() {
  return <SharedCompatibilityPrototypeScreen />;
}
