import { FeedbackEditScreen } from "@/components/settings-screens";

type FeedbackEditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function FeedbackEditPage({ params }: FeedbackEditPageProps) {
  const { id } = await params;
  return <FeedbackEditScreen feedbackId={id} />;
}
