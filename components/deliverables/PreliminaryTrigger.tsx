"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ensurePreliminary } from "@/app/(founder)/benchmark/actions";

/** Once uploads have settled, asks the server to build the preliminary Benchmark (it decides whether one is due). */
export function PreliminaryTrigger({ filesWorking }: { filesWorking: boolean }) {
  const router = useRouter();
  const asked = useRef(false);
  useEffect(() => {
    if (filesWorking) {
      asked.current = false;
      return;
    }
    if (asked.current) return;
    asked.current = true;
    ensurePreliminary()
      .then((r) => r.started && router.refresh())
      .catch(() => undefined);
  }, [filesWorking, router]);
  return null;
}
