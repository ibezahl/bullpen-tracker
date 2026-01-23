"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/home");
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500">Redirecting...</div>
    </main>
  );
}
