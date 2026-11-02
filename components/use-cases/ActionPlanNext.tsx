import { ClipboardCheck } from "lucide-react";
import { getChatTopic } from "@/lib/chat/topics";

/** The paid next step on a Library question: talk it through, then build the action plan in that conversation. */
export function ActionPlanNext({ topicId, planPrice, supportedPrice, start }: { topicId: string; planPrice: string; supportedPrice: string; start: (formData: FormData) => Promise<void> }) {
  const topic = getChatTopic(topicId);
  if (!topic) return null;
  return (
    <div className="space-y-3">
      <div className="label" style={{ color: "var(--green)" }}>Next: your action plan</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-2xl leading-tight" style={{ color: "var(--foreground)" }}>30/60/90-day plan</span>
        <span className="font-mono text-xl font-semibold whitespace-nowrap" style={{ color: "var(--foreground)" }}>from {planPrice}</span>
      </div>
      <ul className="text-sm space-y-1" style={{ color: "var(--foreground)" }}>
        <li className="flex gap-2"><ClipboardCheck size={16} className="shrink-0 mt-0.5" style={{ color: "var(--green)" }} aria-hidden />Built in a conversation: share what you know and attach files as you go</li>
        <li className="flex gap-2"><ClipboardCheck size={16} className="shrink-0 mt-0.5" style={{ color: "var(--green)" }} aria-hidden />{planPrice} once: reviewed and approved by an advisor, delivered within about 24 hours</li>
        <li className="flex gap-2"><ClipboardCheck size={16} className="shrink-0 mt-0.5" style={{ color: "var(--green)" }} aria-hidden />{supportedPrice} a month: a CRO-level advisor with you in the conversation</li>
      </ul>
      <form action={start}>
        <input type="hidden" name="topic" value={topic.id} />
        <button type="submit" className="btn btn-primary btn-lg w-full">Talk it through and build my plan</button>
      </form>
      <p className="text-xs text-center" style={{ color: "var(--muted-foreground)" }}>The conversation is free; you choose a plan once you&apos;ve seen the recommendation.</p>
    </div>
  );
}
