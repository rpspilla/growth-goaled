/**
 * The free questions a prospect gets in the website chat before we ask them to talk to an advisor
 * or diagnose their growth. Only questions the AI answers count (not the sign-up questions).
 * `perSession`: one chat (one browser cookie). `perLifetime`: everything the record has asked, its
 * contact, or its company once the contact is linked to one. Whichever is hit first applies.
 */
export const FREE_QUESTIONS = { perSession: 10, perLifetime: 20 } as const;

export type CapScope = "session" | "lifetime";

export type QuestionCounts = { session: number; lifetime: number };

/** Pure: which limit (if any) stops the next question. */
export function capReached(counts: QuestionCounts, limits: { perSession: number; perLifetime: number } = FREE_QUESTIONS): CapScope | null {
  if (counts.lifetime >= limits.perLifetime) return "lifetime";
  if (counts.session >= limits.perSession) return "session";
  return null;
}

/** Pure: questions left before a limit. */
export function questionsLeft(counts: QuestionCounts, limits: { perSession: number; perLifetime: number } = FREE_QUESTIONS): number {
  return Math.max(0, Math.min(limits.perSession - counts.session, limits.perLifetime - counts.lifetime));
}
