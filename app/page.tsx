import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { homePathFor } from "@/lib/access";

export default async function Home() {
  const user = await requireUser();
  redirect(homePathFor(user.role));
}
