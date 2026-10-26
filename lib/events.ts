import "server-only";
import { db, schema } from "@/lib/db";

export type EventName =
  | "intake_section_completed"
  | "document_uploaded"
  | "extraction_completed"
  | "register_item_resolved"
  | "deliverable_published"
  | "deliverable_viewed"
  | "source_trail_opened"
  | "review_decision"
  | "invite_sent"
  | "invite_accepted"
  | "benchmark_unlocked"
  | "library_viewed"
  | "use_case_viewed"
  | "objective_saved"
  | "checkout_started"
  | "use_case_activated"
  | "snapshot_viewed"
  | "advisory_requested"
  | "advisory_link_opened"
  | "analysis_requested";

/** Records a product analytics event. Never throws: analytics must not break the action it measures. */
export async function track(name: EventName, p: { userId?: string; companyId?: string; props?: Record<string, unknown> } = {}) {
  try {
    await db.insert(schema.events).values({ name, userId: p.userId, companyId: p.companyId, props: p.props });
  } catch (err) {
    console.error(`[events] Failed to record ${name}`, err);
  }
}
