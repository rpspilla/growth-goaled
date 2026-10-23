import { redirect } from "next/navigation";

/** Document upload now lives inside Growth Data Readiness. */
export default function UploadPage() {
  redirect("/readiness");
}
