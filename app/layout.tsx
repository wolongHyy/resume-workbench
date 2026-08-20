import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "简历工坊", description: "本机 Skill 驱动的中文简历工作台" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
