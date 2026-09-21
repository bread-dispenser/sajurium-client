import { notFound } from "next/navigation";
import { UnavailableScreen } from "@/components/page-state";
import { LiveFlowScreen } from "@/components/core-screens";

type LongRangeReportPageProps = {
  params: Promise<{ period: string }>;
};

export default async function LongRangeReportPage({ params }: LongRangeReportPageProps) {
  const { period } = await params;
  if (period !== "year" && period !== "decade") notFound();
  if (period === "year") return <LiveFlowScreen mode="year" />;
  return <UnavailableScreen title="10년 리포트는 아직 제공되지 않아요" description="장기 흐름의 계산·상품·검증 API가 준비되면 제공됩니다." />;
}
