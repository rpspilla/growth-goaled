"use client";

import { useEffect, useState } from "react";

/** Growth Intelligence Score bar that animates in on mount. */
export function ScoreBar({ value }: { value: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(value), 200);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <div className="h-2 rounded-full mb-3 overflow-hidden" style={{ background: "var(--muted)" }}>
      <div
        className="h-2 rounded-full"
        style={{
          width: `${width}%`,
          background: "linear-gradient(90deg, var(--green) 0%, #22C55E 100%)",
          transition: "width 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  );
}
