import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Noto_Sans_KR, Noto_Serif_KR } from "next/font/google";
import "./globals.css";

const editorialFont = Noto_Serif_KR({
  weight: "variable",
  display: "swap",
  variable: "--font-editorial",
  preload: false,
});

const sansFont = Noto_Sans_KR({
  weight: "variable",
  display: "swap",
  variable: "--font-sans",
  preload: false,
});

export const metadata: Metadata = {
  title: "사주리움 | 오늘의 마음을 읽는 시간",
  description:
    "오늘의 흐름을 차분히 돌아보는 사주리움입니다. 입력한 출생 정보로 서버에서 명식을 계산하고 결과를 익명 세션 또는 계정에 저장합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html className={`${editorialFont.variable} ${sansFont.variable}`} lang="ko">
      <body>{children}</body>
    </html>
  );
}
