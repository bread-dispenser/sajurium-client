import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Noto_Serif_KR } from "next/font/google";
import "./globals.css";

const editorialFont = Noto_Serif_KR({
  weight: "variable",
  display: "swap",
  variable: "--font-editorial",
  preload: false,
});

export const metadata: Metadata = {
  title: "사주리움 | 오늘의 마음을 읽는 시간",
  description:
    "오늘의 흐름을 차분히 돌아보는 사주리움입니다. 실제 명식·역법·사주 계산은 하지 않으며 준비된 예시와 이 기기 저장만 사용합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html className={editorialFont.variable} lang="ko">
      <body>{children}</body>
    </html>
  );
}
