import { useState } from "react";

const docTypes = [
  { id: "board", label: "Board deck", icon: "📊", accepted: true },
  { id: "financial", label: "Financial model", icon: "📈", accepted: true },
  { id: "customers", label: "Customer list", icon: "👥", accepted: false },
  { id: "gtm", label: "GTM plan", icon: "🎯", accepted: false },
  { id: "sales", label: "Sales presentation", icon: "💼", accepted: false },
  { id: "hiring", label: "Hiring plan", icon: "🗺️", accepted: false },
];

type DocState = "idle" | "analyzing" | "complete";

interface DocStatus {
  id: string;
  state: DocState;
  dataPoints?: number;
  assumptions?: number;
}

export default function Upload({ onContinue }: { onContinue: () => void }) {
  const [docs, setDocs] = useState<DocStatus[]>([
    { id: "board", state: "complete", dataPoints: 47, assumptions: 6 },
    { id: "financial", state: "complete", dataPoints: 83, assumptions: 4 },
  ]);
  const [dragging, setDragging] = useState(false);

  function simulateUpload(id: string) {
    setDocs((prev) => {
      const exists = prev.find((d) => d.id === id);
      if (exists) return prev;
      return [...prev, { id, state: "analyzing" }];
    });

    setTimeout(() => {
      setDocs((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, state: "complete", dataPoints: Math.floor(Math.random() * 40) + 20, assumptions: Math.floor(Math.random() * 5) + 1 }
            : d
        )
      );
    }, 2200);
  }

  function getDocStatus(id: string): DocStatus | undefined {
    return docs.find((d) => d.id === id);
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Bring your existing data.
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          Upload documents and Growth Goaled extracts structured intelligence — not summaries.
        </p>
      </div>

      {/* Google Drive */}
      <div
        className="rounded-xl border p-4 mb-6 flex items-center justify-between"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: "#EBF0FF" }}>📁</div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Google Drive</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>Phase 1 integration · Connect to import directly</div>
          </div>
        </div>
        <button
          className="px-4 py-2 rounded-lg text-sm font-medium border transition-all hover:bg-opacity-90"
          style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "transparent" }}
        >
          Connect Drive
        </button>
      </div>

      {/* Drop zone */}
      <div
        className="rounded-xl border-2 border-dashed p-8 mb-6 text-center transition-all cursor-pointer"
        style={{
          borderColor: dragging ? "var(--green)" : "var(--border)",
          background: dragging ? "var(--green-muted)" : "var(--muted)",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); }}
        onClick={() => simulateUpload(docTypes.find((d) => !getDocStatus(d.id))?.id ?? "")}
      >
        <div className="text-3xl mb-2">⬆️</div>
        <div className="text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>
          Drop files here or click to upload
        </div>
        <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          PDF, Excel, PowerPoint · Max 50MB per file
        </div>
      </div>

      {/* Document list */}
      <div className="space-y-3">
        {docTypes.map((doc) => {
          const status = getDocStatus(doc.id);
          return (
            <div
              key={doc.id}
              className="rounded-xl border p-4 flex items-center gap-4 transition-all"
              style={{
                background: "var(--card)",
                borderColor: status?.state === "complete" ? "var(--green)" : status?.state === "analyzing" ? "var(--amber)" : "var(--border)",
              }}
            >
              <span className="text-xl">{doc.icon}</span>
              <div className="flex-1">
                <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{doc.label}</div>
                {status?.state === "analyzing" && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{ background: "var(--amber)", animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                    <span className="text-xs" style={{ color: "var(--amber)" }}>Analyzing document...</span>
                  </div>
                )}
                {status?.state === "complete" && (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs" style={{ color: "var(--green)" }}>
                      {status.dataPoints} data points identified
                    </span>
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>·</span>
                    <span className="text-xs" style={{ color: "var(--amber)" }}>
                      {status.assumptions} assumptions need review
                    </span>
                  </div>
                )}
              </div>
              {!status && (
                <button
                  onClick={() => simulateUpload(doc.id)}
                  className="text-xs px-3 py-1.5 rounded-md font-medium"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                >
                  Upload
                </button>
              )}
              {status?.state === "complete" && (
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--green)" }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={onContinue}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: "var(--green)", color: "#fff" }}
        >
          Build My Growth Profile →
        </button>
      </div>
    </div>
  );
}
