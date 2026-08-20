import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plan Orchestrator",
  description: "Project, Codex task, worktree and Todo control plane.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

