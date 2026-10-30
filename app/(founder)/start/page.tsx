import { redirect } from "next/navigation";
import { founderContext } from "@/lib/data/founder-context";
import { nextAction } from "@/lib/use-cases/steps";
import { isUseCaseId } from "@/lib/use-cases";

/** Where a founder lands after signing in: their next step, not a dashboard. */
export default async function StartPage() {
  const { useCases, active } = await founderContext();
  const started = useCases.find((u) => !u.activatedAt && isUseCaseId(u.useCase));
  redirect(nextAction(active && { useCase: active.def.id, status: active.status }, started && isUseCaseId(started.useCase) ? started.useCase : null).path);
}
