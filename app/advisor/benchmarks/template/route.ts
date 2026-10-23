import { requireRole } from "@/lib/auth/session";
import { csvTemplate } from "@/lib/benchmarks";

export async function GET() {
  await requireRole(["advisor", "admin"]);
  return new Response(csvTemplate(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="growth-goaled-benchmarks-template.csv"',
    },
  });
}
