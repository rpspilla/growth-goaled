import { track } from "@/lib/events";
import { validUnsubscribe } from "@/lib/data/reminders";

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:Inter,Arial,sans-serif;color:#0D1B2A;background:#F7F8FA;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px"><div style="background:#fff;border:1px solid #E2E6EC;border-radius:12px;padding:28px;max-width:420px"><h1 style="font-size:20px;margin:0 0 8px">${title}</h1><p style="font-size:15px;color:#4F5D6E;margin:0">${body}</p></div></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );

/** One-click stop for the monthly reminder (signed link in the email; no sign-in needed). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !validUnsubscribe(userId, token)) return page("Link not valid", "This unsubscribe link is incomplete or has expired. Reply to any of our emails and we'll stop them.", 400);
  await track("monthly_reminder_unsubscribed", { userId });
  return page("You're unsubscribed", "You won't get the monthly progress email any more. Your Action plan is still there whenever you want it.");
}
// Mail clients' one-click unsubscribe (RFC 8058) sends a POST.
export const POST = GET;
