import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PHILOSOPHY_FIELDS, STYLE_FIELDS, VOICE_QUESTIONS } from "@/lib/cro";
import { e2eEnabled } from "@/lib/e2e";
import { AI_MODEL, anthropic } from "./config";

/**
 * Drafting a CRO's profile (Nov 24, 2026): the professional biography from their LinkedIn profile
 * (the PDF LinkedIn exports), and the philosophy and communication-style boxes from their answers to
 * the two voice questions. Every draft stays editable on the profile.
 */

const bioSchema = z.object({ bio: z.string(), headline: z.string() });

const BIO_SYSTEM = `You write the professional biography of a Chief Revenue Officer for an advisory firm's profile page, from their LinkedIn profile.

- 120 to 180 words, third person, plain and specific: the roles, companies, stages and results that matter to a startup founder choosing an advisor.
- Use only what the profile says. Never invent companies, titles, numbers or results; leave out anything uncertain.
- No hype words (visionary, rockstar, world-class), no bullet points.
- headline: one line under 90 characters, e.g. "Former CRO at Acme; took two Seed companies past $10M ARR". Empty if the profile doesn't support one.`;

export async function draftBio(input: { name: string; linkedinUrl: string | null; pdfBase64: string }): Promise<{ bio: string; headline: string }> {
  if (e2eEnabled()) return { bio: `Test mode: ${input.name} has led revenue teams at Seed and Series A companies.`, headline: "Test mode headline" };
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: BIO_SYSTEM,
    output_config: { effort: "low", format: betaZodOutputFormat(bioSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 }, title: "LinkedIn profile" },
          { type: "text", text: `Write ${input.name}'s biography from this LinkedIn profile${input.linkedinUrl ? ` (${input.linkedinUrl})` : ""}.` },
        ],
      },
    ],
  });
  const parsed = bioSchema.safeParse(response.parsed_output);
  if (response.stop_reason === "refusal" || !parsed.success || !parsed.data.bio.trim()) throw new Error("The biography couldn't be written from that file.");
  return { bio: parsed.data.bio.trim().slice(0, 3000), headline: parsed.data.headline.trim().slice(0, 200) };
}

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as (keyof T & string)[];
const voiceSchema = z.object({
  philosophy: z.object(Object.fromEntries(keys(PHILOSOPHY_FIELDS).map((k) => [k, z.string()])) as Record<keyof typeof PHILOSOPHY_FIELDS, z.ZodString>),
  style: z.object(Object.fromEntries(keys(STYLE_FIELDS).filter((k) => k !== "exampleInTheirWords").map((k) => [k, z.string()])) as Record<Exclude<keyof typeof STYLE_FIELDS, "exampleInTheirWords">, z.ZodString>),
  example: z.string(),
});

const VOICE_SYSTEM = `You build the profile an AI uses to answer founders the way one specific Chief Revenue Officer would. You get the CRO's own answers to two founder scenarios (and their biography). From those examples, fill in every philosophy and communication-style field.

- Ground each field in what the answers show: the positions they take, what they ask first, what they push back on, the words they use. Write each in first person, as the CRO stating their view ("I hire for the stage we're in…"), 1–3 sentences.
- Where the answers only hint at a view, state the narrow version they support rather than a generic one; never contradict them and never add credentials, clients or experiences.
- Style fields describe how they communicate: e.g. directness ("Very direct: gives the answer first, then the why"), analytical vs intuitive, strategic vs tactical, how they diagnose.
- example: copy the 2–5 sentences from their answers that best show how they talk, verbatim.`;

export type VoiceDraft = { philosophy: Record<keyof typeof PHILOSOPHY_FIELDS, string>; style: Record<keyof typeof STYLE_FIELDS, string> };

export async function draftVoice(input: { name: string; bio: string | null; answers: { q1: string; q2: string } }): Promise<VoiceDraft> {
  if (e2eEnabled()) {
    return {
      philosophy: Object.fromEntries(keys(PHILOSOPHY_FIELDS).map((k) => [k, `Test mode: ${PHILOSOPHY_FIELDS[k]} from the answers.`])) as VoiceDraft["philosophy"],
      style: { ...(Object.fromEntries(keys(STYLE_FIELDS).map((k) => [k, `Test mode: ${STYLE_FIELDS[k]} from the answers.`])) as VoiceDraft["style"]), exampleInTheirWords: input.answers.q1.slice(0, 400) },
    };
  }
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 6000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: VOICE_SYSTEM,
    output_config: { effort: "medium", format: betaZodOutputFormat(voiceSchema) },
    messages: [
      {
        role: "user",
        content: [
          `CRO: ${input.name}`,
          input.bio ? `BIOGRAPHY: ${input.bio}` : "",
          `PHILOSOPHY FIELDS (JSON): ${JSON.stringify(PHILOSOPHY_FIELDS)}`,
          `STYLE FIELDS (JSON): ${JSON.stringify(STYLE_FIELDS)}`,
          `QUESTION 1: ${VOICE_QUESTIONS.q1}\nTHEIR ANSWER: ${input.answers.q1}`,
          `QUESTION 2: ${VOICE_QUESTIONS.q2}\nTHEIR ANSWER: ${input.answers.q2}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });
  const parsed = voiceSchema.safeParse(response.parsed_output);
  if (response.stop_reason === "refusal" || !parsed.success) throw new Error("The profile couldn't be drafted from those answers.");
  const trim = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.trim().slice(0, 2000)]));
  return { philosophy: trim(parsed.data.philosophy) as VoiceDraft["philosophy"], style: { ...(trim(parsed.data.style) as VoiceDraft["style"]), exampleInTheirWords: parsed.data.example.trim().slice(0, 2000) } };
}
