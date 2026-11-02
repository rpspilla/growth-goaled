"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { founderContext } from "@/lib/data/founder-context";
import { attachFiles, FEEDBACK_KINDS, giveFeedback, removeFact, retryLastMessage, sendMessage, startConversation, updateFact, type ChatResult } from "@/lib/data/chat";
import { createPlanCheckout, PlanCheckoutError, requestPlanUpdate, setStepDone, submitPlan, writePlan } from "@/lib/data/action-plans";
import { processInboxDocument } from "@/lib/data/documents";
import { stripeConfigured } from "@/lib/stripe";

/** The signed-in founder and their company: conversations are only ever read or changed within it. */
async function founderCompany() {
  const { user, company } = await founderContext();
  if (!company) throw new Error("No company yet.");
  return { user, company };
}

export type StartState = { error?: string };

/** A conversation starter (or "Something else" with the founder's words): opens the conversation once it's answered. */
export async function startChatAction(_prev: StartState, formData: FormData): Promise<StartState> {
  const { user, company } = await founderCompany();
  const topic = z.string().max(40).safeParse(formData.get("topic"));
  const text = formData.get("text");
  if (!topic.success) return { error: "Pick a question." };
  const result = await startConversation(user, company, topic.data, typeof text === "string" ? text : null);
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  redirect(`/chat/${result.conversationId}`);
}

/** A Library question's "build my action plan": opens (and answers) the matching conversation. */
export async function startTopicAction(formData: FormData): Promise<void> {
  const { user, company } = await founderCompany();
  const topic = z.string().max(40).safeParse(formData.get("topic"));
  if (!topic.success) return;
  const result = await startConversation(user, company, topic.data, null);
  if (!result.ok) return;
  revalidatePath("/", "layout");
  redirect(`/chat/${result.conversationId}`);
}

const id = z.uuid();

export async function sendMessageAction(conversationId: string, text: string): Promise<ChatResult> {
  const { user, company } = await founderCompany();
  const conv = id.safeParse(conversationId);
  if (!conv.success || typeof text !== "string") return { ok: false, error: "That message couldn't be sent." };
  const result = await sendMessage(user, company, conv.data, text);
  revalidatePath(`/chat/${conv.data}`);
  return result;
}

export async function retryMessageAction(conversationId: string): Promise<ChatResult> {
  const { user, company } = await founderCompany();
  const conv = id.safeParse(conversationId);
  if (!conv.success) return { ok: false, error: "Nothing to retry." };
  const result = await retryLastMessage(user, company, conv.data);
  revalidatePath(`/chat/${conv.data}`);
  return result;
}

export async function feedbackAction(recommendationId: string, kind: string, note: string | null): Promise<ChatResult> {
  const { user, company } = await founderCompany();
  const rec = id.safeParse(recommendationId);
  const k = z.enum(FEEDBACK_KINDS).safeParse(kind);
  if (!rec.success || !k.success) return { ok: false, error: "That feedback isn't valid." };
  const result = await giveFeedback(user, company, rec.data, k.data, typeof note === "string" ? note : null);
  revalidatePath("/chat", "layout");
  return result;
}

export async function updateFactAction(factId: string, value: string): Promise<ChatResult> {
  const { user, company } = await founderCompany();
  const fact = id.safeParse(factId);
  if (!fact.success || typeof value !== "string") return { ok: false, error: "That change isn't valid." };
  const result = await updateFact(user, company, fact.data, value);
  revalidatePath("/chat");
  return result;
}

export async function removeFactAction(factId: string): Promise<ChatResult> {
  const { company } = await founderCompany();
  const fact = id.safeParse(factId);
  if (!fact.success) return { ok: false, error: "That change isn't valid." };
  const result = await removeFact(company, fact.data);
  revalidatePath("/chat");
  return result;
}

/** "Build my action plan": Stripe Checkout for $499 once or $799 a month. Nothing starts until Stripe confirms payment. */
export async function buyPlanAction(conversationId: string, tier: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { user, company } = await founderCompany();
  const conv = id.safeParse(conversationId);
  const t = z.enum(["plan", "supported"]).safeParse(tier);
  if (!conv.success || !t.success) return { ok: false, error: "That plan isn't available." };
  if (!stripeConfigured()) return { ok: false, error: "Payments aren't set up yet. Please try again later." };
  const h = await headers();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  try {
    return { ok: true, url: await createPlanCheckout(user, company, conv.data, t.data, appUrl) };
  } catch (err) {
    if (err instanceof PlanCheckoutError) return { ok: false, error: err.message };
    console.error("[stripe] Plan checkout failed", err);
    return { ok: false, error: "We couldn't start the payment. Please try again." };
  }
}

/** The founder submits a $499 plan: it's drafted after the response, then goes to an advisor for approval. */
export async function submitPlanAction(planId: string): Promise<ChatResult> {
  const { user, company } = await founderCompany();
  const plan = id.safeParse(planId);
  if (!plan.success) return { ok: false, error: "That plan isn't available." };
  const result = await submitPlan(user, company, plan.data);
  if (result.ok) after(() => writePlan(plan.data));
  revalidatePath("/chat", "layout");
  return result;
}

/** Supported plan: bring the plan up to date with the conversation (written after the response). */
export async function updatePlanAction(planId: string): Promise<ChatResult> {
  const { company } = await founderCompany();
  const plan = id.safeParse(planId);
  if (!plan.success) return { ok: false, error: "That plan isn't available." };
  const result = await requestPlanUpdate(company, plan.data);
  if (result.ok) after(() => writePlan(plan.data));
  return result;
}

export async function stepDoneAction(planId: string, period: string, index: number, done: boolean): Promise<ChatResult> {
  const { company } = await founderCompany();
  const plan = id.safeParse(planId);
  const p = z.enum(["days30", "days60", "days90"]).safeParse(period);
  if (!plan.success || !p.success || !Number.isInteger(index) || index < 0) return { ok: false, error: "That change isn't valid." };
  const result = await setStepDone(company, plan.data, p.data, index, Boolean(done));
  revalidatePath("/chat", "layout");
  return result;
}

const fileInput = z.object({ pathname: z.string().min(1).max(1024), filename: z.string().min(1).max(255), contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional() });

/** Files attached in the conversation: stored, then read, extracted and sorted after the response, like any upload. */
export async function attachFilesAction(conversationId: string, files: z.infer<typeof fileInput>[]): Promise<ChatResult> {
  const { user, company } = await founderCompany();
  const conv = id.safeParse(conversationId);
  const parsed = z.array(fileInput).max(10).safeParse(files);
  if (!conv.success || !parsed.success) return { ok: false, error: "Invalid upload." };
  try {
    const result = await attachFiles(user, company, conv.data, parsed.data);
    if (!result.ok) return result;
    for (const docId of result.process) after(() => processInboxDocument(docId));
    revalidatePath(`/chat/${conv.data}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }
}
