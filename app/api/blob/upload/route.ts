import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getFounderCompany } from "@/lib/data/companies";
import { companyBlobPrefix } from "@/lib/data/documents";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/documents";

/**
 * Issues client-upload tokens for the private Blob store. Only signed-in
 * founders get one, and only for paths under their own company's prefix.
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
        if (!user || user.role !== "founder") throw new Error("Not allowed");
        const company = await getFounderCompany(user);
        if (!company || !pathname.startsWith(companyBlobPrefix(company.id))) throw new Error("Not allowed");
        return {
          allowedContentTypes: Object.keys(ACCEPTED_TYPES),
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
