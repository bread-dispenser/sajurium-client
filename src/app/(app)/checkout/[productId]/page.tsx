import { notFound } from "next/navigation";
import { CheckoutScreen } from "@/components/commerce-screens";
import { isProductId } from "@/lib/fixtures";

type CheckoutPageProps = {
  params: Promise<{ productId: string }>;
};

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { productId } = await params;
  if (!isProductId(productId)) notFound();
  return <CheckoutScreen productId={productId} />;
}
