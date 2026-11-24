import { requireRole } from "@/lib/auth/session";
import { speech, VoiceError } from "@/lib/ai/voice";
import { speakableAnswer } from "@/lib/data/voice";
import { track } from "@/lib/events";

export const maxDuration = 60;

/** One Rally answer read aloud in the voice of the CRO who gave it (for anyone who may see the conversation). */
export async function GET(_req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const user = await requireRole(["founder", "advisor", "admin"]);
  const answer = await speakableAnswer(user, (await params).messageId);
  if (!answer) return new Response("Not found", { status: 404 });
  if (!answer.voiceId) return new Response("No voice for this answer", { status: 404 });
  try {
    const audio = await speech(answer.voiceId, answer.text);
    await track("answer_spoken", { userId: user.id, props: { chars: answer.text.length } });
    return new Response(audio.body as BodyInit, { headers: { "Content-Type": audio.type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch (err) {
    return new Response(err instanceof VoiceError ? err.message : "Couldn't read it aloud.", { status: 502 });
  }
}
