import { NextResponse } from "next/server";
import { sendWeeklyCheckins } from "@/lib/data/checkins";

// Vercel Cron calls this on Mondays (vercel.json) with "Authorization: Bearer $CRON_SECRET".
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await sendWeeklyCheckins();
  console.log("[weekly-checkin]", JSON.stringify(result));
  return NextResponse.json(result);
}
