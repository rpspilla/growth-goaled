import { portfolioCompanies } from "../../data/mock";

interface PortfolioProps {
  onCompanyClick: (name: string) => void;
}

function HealthBadge({ health }: { health: string }) {
  const config = {
    good: { bg: "var(--green-muted)", color: "var(--green)", label: "On track" },
    watch: { bg: "var(--amber-muted)", color: "var(--amber)", label: "Watch" },
    critical: { bg: "#FEE2E2", color: "var(--red)", label: "At risk" },
  }[health] ?? { bg: "var(--muted)", color: "var(--muted-foreground)", label: health };

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: config.bg, color: config.color }}
    >
      {config.label}
    </span>
  );
}

export default function Portfolio({ onCompanyClick }: PortfolioProps) {
  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-normal mb-2" style={{ color: "var(--foreground)" }}>
          Portfolio Overview
        </h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>
          Active companies across all engagement phases.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {[
          { label: "Active companies", value: "24", color: "var(--foreground)" },
          { label: "Require attention", value: "7", color: "var(--red)" },
          { label: "Awaiting founder input", value: "5", color: "var(--amber)" },
          { label: "In advisor review", value: "8", color: "var(--blue)" },
          { label: "Complete", value: "4", color: "var(--green)" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border p-4"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="font-mono text-2xl font-semibold mb-1" style={{ color }}>{value}</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          className="grid grid-cols-7 px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider"
          style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}
        >
          <div className="col-span-2">Company</div>
          <div>Stage</div>
          <div>ARR</div>
          <div>Growth</div>
          <div>Health</div>
          <div>Phase</div>
        </div>

        {portfolioCompanies.map(({ name, stage, arr, growth, health, phase, attention, gis }) => (
          <div
            key={name}
            className="grid grid-cols-7 items-center px-5 py-4 border-b cursor-pointer transition-all hover:bg-gray-50"
            style={{ borderColor: "var(--border)" }}
            onClick={() => onCompanyClick(name)}
          >
            <div className="col-span-2 flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                style={{ background: "var(--secondary)", color: "var(--foreground)" }}
              >
                {name[0]}
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{name}</div>
                <div className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>GIS {gis}</div>
              </div>
              {attention && (
                <div className="w-2 h-2 rounded-full" style={{ background: "var(--red)" }} />
              )}
            </div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{stage}</div>
            <div className="font-mono text-sm font-semibold" style={{ color: "var(--foreground)" }}>{arr}</div>
            <div className="font-mono text-sm" style={{ color: "var(--green)" }}>↑ {growth}</div>
            <div><HealthBadge health={health} /></div>
            <div>
              <span
                className="text-xs px-2 py-0.5 rounded font-medium"
                style={{ background: "var(--secondary)", color: "var(--secondary-foreground)" }}
              >
                {phase}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
