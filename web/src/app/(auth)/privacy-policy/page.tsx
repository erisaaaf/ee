import Link from "next/link";
import { Card } from "@/components/ui";

export const metadata = { title: "Privacy" };

export default function PrivacyPolicyPage() {
  return (
    <Card className="space-y-4 p-6 text-sm leading-relaxed">
      <h1 className="text-xl font-semibold">How Vitality handles your data</h1>
      <p className="text-muted">A plain-language summary of what this app does. It is not a legal compliance statement — the operator of this server is responsible for that.</p>
      <section>
        <h2 className="font-semibold">What we collect, and why</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Account: email and a securely hashed password (scrypt). Name is optional.</li>
          <li>Profile details like age, height and weight are optional and only used for estimates you can see and change.</li>
          <li>What you log (food, water, workouts, sports, sleep, wellbeing) — so the app can show your progress.</li>
          <li>Wellbeing notes, AI conversations, two-factor secrets and movement limitations are encrypted in the database.</li>
        </ul>
      </section>
      <section>
        <h2 className="font-semibold">AI</h2>
        <p>
          AI features are optional. When you use them, only the data needed for that request — and only from categories you allow in Privacy settings — is sent to the AI provider (Anthropic). Photos you analyse are not stored.
          Proposed changes (like logging food) are only saved after you confirm them.
        </p>
      </section>
      <section>
        <h2 className="font-semibold">Your controls</h2>
        <p>In Settings → Privacy you can see what is stored, export everything as JSON, delete individual categories, disconnect integrations, turn AI off, or permanently delete your account and all associated data.</p>
      </section>
      <section>
        <h2 className="font-semibold">Not medical advice</h2>
        <p>Vitality provides general wellness information. Calorie targets, photo analysis and recovery overviews are estimates. For medical concerns, please talk to a qualified professional.</p>
      </section>
      <Link href="/login" className="inline-block text-primary hover:underline">
        Back
      </Link>
    </Card>
  );
}
