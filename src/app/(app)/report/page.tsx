import { ReportScreen } from "@/components/saju-screens";

type ReportPageProps = {
  searchParams: Promise<{ reportId?: string | string[] }>;
};

export default async function ReportPage({ searchParams }: ReportPageProps) {
  const { reportId } = await searchParams;
  const value = Array.isArray(reportId) ? reportId[0] : reportId;
  return <ReportScreen reportId={value && /^\d+$/.test(value) ? value : undefined} />;
}
