import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "whomi",
  description: "Project Todo queues that send work to Codex one item at a time.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
