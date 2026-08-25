import { ConsultationSessionScreen } from "@/components/consultation-screens";

type ConsultationSessionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ConsultationSessionPage({ params }: ConsultationSessionPageProps) {
  const { id } = await params;
  return <ConsultationSessionScreen sessionId={id} />;
}
