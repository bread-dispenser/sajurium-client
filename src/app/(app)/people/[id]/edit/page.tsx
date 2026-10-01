import { UnavailableScreen } from "@/components/page-state";

type EditPersonPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPersonPage({ params }: EditPersonPageProps) {
  await params;
  return <UnavailableScreen title="출생 정보 수정은 준비 중이에요" description="수정 기능이 열리면 바꾼 정보로 새 명식을 만들고, 이전 결과는 그대로 남겨둘게요. 지금은 사람 보관함에서 삭제한 뒤 다시 추가할 수 있어요." />;
}
