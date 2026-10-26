"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { ACCEPTED_TYPES, contentTypeFor, MAX_UPLOAD_BYTES, unsupportedReason } from "@/lib/documents";
import type { CategoryId } from "@/lib/readiness";
import { registerUpload } from "@/app/(founder)/data/actions";

import { sha256 } from "./hash";

/**
 * Uploads a file to the company's private Blob folder and registers it against
 * a readiness category (and optionally specific items). Reports success,
 * duplicates and failures for the UI.
 */
export function useReadinessUpload(blobPrefix: string) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ name: string; percent: number } | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function send(file: File, category: CategoryId, itemKeys: string[] = []) {
    setMessage(null);
    const reason = unsupportedReason(file.name);
    const contentType = contentTypeFor(file.name, file.type);
    if (reason || !ACCEPTED_TYPES[contentType]) {
      setMessage({ kind: "error", text: reason ?? "Upload a PDF, Excel (.xlsx), CSV or Word (.docx) file." });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage({ kind: "error", text: "Files can be up to 25 MB." });
      return;
    }

    setProgress({ name: file.name, percent: 0 });
    try {
      const contentHash = await sha256(file);
      const blob = await upload(`${blobPrefix}${category}/${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/blob/upload",
        contentType,
        onUploadProgress: ({ percentage }) => setProgress({ name: file.name, percent: Math.round(percentage) }),
      });
      const result = await registerUpload({ pathname: blob.pathname, filename: file.name, category, itemKeys, contentHash });
      if (!result.ok) setMessage({ kind: "error", text: result.error });
      else
        setMessage({
          kind: "ok",
          text: result.duplicate
            ? `${file.name} was already uploaded, so we linked the existing copy instead of adding a duplicate.`
            : contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              ? `${file.name} uploaded. Word files are stored for your advisor but not analysed automatically.`
              : `${file.name} uploaded. We're reading it now.`,
        });
      router.refresh();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed." });
    } finally {
      setProgress(null);
    }
  }

  return { send, progress, message, busy: progress !== null };
}
