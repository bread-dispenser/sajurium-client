import { notFound } from "next/navigation";
import { DecadeScreen, LiveFlowScreen } from "@/components/core-screens";

type LongRangeReportPageProps = {
  params: Promise<{ period: string }>;
};

export default async function LongRangeReportPage({ params }: LongRangeReportPageProps) {
  const { period } = await params;
  if (period === "year") return <LiveFlowScreen mode="year" />;
  if (period === "decade") return <DecadeScreen />;
  notFound();
}
