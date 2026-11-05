/**
 * After six exchanges without a plan, the conversation starts pointing the founder, gently, at the
 * next step: a call with someone at Growth Goaled, or a plan. The AI mentions it on the sixth reply
 * and every third one after (not every turn); the bar under the reply box stays from the sixth on.
 */
export const NUDGE_AFTER = 6;
export const NUDGE_EVERY = 3;

/** Whether this reply should include the gentle suggestion (userTurns counts the message being answered). */
export const nudgeDue = (userTurns: number, hasPlan: boolean) => !hasPlan && userTurns >= NUDGE_AFTER && (userTurns - NUDGE_AFTER) % NUDGE_EVERY === 0;

/** Whether the conversation page shows the "talk to someone at Growth Goaled" bar. */
export const showNudge = (userTurns: number, hasPlan: boolean) => !hasPlan && userTurns >= NUDGE_AFTER;
