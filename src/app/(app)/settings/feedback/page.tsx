import { FeedbackManagementScreen } from "@/components/settings-screens";

type FeedbackManagementPageProps = {
  searchParams: Promise<{ sent?: string | string[] }>;
};

export default async function FeedbackManagementPage({ searchParams }: FeedbackManagementPageProps) {
  const { sent } = await searchParams;
  return <FeedbackManagementScreen justSent={sent === "1"} />;
}
