import { NextResponse } from "next/server";
import { sendMonthlyReminders } from "@/lib/data/reminders";

// Vercel Cron calls this daily (vercel.json) with "Authorization: Bearer $CRON_SECRET".
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await sendMonthlyReminders();
  console.log("[monthly-reminder]", JSON.stringify(result));
  return NextResponse.json(result);
}
