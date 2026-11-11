import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getFounderCompany, getManagedCompany } from "@/lib/data/companies";
import { contractBlobPrefix } from "@/lib/contracts";
import { companyBlobPrefix } from "@/lib/data/documents";
import { ACCEPTED_TYPES, INBOX_FOLDER, MAX_UPLOAD_BYTES } from "@/lib/documents";

/**
 * Issues client-upload tokens for the private Blob store: founders for paths under their own
 * company's prefix, staff for contracts of companies they manage.
 * Uploads are registered afterwards by the upload page's server action.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getCurrentUser();
        // Staff upload signed contracts to a company they manage (contracts/<companyId>/…).
        if (user && (user.role === "advisor" || user.role === "admin") && pathname.startsWith("contracts/")) {
          const companyId = pathname.split("/")[1] ?? "";
          if (!/^[0-9a-f-]{36}$/.test(companyId) || !(await getManagedCompany(user, companyId)) || !pathname.startsWith(contractBlobPrefix(companyId))) throw new Error("Not allowed");
          return { allowedContentTypes: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "image/png", "image/jpeg"], maximumSizeInBytes: MAX_UPLOAD_BYTES, addRandomSuffix: true };
        }
        if (!user || user.role !== "founder") throw new Error("Not allowed");
        const company = await getFounderCompany(user);
        if (!company || !pathname.startsWith(companyBlobPrefix(company.id))) throw new Error("Not allowed");
        // The inbox ("upload whatever you have") takes any file type; checklist uploads only readable ones.
        const inbox = pathname.startsWith(companyBlobPrefix(company.id) + INBOX_FOLDER);
        return {
          allowedContentTypes: inbox ? undefined : Object.keys(ACCEPTED_TYPES),
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
