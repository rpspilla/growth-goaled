"use client";

import { useFormStatus } from "react-dom";

/** Starts the matching conversation; shows that it's working while the first answer is drafted. */
export function StartOptionButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Thinking it through…" : label}
    </button>
  );
}
