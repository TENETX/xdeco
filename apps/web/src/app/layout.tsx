import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "xdeco",
  description: "Project Todo queues that send work to Codex one item at a time.",
  icons: {
    icon: "/brand/xdeco-mark.png",
    apple: "/brand/xdeco-mark.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
