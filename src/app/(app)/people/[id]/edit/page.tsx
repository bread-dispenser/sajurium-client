import { notFound } from "next/navigation";
import { ProfileEditScreen } from "@/components/profile-edit-screen";

type EditPersonPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPersonPage({ params }: EditPersonPageProps) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <ProfileEditScreen profileId={id} />;
}
