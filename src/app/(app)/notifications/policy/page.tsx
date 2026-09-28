import { EmptyState } from "@/components/page-state";

export default function NotificationPolicyPage() {
  return (
    <main className="sj-page">
      <EmptyState title="알림 설정은 설정 화면에 있어요" description="받을 알림 종류와 방해 금지 시간은 설정의 알림에서 바꿀 수 있어요." action={{ href: "/settings#notifications", label: "알림 설정 열기" }} />
    </main>
  );
}
