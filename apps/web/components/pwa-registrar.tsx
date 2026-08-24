"use client";

import { useEffect, useRef, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaRegistrar() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const [waiting, setWaiting] = useState<ServiceWorker>();
  const [online, setOnline] = useState(true);
  const updateRequestedRef = useRef(false);
  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    let reloading = false;
    const onControllerChange = () => {
      if (reloading || !updateRequestedRef.current) return;
      reloading = true;
      window.location.reload();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") void navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
        });
      });
      void registration.update().catch(() => undefined);
    }).catch(() => undefined);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(undefined);
  };

  if (online && !installPrompt && !waiting) return null;
  return <aside className="pwaStatus" role="status" aria-live="polite">
    <span>{waiting ? "新版本已经完整缓存，可安全切换。" : online ? "可以安装到桌面并离线调查。" : "当前处于离线模式；已缓存案件仍可继续。"}</span>
    {installPrompt && <button type="button" onClick={() => void install()}>安装应用</button>}
    {waiting && <button type="button" onClick={() => { updateRequestedRef.current = true; waiting.postMessage({ type: "SKIP_WAITING" }); }}>应用更新</button>}
  </aside>;
}
