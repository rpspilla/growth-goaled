"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const SIZE = 512;
const MAX_INPUT = 10 * 1024 * 1024;

/** Square-crop from the centre and resize to 512×512 JPEG in the browser, so any phone photo uploads small. */
async function resize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(SIZE, side);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))), "image/jpeg", 0.88));
}

/** The CRO's profile photo: drop an image on the circle or click to choose one; it saves straight away. */
export function CroPhotoUpload({ name, photoUrl, upload, remove }: { name: string; photoUrl: string | null; upload: (f: FormData) => Promise<Result<{ url: string }>>; remove: () => Promise<Result> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(photoUrl);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function send(file: File | undefined) {
    if (!file || busy) return;
    setMsg(null);
    if (!/^image\/(jpeg|png|webp|heic|heif|gif|avif)$/.test(file.type)) return setMsg({ kind: "error", text: "Use a JPG, PNG or WebP image." });
    if (file.size > MAX_INPUT) return setMsg({ kind: "error", text: "That photo is too large. Use one under 10 MB." });
    setBusy(true);
    try {
      const f = new FormData();
      f.set("photo", new File([await resize(file)], "photo.jpg", { type: "image/jpeg" }));
      const r = await upload(f);
      if (r.ok) {
        setUrl(r.url);
        setMsg({ kind: "ok", text: "Photo saved." });
        router.refresh();
      } else setMsg({ kind: "error", text: r.error });
    } catch {
      setMsg({ kind: "error", text: "Couldn't read that image. Try a JPG or PNG." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function clear() {
    setBusy(true);
    const r = await remove();
    setBusy(false);
    if (r.ok) {
      setUrl(null);
      setMsg({ kind: "ok", text: "Photo removed." });
      router.refresh();
    } else setMsg({ kind: "error", text: r.error });
  }

  return (
    <div className="flex items-center gap-4 md:col-span-2" role="group" aria-label="Profile photo">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void send(e.dataTransfer.files[0]);
        }}
        disabled={busy}
        aria-label={url ? "Replace the photo" : "Upload a photo"}
        className="relative w-24 h-24 rounded-full overflow-hidden shrink-0 grid place-items-center border-2 border-dashed transition-colors"
        style={{ borderColor: over ? "var(--primary)" : "var(--border)", background: over ? "var(--muted)" : "transparent" }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${name}'s photo`} className="w-full h-full object-cover" />
        ) : (
          <ImageUp aria-hidden className="w-7 h-7" style={{ color: "var(--muted-foreground)" }} />
        )}
        {busy && <span className="absolute inset-0 grid place-items-center text-xs" style={{ background: "rgba(0,0,0,.45)", color: "white" }}>Saving…</span>}
      </button>
      <div className="space-y-1 text-sm">
        <p className="label">Profile photo</p>
        <p style={{ color: "var(--muted-foreground)" }}>
          Drag a photo onto the circle, or{" "}
          <button type="button" className="link" onClick={() => input.current?.click()} disabled={busy}>
            choose a file
          </button>
          . JPG, PNG or WebP; it&apos;s cropped square and saved straight away.
        </p>
        {url && (
          <button type="button" className="link inline-flex items-center gap-1" onClick={clear} disabled={busy}>
            <Trash2 aria-hidden className="w-3.5 h-3.5" /> Remove photo
          </button>
        )}
        {msg && (
          <p role="status" style={{ color: msg.kind === "error" ? "var(--red)" : "var(--green)" }}>
            {msg.text}
          </p>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" aria-label="Photo file" onChange={(e) => void send(e.target.files?.[0])} />
    </div>
  );
}
