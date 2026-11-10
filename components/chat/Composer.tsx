"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FileProgress } from "./FileProgress";
import { upload } from "@vercel/blob/client";
import { Paperclip, Upload } from "lucide-react";
import { contentTypeFor, INBOX_FOLDER, MAX_UPLOAD_BYTES } from "@/lib/documents";
import { sha256 } from "@/components/readiness/hash";

type Result = { ok: boolean; error?: string };
type Attach = (conversationId: string, files: { pathname: string; filename: string; contentHash?: string }[]) => Promise<Result>;

/** The founder's reply box. Shows their message straight away while the answer is prepared. */
export function Composer({
  conversationId,
  send,
  retry,
  awaitingAnswer,
  attach,
  blobPrefix,
}: {
  conversationId: string;
  send: (conversationId: string, text: string) => Promise<Result>;
  retry: (conversationId: string) => Promise<Result>;
  /** The last message is the founder's and has no answer (an earlier turn failed). */
  awaitingAnswer: boolean;
  /** Files in the conversation: uploaded to the company's private store, then read like any upload. */
  attach?: Attach;
  blobPrefix?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // The message shows and the box clears straight away: updates inside the async transition are held
  // by React until the answer arrives, which made the page look frozen.
  const run = (fn: () => Promise<Result>, message: string | null) => {
    setError(null);
    setSent(message);
    if (message !== null) setText("");
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        if (message !== null) setText(message);
        setError(r.error ?? "Something went wrong.");
      }
      router.refresh();
      // Cleared together with the refreshed conversation, so the message never blinks out.
      start(() => setSent(null));
    });
  };

  async function sendFiles(list: File[]) {
    if (!attach || !blobPrefix || !list.length) return;
    setError(null);
    const files: { pathname: string; filename: string; contentHash?: string }[] = [];
    try {
      for (const file of list.slice(0, 10)) {
        if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is over 25 MB.`);
        if (file.size === 0) throw new Error(`${file.name} is empty.`);
        setUploading(file.name);
        const contentHash = await sha256(file);
        const blob = await upload(`${blobPrefix}${INBOX_FOLDER}${file.name}`, file, { access: "private", handleUploadUrl: "/api/blob/upload", contentType: contentTypeFor(file.name, file.type) });
        files.push({ pathname: blob.pathname, filename: file.name, contentHash });
      }
      const r = await attach(conversationId, files);
      if (!r.ok) setError(r.error ?? "Upload failed.");
    } catch (err) {
      setError(err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed.");
    } finally {
      setUploading(null);
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    }
  }

  // Drag and drop anywhere on the page: files dropped here are shared like the paperclip.
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const canDrop = Boolean(attach && blobPrefix);
  const sendRef = useRef(sendFiles);
  useEffect(() => {
    sendRef.current = sendFiles;
  });
  useEffect(() => {
    if (!canDrop) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void sendRef.current(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [canDrop]);

  const submit = () => {
    const t = text.trim();
    if (t && !pending) run(() => send(conversationId, t), t);
  };

  return (
    <div className="space-y-3">
      {dragging && (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none" style={{ background: "rgba(13,27,42,0.55)" }}>
          <div className="rounded-2xl px-8 py-7 text-center max-w-sm" style={{ background: "var(--card)", border: "2px dashed var(--green)" }}>
            <Upload size={28} className="mx-auto mb-2" style={{ color: "var(--green)" }} aria-hidden />
            <div className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Drop to share in this conversation</div>
            <div className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>Any file, up to 25 MB each and 10 at a time. We&apos;ll read it and use what&apos;s in it.</div>
          </div>
        </div>
      )}
      {sent && (
        <div className="flex justify-end">
          <p className="rounded-2xl px-4 py-3 text-base max-w-[85%] whitespace-pre-wrap" style={{ background: "var(--navy)", color: "#fff" }}>{sent}</p>
        </div>
      )}
      {uploading && (
        <div className="flex justify-end">
          <div className="rounded-2xl px-4 py-3 text-base w-full max-w-[85%]" style={{ background: "var(--navy)", color: "#fff" }}>
            Sharing {uploading}
            <FileProgress key={uploading} filename={uploading} uploading />
          </div>
        </div>
      )}
      {pending && (
        <p className="text-base" role="status" style={{ color: "var(--muted-foreground)" }}>
          Thinking it through with what we know about your company…
        </p>
      )}
      {error && (
        <div role="alert" className="rounded-lg px-4 py-3 text-base flex items-center gap-3 flex-wrap" style={{ background: "var(--red-muted, var(--muted))", color: "var(--foreground)" }}>
          <span className="flex-1">{error}</span>
        </div>
      )}
      {awaitingAnswer && !pending && (
        <button type="button" className="btn btn-secondary" onClick={() => run(() => retry(conversationId), null)}>
          Get the answer again
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="surface p-3 flex gap-3 items-end"
      >
        {attach && blobPrefix && (
          <>
            <input ref={fileInput} type="file" multiple className="sr-only" id="chat-files" onChange={(e) => sendFiles([...(e.target.files ?? [])])} />
            <label htmlFor="chat-files" className="btn btn-secondary cursor-pointer" title="Attach files" aria-label="Attach files">
              <Paperclip size={18} aria-hidden />
            </label>
          </>
        )}
        <label htmlFor="chat-reply" className="sr-only">Your reply</label>
        <textarea
          id="chat-reply"
          rows={2}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={canDrop ? "Reply, ask a follow-up, or drop files here…" : "Reply, add detail, or ask a follow-up…"}
          className="field flex-1 resize-y"
          disabled={pending}
        />
        <button type="submit" className="btn btn-primary" disabled={pending || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
