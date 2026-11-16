import type { ProjectDocument } from "@/lib/db/schema";

/** Where a project document opens: its link, or the private download for an uploaded file. */
export const documentHref = (d: Pick<ProjectDocument, "id" | "url">) => d.url ?? `/api/project-files/${d.id}`;

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
export const projectDay = day;
