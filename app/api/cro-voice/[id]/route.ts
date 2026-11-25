import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { speech, VoiceError } from "@/lib/ai/voice";
import { getCroProfile } from "@/lib/data/cro";
import { MAX_VOICE_TOTAL_BYTES, setCroVoice } from "@/lib/data/voice";

export const maxDuration = 120;

/** A CRO creates their voice from recordings of themselves (multipart: files, consent). Only their own. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["advisor", "admin"]);
  const { id } = await params;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_VOICE_TOTAL_BYTES + 64 * 1024) return Response.json({ ok: false, error: "Recordings can be up to 4 MB in all: 1–2 minutes is plenty." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ ok: false, error: "The recording didn't arrive. Try again." }, { status: 400 });
  const files = await Promise.all(
    form.getAll("files").flatMap((f) => (f instanceof File ? [f] : [])).map(async (f) => ({ filename: f.name || "recording.webm", type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
  const r = await setCroVoice(user, id, { consent: form.get("consent") === "yes", files });
  if (r.ok) revalidatePath(`/advisor/cros/${id}`);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}

/** A short sample in the CRO's voice, so they can hear it (their own, or any for an admin). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["advisor", "admin"]);
  const cro = await getCroProfile((await params).id);
  if (!cro?.voiceId || (cro.userId !== user.id && user.role !== "admin")) return new Response("Not found", { status: 404 });
  const first = cro.name.split(" ")[0];
  try {
    const audio = await speech(cro.voiceId, `Hi, this is ${first}'s CRO-Brain on Rally. Before you add pipeline, let's find out where deals are stalling, because that's usually where the growth is.`);
    return new Response(audio.body as BodyInit, { headers: { "Content-Type": audio.type, "Cache-Control": "no-store" } });
  } catch (err) {
    return new Response(err instanceof VoiceError ? err.message : "Couldn't play the sample.", { status: 502 });
  }
}
