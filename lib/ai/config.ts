import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** The one place the Claude model is chosen. */
export const AI_MODEL = "claude-opus-5-5";

let client: Anthropic | undefined;

/** Server-side Anthropic client (reads ANTHROPIC_API_KEY). Never import from client components. */
export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}
