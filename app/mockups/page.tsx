import Link from "next/link";
import { MockupBanner } from "@/components/visual/primitives";

export default function MockupIndex() {
  return (
    <div className="p-6 sm:p-10 max-w-3xl space-y-6">
      <MockupBanner />
      <h1 className="font-display text-4xl" style={{ color: "var(--foreground)" }}>Visual-first founder flow · V0</h1>
      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/mockups/library/hire_or_fix/snapshot" className="surface p-5 block">
          <div className="label">Step 2</div>
          <div className="text-lg font-semibold mt-1" style={{ color: "var(--foreground)" }}>Growth Snapshot →</div>
        </Link>
        <Link href="/mockups/baseline" className="surface p-5 block">
          <div className="label">Step 4</div>
          <div className="text-lg font-semibold mt-1" style={{ color: "var(--foreground)" }}>Results →</div>
        </Link>
      </div>
    </div>
  );
}
