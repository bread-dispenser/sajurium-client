import { PersonFormScreen } from "@/components/people-compatibility-screens";

type EditPersonPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPersonPage({ params }: EditPersonPageProps) {
  const { id } = await params;
  return <PersonFormScreen personId={id} />;
}
