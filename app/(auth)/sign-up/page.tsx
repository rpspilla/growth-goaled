import type { Metadata } from "next";
import { RallyLanding } from "../RallyLanding";

export const metadata: Metadata = {
  title: "Rally · Your CRO. Ready when you are.",
  description: "Expert CRO judgment for the decisions that drive your growth. Free during Beta. By Growth Goaled.",
};
// The website chat's answers can take a little while.
export const maxDuration = 300;

/** Free Beta access (Rally Beta, Nov 24, 2026): the same landing as /sign-in. */
export default function SignUpPage() {
  return <RallyLanding />;
}
