import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaRegistrar } from "@/components/pwa-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Black Soup — 冷藏室的敲门声",
  description: "一款证据优先、可验证的因果推理游戏。",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
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
        <PwaRegistrar />
        {children}
      </body>
    </html>
  );
}
