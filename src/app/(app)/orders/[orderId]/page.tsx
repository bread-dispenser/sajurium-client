import { notFound } from "next/navigation";
import { PaymentStatusScreen } from "@/components/commerce-screens";

type OrderStatusPageProps = {
  params: Promise<{ orderId: string }>;
};

export default async function OrderStatusPage({ params }: OrderStatusPageProps) {
  const { orderId } = await params;
  // 주문은 서버 주문 번호(숫자)만 연다. 예전 예시 주문 주소(ord_demo_*)는 더 이상 없다.
  if (!/^\d+$/.test(orderId)) notFound();
  return <PaymentStatusScreen orderId={orderId} />;
}
