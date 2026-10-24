"use client";

import { useProcessingRefresh } from "@/components/readiness/useProcessingRefresh";

export function BuildingRefresh({ active }: { active: boolean }) {
  useProcessingRefresh(active);
  return null;
}
