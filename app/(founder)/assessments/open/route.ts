import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { isUseCaseActive } from "@/lib/data/use-cases";
import { isUseCaseId } from "@/lib/use-cases";
import { USE_CASE_COOKIE } from "@/lib/use-cases/cookie";

/** Opens one of the founder's purchased assessments: makes it the active one, then shows its results. */
export async function GET(request: NextRequest) {
  const user = await requireRole(["founder"]);
  const company = await getFounderCompany(user);
  const useCase = request.nextUrl.searchParams.get("use_case");
  if (!company || !useCase || !isUseCaseId(useCase) || !(await isUseCaseActive(company.id, useCase))) {
    return NextResponse.redirect(new URL("/assessments", request.url));
  }
  (await cookies()).set(USE_CASE_COOKIE, useCase, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return NextResponse.redirect(new URL("/baseline", request.url));
}
