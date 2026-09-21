import { UnavailableScreen } from "@/components/page-state";

type EditPersonPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPersonPage({ params }: EditPersonPageProps) {
  await params;
  return <UnavailableScreen title="프로필 수정은 준비 중입니다" description="서버 PATCH와 기존 명식 스냅샷 보존 검증을 마친 뒤 제공합니다. 현재는 새 프로필을 추가하거나 서버 보관함에서 삭제할 수 있습니다." />;
}
