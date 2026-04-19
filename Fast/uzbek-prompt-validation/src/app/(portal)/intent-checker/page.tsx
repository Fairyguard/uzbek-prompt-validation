import { redirect } from "next/navigation";

export default function IntentCheckerIndexPage() {
  redirect("/intent-checker/queue");
}
