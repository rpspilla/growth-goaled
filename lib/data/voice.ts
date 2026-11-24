import "server-only";
import { and, eq } from "drizzle-orm";
import { canViewCompany } from "@/lib/access";
import { createVoice, deleteVoice, speakableText, VoiceError } from "@/lib/ai/voice";
import { db, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { track } from "@/lib/events";
import { getCroProfile } from "./cro";

/**
 * CRO voices (Nov 24, 2026). Only the CRO themselves sets up or removes their voice, with their
 * consent recorded; Rally then reads their AI's answers in it, labelled as an AI voice.
 */

type Actor = Pick<User, "id" | "role">;
export type VoiceResult = { ok: true } | { ok: false; error: string };

export const VOICE_FILE_TYPES = /^audio\/(mpeg|mp3|mp4|x-m4a|m4a|aac|wav|x-wav|wave|webm|ogg)$/;
export const MAX_VOICE_FILE_BYTES = 4 * 1024 * 1024;
// Vercel accepts request bodies up to ~4.5 MB: 1–2 minutes of speech fits easily.
export const MAX_VOICE_TOTAL_BYTES = 4 * 1024 * 1024;

async function ownProfile(actor: Actor, croId: string) {
  const cro = await getCroProfile(croId);
  if (!cro) return { ok: false as const, error: "That CRO wasn't found." };
  if (cro.userId !== actor.id) return { ok: false as const, error: "Only the CRO themselves can set up or change their voice." };
  return { ok: true as const, cro };
}

/** Create (or replace) the CRO's voice from recordings of them. */
export async function setCroVoice(actor: Actor, croId: string, input: { consent: boolean; files: { filename: string; type: string; bytes: Uint8Array }[] }): Promise<VoiceResult> {
  const own = await ownProfile(actor, croId);
  if (!own.ok) return own;
  if (!input.consent) return { ok: false, error: "Confirm it's your own voice and that Rally may use it." };
  const files = input.files.filter((f) => f.bytes.length > 0);
  if (!files.length) return { ok: false, error: "Add a recording of yourself speaking (1–2 minutes)." };
  if (files.length > 5) return { ok: false, error: "Up to 5 recordings." };
  if (files.some((f) => f.bytes.length > MAX_VOICE_FILE_BYTES) || files.reduce((n, f) => n + f.bytes.length, 0) > MAX_VOICE_TOTAL_BYTES) return { ok: false, error: "Recordings can be up to 4 MB in all: 1–2 minutes is plenty (a phone voice memo is fine)." };
  if (files.some((f) => !VOICE_FILE_TYPES.test(f.type) && !/\.(mp3|m4a|wav|webm|ogg|aac)$/i.test(f.filename))) return { ok: false, error: "Use audio files: MP3, M4A, WAV, WebM or OGG." };
  let voiceId: string;
  try {
    voiceId = await createVoice(own.cro.name, files);
  } catch (err) {
    return { ok: false, error: err instanceof VoiceError ? err.message : "The voice couldn't be created. Try again." };
  }
  const old = own.cro.voiceId;
  await db.update(schema.croProfiles).set({ voiceId, voiceConsentAt: new Date(), updatedAt: new Date() }).where(eq(schema.croProfiles.id, croId));
  if (old && old !== voiceId) await deleteVoice(old).catch((err) => console.error("[voice] Old voice not deleted", err));
  await track("cro_voice_set", { userId: actor.id, props: { files: files.length } });
  return { ok: true };
}

/** Use a voice the CRO already made in ElevenLabs (e.g. a professional clone). */
export async function linkCroVoice(actor: Actor, croId: string, input: { consent: boolean; voiceId: string }): Promise<VoiceResult> {
  const own = await ownProfile(actor, croId);
  if (!own.ok) return own;
  if (!input.consent) return { ok: false, error: "Confirm it's your own voice and that Rally may use it." };
  const voiceId = input.voiceId.trim();
  if (!/^[A-Za-z0-9]{10,40}$/.test(voiceId)) return { ok: false, error: "That doesn't look like an ElevenLabs voice ID (letters and numbers, from the voice's page in ElevenLabs)." };
  await db.update(schema.croProfiles).set({ voiceId, voiceConsentAt: new Date(), updatedAt: new Date() }).where(eq(schema.croProfiles.id, croId));
  await track("cro_voice_set", { userId: actor.id, props: { linked: true } });
  return { ok: true };
}

export async function removeCroVoice(actor: Actor, croId: string): Promise<VoiceResult> {
  const own = await ownProfile(actor, croId);
  if (!own.ok) return own;
  if (own.cro.voiceId) await deleteVoice(own.cro.voiceId).catch((err) => console.error("[voice] Voice not deleted", err));
  await db.update(schema.croProfiles).set({ voiceId: null, voiceConsentAt: null, rallyVoice: false, updatedAt: new Date() }).where(eq(schema.croProfiles.id, croId));
  return { ok: true };
}

/**
 * The CRO's own choice to be Rally's voice too: the Collective's answers, the website chat and the
 * greeting speak in it. One Rally voice at a time (turning it on turns any other off).
 */
export async function setRallyVoice(actor: Actor, croId: string, on: boolean): Promise<VoiceResult> {
  const own = await ownProfile(actor, croId);
  if (!own.ok) return own;
  if (on && !(own.cro.voiceId && own.cro.voiceConsentAt)) return { ok: false, error: "Create your voice first." };
  if (on) await db.update(schema.croProfiles).set({ rallyVoice: false }).where(eq(schema.croProfiles.rallyVoice, true));
  await db.update(schema.croProfiles).set({ rallyVoice: on, updatedAt: new Date() }).where(eq(schema.croProfiles.id, croId));
  return { ok: true };
}

/**
 * Rally's own voice (a CRO's, by their choice and with their consent), if one is set up. It speaks
 * for Rally itself, so the CRO's own profile needn't be published.
 */
export async function rallyVoice(): Promise<{ voiceId: string; name: string } | null> {
  const [v] = await db
    .select({ voiceId: schema.croProfiles.voiceId, name: schema.croProfiles.name, consent: schema.croProfiles.voiceConsentAt })
    .from(schema.croProfiles)
    .where(eq(schema.croProfiles.rallyVoice, true))
    .limit(1);
  return v?.voiceId && v.consent ? { voiceId: v.voiceId, name: v.name } : null;
}

/** The voice an answer is read in: its CRO's own, else Rally's, else none (the browser's voice). */
export async function voiceFor(croId: string | null): Promise<{ voiceId: string; name: string } | null> {
  const cro = croId ? await getCroProfile(croId) : null;
  if (cro && cro.status === "published" && cro.voiceId && cro.voiceConsentAt) return { voiceId: cro.voiceId, name: cro.name };
  return rallyVoice();
}

/**
 * An answer to read aloud, for someone who may see its conversation: the text, and the voice of the
 * CRO who gave it, or Rally's (null when neither is set up: the browser's own voice reads it).
 */
export async function speakableAnswer(user: Actor, messageId: string): Promise<{ text: string; voiceId: string | null; cro: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/.test(messageId)) return null;
  const [row] = await db
    .select({ content: schema.conversationMessages.content, role: schema.conversationMessages.role, croId: schema.conversationMessages.croId, companyId: schema.companies.id, advisorId: schema.companies.advisorId })
    .from(schema.conversationMessages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.conversationMessages.conversationId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.conversations.companyId))
    .where(eq(schema.conversationMessages.id, messageId))
    .limit(1);
  if (!row || row.role !== "assistant") return null;
  const member =
    user.role === "founder"
      ? await db.select({ id: schema.companyMembers.companyId }).from(schema.companyMembers).where(and(eq(schema.companyMembers.companyId, row.companyId), eq(schema.companyMembers.userId, user.id))).limit(1)
      : [];
  if (!canViewCompany(user, { id: row.companyId, advisorId: row.advisorId }, member.map((m) => m.id))) return null;
  const voice = await voiceFor(row.croId);
  return { text: speakableText(row.content), voiceId: voice?.voiceId ?? null, cro: voice?.name ?? null };
}

/** A website-chat message (by its place in the chat) to read aloud, for the visitor whose chat it is. */
export async function speakableGuestMessage(token: string | undefined, index: number): Promise<{ text: string; voiceId: string | null } | null> {
  const { guestByToken } = await import("./guest");
  const g = await guestByToken(token);
  const m = g && Number.isInteger(index) && index >= 0 ? g.messages[index] : undefined;
  if (!g || !m || m.role !== "assistant") return null;
  const voice = await voiceFor(g.croId ?? null);
  return { text: speakableText(m.content), voiceId: voice?.voiceId ?? null };
}

export { greetingText } from "@/lib/chat/speakable";

/** What a founder's ask box needs to talk to Rally: transcription available, a real Rally voice, their first name. */
export async function askVoice(user: Pick<User, "name">): Promise<{ transcribe: boolean; voiced: boolean; name: string | null }> {
  const { voiceConfigured } = await import("@/lib/ai/voice");
  return { transcribe: voiceConfigured(), voiced: Boolean(await rallyVoice()), name: user.name?.trim().split(/\s+/)[0] || null };
}
