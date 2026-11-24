import { Fragment, type ReactNode } from "react";

/**
 * An answer in Rally's light formatting (Rally Beta, Nov 24, 2026): paragraphs, **bold**, numbered
 * and bulleted lists, and a closing "One question:" line set apart. Everything else stays plain
 * text (no HTML is ever interpreted).
 */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} style={{ color: "var(--foreground)" }}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

type Block = { kind: "p" | "ol" | "ul" | "q"; lines: string[] };

export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    const last = out.at(-1);
    if (!line) {
      if (last && last.kind === "p") out.push({ kind: "p", lines: [] });
      continue;
    }
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    const ul = line.match(/^[-•*]\s+(.*)$/);
    if (ol) {
      if (last?.kind === "ol") last.lines.push(ol[1]!);
      else out.push({ kind: "ol", lines: [ol[1]!] });
    } else if (ul) {
      if (last?.kind === "ul") last.lines.push(ul[1]!);
      else out.push({ kind: "ul", lines: [ul[1]!] });
    }
    else if (/^(one|a) (quick )?question:/i.test(line)) out.push({ kind: "q", lines: [line] });
    else if (last?.kind === "p") last.lines.push(line);
    else out.push({ kind: "p", lines: [line] });
  }
  return out.filter((b) => b.lines.length);
}

export function RichReply({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-base leading-relaxed" style={{ color: "var(--foreground)" }}>
      {blocks(text).map((b, i) =>
        b.kind === "ol" ? (
          <ol key={i} className="list-decimal pl-6 space-y-1">
            {b.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}
          </ol>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc pl-6 space-y-1">
            {b.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}
          </ul>
        ) : b.kind === "q" ? (
          <p key={i} className="pl-3 border-l-[3px]" style={{ borderColor: "var(--green)" }}>{inline(b.lines[0]!)}</p>
        ) : (
          <p key={i} className="whitespace-pre-line">{inline(b.lines.join("\n"))}</p>
        ),
      )}
    </div>
  );
}
