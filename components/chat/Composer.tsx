"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { Paperclip } from "lucide-react";
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

  const submit = () => {
    const t = text.trim();
    if (t && !pending) run(() => send(conversationId, t), t);
  };

  return (
    <div className="space-y-3">
      {sent && (
        <div className="flex justify-end">
          <p className="rounded-2xl px-4 py-3 text-base max-w-[85%] whitespace-pre-wrap" style={{ background: "var(--navy)", color: "#fff" }}>{sent}</p>
        </div>
      )}
      {uploading && (
        <p className="text-base" role="status" style={{ color: "var(--muted-foreground)" }}>
          Uploading {uploading}…
        </p>
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
          placeholder="Reply, add detail, or ask a follow-up…"
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
