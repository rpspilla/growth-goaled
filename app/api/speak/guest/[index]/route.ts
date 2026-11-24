import { cookies } from "next/headers";
import { speech, VoiceError } from "@/lib/ai/voice";
import { GUEST_COOKIE } from "@/lib/data/guest";
import { speakableGuestMessage } from "@/lib/data/voice";

export const maxDuration = 60;

/** A website-chat message read aloud in Rally's voice (or its chosen CRO's), for the visitor whose chat it is. */
export async function GET(_req: Request, { params }: { params: Promise<{ index: string }> }) {
  const m = await speakableGuestMessage((await cookies()).get(GUEST_COOKIE)?.value, Number((await params).index));
  if (!m?.voiceId) return new Response("Not found", { status: 404 });
  try {
    const audio = await speech(m.voiceId, m.text);
    return new Response(audio.body as BodyInit, { headers: { "Content-Type": audio.type, "Cache-Control": "private, max-age=3600" } });
  } catch (err) {
    return new Response(err instanceof VoiceError ? err.message : "Couldn't read it aloud.", { status: 502 });
  }
}
