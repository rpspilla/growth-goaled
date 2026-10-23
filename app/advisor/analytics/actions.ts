"use server";

import { requireRole } from "@/lib/auth/session";
import { checkAiConnection } from "@/lib/ai/config";

/** Admin only: a free request to Anthropic that proves the API key works. */
export async function testAiConnection() {
  await requireRole(["admin"]);
  return checkAiConnection();
}
