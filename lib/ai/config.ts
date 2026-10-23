import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** The one place the Claude model is chosen. */
export const AI_MODEL = "claude-opus-5-5";

/** The AI isn't usable in this environment (missing or malformed key, or the key was rejected). */
export class AiConfigError extends Error {}

/**
 * What's wrong with an API key value, without revealing it. Keys are plain
 * ASCII starting with "sk-ant-"; a shortened copy (e.g. "sk-ant-api03-abc…")
 * fails every request with a header error, so it's caught here instead.
 */
export function apiKeyProblem(raw: string | undefined): string | null {
  if (!raw?.trim()) return "ANTHROPIC_API_KEY isn't set in this environment.";
  const key = raw.trim();
  if (/[^\x21-\x7e]/.test(key)) {
    return "ANTHROPIC_API_KEY contains characters a real key can't (such as “…” or spaces), so it was probably copied in shortened form. Paste the full key in the Vercel environment settings.";
  }
  if (!key.startsWith("sk-ant-")) return "ANTHROPIC_API_KEY doesn't look like an Anthropic API key (it should start with sk-ant-).";
  if (key.length < 40) return "ANTHROPIC_API_KEY is too short to be a full key. Paste the whole key in the Vercel environment settings.";
  return null;
}

let client: Anthropic | undefined;

/** Server-side Anthropic client (reads ANTHROPIC_API_KEY). Never import from client components. */
export function anthropic(): Anthropic {
  if (!client) {
    const problem = apiKeyProblem(process.env.ANTHROPIC_API_KEY);
    if (problem) throw new AiConfigError(problem);
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim() });
  }
  return client;
}

/** True when an error means the AI can't be reached with this environment's settings. */
export function isAiConfigError(err: unknown): boolean {
  return err instanceof AiConfigError || err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError;
}

/** Message for founders when automatic reading is unavailable (the details go to the logs and the admin check). */
export const AI_UNAVAILABLE_FOR_FOUNDERS = "Automatic reading isn't available right now. Your file is saved; try again later, or your advisor can review it.";

/** Message for advisors and admins, who can fix the configuration. */
export function aiProblemForStaff(err: unknown): string {
  if (err instanceof AiConfigError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in the Vercel environment settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "The Anthropic API key doesn't have access to this model or feature.";
  return "Unexpected error. Try again.";
}

/** A free request that proves the key works (reads the model's details). */
export async function checkAiConnection(): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  try {
    const model = await anthropic().models.retrieve(AI_MODEL);
    return { ok: true, model: model.display_name ?? model.id };
  } catch (err) {
    return { ok: false, error: isAiConfigError(err) ? aiProblemForStaff(err) : err instanceof Error ? err.message : String(err) };
  }
}
