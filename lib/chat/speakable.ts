/** What gets read aloud: an answer without its formatting marks, at most ~2,500 characters. */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^[-•*]\s+/gm, "")
    .replace(/^(one|a) (quick )?question:\s*/gim, "One question: ")
    .replace(/\n{2,}/g, "\n")
    .replace(/^Test mode[^:]*:\s*/i, "")
    .trim()
    .slice(0, 2500);
}

/** What Rally says when someone first taps the microphone. */
export const greetingText = (firstName: string | null) =>
  `Hi${firstName ? ` ${firstName}` : ""}, I'm Rally. Tell me about the growth decision in front of you, in your own words, and we'll work through it together. Go ahead whenever you're ready.`;
