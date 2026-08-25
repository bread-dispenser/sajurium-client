import { notFound } from "next/navigation";
import { LongRangeReportScreen } from "@/components/calendar-report-screens";

type LongRangeReportPageProps = {
  params: Promise<{ period: string }>;
};

export default async function LongRangeReportPage({ params }: LongRangeReportPageProps) {
  const { period } = await params;
  if (period !== "year" && period !== "decade") notFound();
  return <LongRangeReportScreen period={period} />;
}
