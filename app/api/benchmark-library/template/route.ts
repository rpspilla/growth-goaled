import { requireRole } from "@/lib/auth/session";
import { csvTemplate } from "@/lib/benchmark-library/csv";

export async function GET() {
  await requireRole(["admin"]);
  return new Response(csvTemplate(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="growth-goaled-benchmark-template.csv"',
    },
  });
}
