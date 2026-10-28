import Link from "next/link";
import type { ReactNode } from "react";
import type { Dashboard } from "@/lib/data/dashboard";
import { ScoreBar } from "./ScoreBar";
import { initials } from "@/components/shell/initials";

function MetricCard({ label, value, sub, trend }: Dashboard["metrics"][number]) {
  return (
    <div className="rounded-xl p-5 border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="label mb-2" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="font-mono text-2xl font-semibold" style={{ color: "var(--foreground)" }}>{value}</div>
      {sub && (
        <div
          className="flex items-center gap-1 text-xs mt-1"
          style={{ color: trend === "up" ? "var(--green)" : trend === "down" ? "var(--red)" : "var(--muted-foreground)" }}
        >
          {trend === "up" && "↑ "}
          {trend === "down" && "↓ "}
          {sub}
        </div>
      )}
    </div>
  );
}

function MaybeLink({ href, className, style, children }: { href: string | null; className: string; style: React.CSSProperties; children: ReactNode }) {
  return href ? (
    <Link href={href} className={className} style={style}>{children}</Link>
  ) : (
    <div className={className} style={{ ...style, cursor: "default" }}>{children}</div>
  );
}

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const today = () =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(
    new Date(),
  );

/**
 * Founder dashboard. `hrefFor` maps an app path ("/benchmark") to a link for
 * this context, or null when that page isn't available (e.g. in the sample).
 */
export function DashboardView({ data, hrefFor }: { data: Dashboard; hrefFor: (path: string) => string | null }) {
  const bench = data.benchmark;
  const published = new Set<string>(data.published);
  const quick = [
    { type: "icp", title: "ICP Analysis", path: "/icp", cta: "View ICP →", icon: "🎯" },
    { type: "channels", title: "Channel Strategy", path: "/channels", cta: "Explore →", icon: "📡" },
    { type: "hiring", title: "Hiring Plan", path: "/hiring", cta: "See Plan →", icon: "👥" },
  ];

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <div className="label mb-2" style={{ color: "var(--muted-foreground)" }}>{today()}</div>
        <h1 className="font-display text-3xl font-normal mb-1" style={{ color: "var(--foreground)" }}>Welcome back, {data.companyName}</h1>
        <p className="text-base" style={{ color: "var(--muted-foreground)" }}>Here&apos;s where your growth engine stands today.</p>
      </div>

      {data.metrics.length > 0 && (
        <div className="grid grid-cols-6 gap-4 mb-6">
          {data.metrics.map((m) => (
            <MetricCard key={m.label} {...m} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Growth Intelligence Score */}
        <div className="col-span-1 rounded-xl border p-6 flex flex-col" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="label mb-4" style={{ color: "var(--muted-foreground)" }}>
            Growth Intelligence Score
          </div>
          {data.score ? (
            <>
              <div className="flex items-end gap-1.5 mb-1">
                <span className="font-mono text-5xl font-semibold leading-none" style={{ color: "var(--foreground)" }}>{data.score.value}</span>
                <span className="text-xl mb-1" style={{ color: "var(--muted-foreground)" }}>/100</span>
              </div>
              <ScoreBar value={data.score.value} />
              {data.score.label && (
                <div className="text-sm font-medium mb-5 leading-snug" style={{ color: "var(--foreground)" }}>{data.score.label}</div>
              )}
            </>
          ) : (
            <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
              Your score appears once your advisor has reviewed your benchmark.
            </p>
          )}

          {bench && (
            <div className="space-y-4 flex-1">
              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: "var(--green)" }}>Strengths</div>
                {bench.summary.strengths.map((s) => (
                  <div key={s.claimKey} className="flex items-start gap-2 text-xs mb-1.5" style={{ color: "var(--foreground)" }}>
                    <span style={{ color: "var(--green)", marginTop: "1px" }}>✓</span> {s.text}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs font-semibold mb-2" style={{ color: "var(--amber)" }}>Watch Areas</div>
                {bench.summary.watchAreas.map((s) => (
                  <div key={s.claimKey} className="flex items-start gap-2 text-xs mb-1.5" style={{ color: "var(--foreground)" }}>
                    <span style={{ color: "var(--amber)", marginTop: "1px" }}>⚠</span> {s.text}
                  </div>
                ))}
              </div>
              <div className="rounded-lg p-3" style={{ background: "var(--navy)", borderLeft: "3px solid var(--green)" }}>
                <div className="text-xs font-semibold mb-1" style={{ color: "var(--green)" }}>Priority</div>
                <div className="text-xs leading-relaxed" style={{ color: "#C8D3E0" }}>{bench.summary.priority.text}</div>
              </div>
            </div>
          )}

          {bench && hrefFor("/benchmark") && (
            <Link
              href={hrefFor("/benchmark")!}
              className="mt-4 w-full py-2.5 rounded-lg text-sm font-semibold text-center transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: "var(--green)", color: "#fff" }}
            >
              See Why →
            </Link>
          )}
        </div>

        <div className="col-span-2 space-y-4">
          {/* Benchmark preview */}
          {bench ? (
            <MaybeLink
              href={hrefFor("/benchmark")}
              className="block rounded-xl border p-5 transition-all hover:shadow-sm"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Benchmark Position</div>
                {bench.cohort.companyCount != null && (
                  <span className="text-xs" style={{ color: "var(--green)" }}>vs. {bench.cohort.companyCount} comparable companies →</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {bench.rows.slice(0, 3).map((r) => (
                  <div key={r.metric} className="rounded-lg p-3" style={{ background: "var(--muted)" }}>
                    <div className="text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>{r.label}</div>
                    <div className="font-mono font-semibold text-lg" style={{ color: "var(--foreground)" }}>{r.value}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: r.status === "behind" ? "var(--amber)" : "var(--green)" }} />
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Top: {r.topQuartile}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg px-4 py-3 text-sm font-medium" style={{ background: "#FEF3C7", color: "#92400E" }}>
                ⚡ {bench.insight.headline}
              </div>
            </MaybeLink>
          ) : (
            <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>Benchmark Position</div>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Your benchmark is published here once your advisor approves it.
              </p>
            </div>
          )}

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-4">
            {quick.map((q) => {
              const ready = published.has(q.type);
              return (
                <MaybeLink
                  key={q.type}
                  href={ready ? hrefFor(q.path) : null}
                  className="rounded-xl border p-4 text-left transition-all hover:shadow-sm"
                  style={{ background: "var(--card)", borderColor: "var(--border)", opacity: ready ? 1 : 0.7 }}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{q.icon}</span>
                    <div>
                      <div className="text-sm font-semibold mb-0.5" style={{ color: "var(--foreground)" }}>{q.title}</div>
                      <div className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
                        {ready ? "Published by your advisor" : "Not yet published"}
                      </div>
                      <div className="text-xs font-semibold" style={{ color: ready ? "var(--green)" : "var(--muted-foreground)" }}>
                        {ready ? q.cta : "Coming next"}
                      </div>
                    </div>
                  </div>
                </MaybeLink>
              );
            })}
            <MaybeLink
              href={hrefFor("/questions")}
              className="rounded-xl border p-4 text-left transition-all hover:shadow-sm"
              style={{ background: "var(--card)", borderColor: data.openQuestions > 0 ? "var(--amber)" : "var(--border)" }}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">❓</span>
                <div>
                  <div className="text-sm font-semibold mb-0.5" style={{ color: "var(--foreground)" }}>Open Questions</div>
                  <div className="text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
                    {data.openQuestions > 0
                      ? `${data.openQuestions} ${data.openQuestions === 1 ? "question needs" : "questions need"} your input`
                      : "Nothing needs your input"}
                  </div>
                  <div className="text-xs font-semibold" style={{ color: data.openQuestions > 0 ? "var(--amber)" : "var(--green)" }}>
                    {data.openQuestions > 0 ? "Resolve →" : "All clear"}
                  </div>
                </div>
              </div>
            </MaybeLink>
          </div>

          {/* Advisor approval */}
          {bench?.approval && (
            <div className="rounded-xl border p-4 flex items-center gap-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0"
                style={{ background: "var(--green-muted)", color: "var(--green)" }}
              >
                {initials(bench.approval.reviewerName, "advisor")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold mb-0.5" style={{ color: "var(--foreground)" }}>
                  {bench.approval.reviewerName ?? "Your advisor"} approved your benchmark
                </div>
                <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                  {bench.approval.comment ? `“${bench.approval.comment}” · ` : ""}
                  {relativeTime(bench.approval.at)}
                </div>
              </div>
              {hrefFor("/benchmark") && (
                <Link
                  href={hrefFor("/benchmark")!}
                  className="text-xs font-medium px-3 py-1.5 rounded-md shrink-0"
                  style={{ background: "var(--muted)", color: "var(--foreground)" }}
                >
                  View
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
