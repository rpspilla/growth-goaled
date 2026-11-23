import { getCurrentUser } from "@/lib/auth/session";
import { croPhoto } from "@/lib/data/cro";

/** A CRO's uploaded profile photo: public once they're published (the network pages show it), staff-only before. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentUser().catch(() => null);
  const photo = await croPhoto((await params).id, viewer);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.mime,
      // The URL carries ?v=<upload time>, so a new photo is a new URL.
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
