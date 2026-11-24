import { setBetaOffForE2e } from "@/lib/beta";

/** End-to-end tests only: POST {"off": true} runs the app as it will be after the Rally Beta. 404 everywhere else. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { off?: unknown };
  return setBetaOffForE2e(body.off === true) ? Response.json({ ok: true }) : new Response("Not found", { status: 404 });
}
