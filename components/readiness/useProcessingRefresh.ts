"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Polls the server while files are still being processed. */
export function useProcessingRefresh(working: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [working, router]);
}
