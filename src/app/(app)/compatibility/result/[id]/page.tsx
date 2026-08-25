import { CompatibilityResultScreen } from "@/components/people-compatibility-screens";

type CompatibilityResultPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompatibilityResultPage({ params }: CompatibilityResultPageProps) {
  const { id } = await params;
  return <CompatibilityResultScreen resultId={id} />;
}
