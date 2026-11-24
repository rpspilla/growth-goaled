import "server-only";
import { e2eEnabled } from "@/lib/e2e";
export { speakableText } from "@/lib/chat/speakable";

/**
 * Spoken answers in a CRO's own voice (Nov 24, 2026), through ElevenLabs: a CRO uploads a short
 * recording of themselves (with their consent) to create a cloned voice, and Rally reads their AI's
 * answers in it. Needs ELEVENLABS_API_KEY; ELEVENLABS_MODEL picks the speech model. In end-to-end
 * test mode nothing leaves the app (a short silent clip stands in for speech).
 */

const API = "https://api.elevenlabs.io/v1";
const MODEL = () => process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
const key = () => process.env.ELEVENLABS_API_KEY?.trim() ?? "";

export class VoiceError extends Error {}

export const voiceConfigured = () => e2eEnabled() || Boolean(key());

async function failure(res: Response, what: string): Promise<VoiceError> {
  const body = await res.text().catch(() => "");
  console.error(`[voice] ${what} failed`, res.status, body.slice(0, 500));
  if (res.status === 401) return new VoiceError("The voice service rejected the API key. Check ELEVENLABS_API_KEY in Vercel.");
  if (res.status === 402 || /quota|plan|subscription/i.test(body)) return new VoiceError("The voice service plan doesn't allow this (voice cloning needs a paid ElevenLabs plan, and usage may be over its limit).");
  return new VoiceError(`The voice service couldn't ${what} (error ${res.status}). Try again.`);
}

/** Create a cloned voice from recordings of the CRO; returns its voice id. */
export async function createVoice(name: string, files: { filename: string; type: string; bytes: Uint8Array }[]): Promise<string> {
  if (e2eEnabled()) return `e2e-voice-${files.length}`;
  if (!key()) throw new VoiceError("Voices aren't switched on yet: add ELEVENLABS_API_KEY in Vercel.");
  const form = new FormData();
  form.set("name", `${name} (Rally)`);
  form.set("description", `${name}'s own voice, for Rally to read their AI CRO's answers. Created with their consent.`);
  form.set("remove_background_noise", "true");
  for (const f of files) form.append("files", new Blob([f.bytes as BlobPart], { type: f.type || "audio/mpeg" }), f.filename);
  const res = await fetch(`${API}/voices/add`, { method: "POST", headers: { "xi-api-key": key() }, body: form });
  if (!res.ok) throw await failure(res, "create the voice");
  const json = (await res.json()) as { voice_id?: string };
  if (!json.voice_id) throw new VoiceError("The voice service didn't return a voice.");
  return json.voice_id;
}

export async function deleteVoice(voiceId: string): Promise<void> {
  if (e2eEnabled() || !key()) return;
  const res = await fetch(`${API}/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", headers: { "xi-api-key": key() } });
  if (!res.ok && res.status !== 404) throw await failure(res, "delete the voice");
}

/** A tiny silent WAV (test mode). */
function silentWav(ms = 300): Uint8Array {
  const rate = 8000;
  const samples = Math.round((rate * ms) / 1000);
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, "data");
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  return new Uint8Array(buf);
}

/** The answer read aloud in this voice, streamed as it's generated. */
export async function speech(voiceId: string, text: string): Promise<{ body: ReadableStream<Uint8Array> | Uint8Array; type: string }> {
  if (e2eEnabled()) return { body: silentWav(), type: "audio/wav" };
  if (!key()) throw new VoiceError("Voices aren't switched on yet.");
  const res = await fetch(`${API}/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key(), "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODEL(), voice_settings: { stability: 0.5, similarity_boost: 0.8 } }),
  });
  if (!res.ok || !res.body) throw await failure(res, "read the answer aloud");
  return { body: res.body, type: "audio/mpeg" };
}
