import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaRegistrar } from "@/components/pwa-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Black Soup — 深汤案件档案",
  description: "一款证据优先、可验证的因果推理游戏。",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/favicon.ico", type: "image/x-icon" }, { url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "The Black Soup", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skipLink" href="#main-content">跳到主要内容</a>
        <PwaRegistrar />
        {children}
      </body>
    </html>
  );
}
