import { getAuth } from "@/lib/auth/server";

type Ctx = { params: Promise<{ path: string[] }> };

export function GET(request: Request, ctx: Ctx) {
  return getAuth().handler().GET(request, ctx);
}

export function POST(request: Request, ctx: Ctx) {
  return getAuth().handler().POST(request, ctx);
}
