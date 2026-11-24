import { speech, VoiceError } from "@/lib/ai/voice";
import { greetingText, rallyVoice } from "@/lib/data/voice";

export const maxDuration = 60;

// The greeting is the same for everyone with the same first name: keep the audio for an hour.
const cache = new Map<string, { at: number; bytes: Uint8Array; type: string }>();

/** Rally's greeting, in Rally's voice, when someone first taps the microphone (?name=First). */
export async function GET(req: Request) {
  const voice = await rallyVoice();
  if (!voice) return new Response("No Rally voice yet", { status: 404 });
  const raw = new URL(req.url).searchParams.get("name") ?? "";
  const name = /^[\p{L}' -]{1,24}$/u.test(raw.trim()) ? raw.trim() : null;
  const key = `${voice.voiceId}:${name ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3_600_000) return new Response(hit.bytes as BodyInit, { headers: { "Content-Type": hit.type, "Cache-Control": "public, max-age=3600" } });
  try {
    const audio = await speech(voice.voiceId, greetingText(name));
    const bytes = audio.body instanceof Uint8Array ? audio.body : new Uint8Array(await new Response(audio.body).arrayBuffer());
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), bytes, type: audio.type });
    return new Response(bytes as BodyInit, { headers: { "Content-Type": audio.type, "Cache-Control": "public, max-age=3600" } });
  } catch (err) {
    return new Response(err instanceof VoiceError ? err.message : "Couldn't play the greeting.", { status: 502 });
  }
}
