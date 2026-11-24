import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { transcribe, VoiceError } from "@/lib/ai/voice";
import { GUEST_COOKIE, guestByToken } from "@/lib/data/guest";

export const maxDuration = 60;
const MAX_BYTES = 3 * 1024 * 1024;

/**
 * Speech to text for browsers without their own speech recognition: a signed-in user, or a visitor
 * with a website chat under way. Up to about two minutes of audio; nothing is kept.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  const guest = user ? null : await guestByToken((await cookies()).get(GUEST_COOKIE)?.value);
  if (!user && !guest) return Response.json({ ok: false, error: "Start the chat first." }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return Response.json({ ok: false, error: "That was too long. Try a shorter question." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) return Response.json({ ok: false, error: "Nothing was heard. Try again." }, { status: 400 });
  try {
    const text = await transcribe({ filename: file.name || "speech.webm", type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    return Response.json({ ok: true, text });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof VoiceError ? err.message : "That didn't come through. Try again, or type it." }, { status: 502 });
  }
}
