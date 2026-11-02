"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { founderContext } from "@/lib/data/founder-context";
import { FEEDBACK_KINDS, giveFeedback, removeFact, retryLastMessage, sendMessage, startConversation, updateFact, type ChatResult } from "@/lib/data/chat";

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
