"use client";

import { useRef } from "react";
import { ACCEPT_ATTR } from "@/lib/documents";
import type { CategoryId } from "@/lib/readiness";
import { useReadinessUpload } from "./useReadinessUpload";

/** A file picker that uploads into a category, optionally linked to specific items. */
export function UploadButton({
  blobPrefix,
  category,
  itemKeys = [],
  label = "Upload file",
  variant = "secondary",
}: {
  blobPrefix: string;
  category: CategoryId;
  itemKeys?: string[];
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const input = useRef<HTMLInputElement>(null);
  const { send, progress, message, busy } = useReadinessUpload(blobPrefix);

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void send(file, category, itemKeys);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="text-xs px-3 py-1.5 rounded-md font-semibold border disabled:opacity-60"
        style={
          variant === "primary"
            ? { background: "var(--green)", color: "#fff", borderColor: "var(--green)" }
            : { background: "var(--card)", color: "var(--foreground)", borderColor: "var(--border)" }
        }
      >
        {progress ? `Uploading ${progress.percent}%` : label}
      </button>
      {message && (
        <p role="status" className="text-xs mt-2" style={{ color: message.kind === "ok" ? "var(--green)" : "var(--red)" }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
