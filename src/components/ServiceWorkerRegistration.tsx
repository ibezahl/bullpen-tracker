"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Register service worker
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("[App] Service Worker registered:", registration.scope);

        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour
      })
      .catch((error) => {
        console.error("[App] Service Worker registration failed:", error);
      });

    // Listen for online/offline status
    const handleOnline = () => {
      console.log("[App] Back online");
      // Trigger background sync if supported
      if ("sync" in (navigator.serviceWorker as any)) {
        navigator.serviceWorker.ready.then((registration) => {
          (registration as any).sync?.register("sync-pitches").catch(() => {});
        });
      }
    };

    const handleOffline = () => {
      console.log("[App] Gone offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return null;
}
