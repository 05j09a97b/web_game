import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ไพ่แมลงป่วน | Bluff Card Game",
  description: "เกมไพ่ปาร์ตี้ ส่งไพ่คว่ำหน้า แล้วจับให้ได้ว่าใครกำลังบลัฟ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
