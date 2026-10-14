import { PlanEditor } from "@/components/plan-editor";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New workout plan" };

export default function NewPlanPage() {
  return (
    <>
      <PageHeader title="New workout plan" back="/workout" />
      <PlanEditor />
    </>
  );
}
