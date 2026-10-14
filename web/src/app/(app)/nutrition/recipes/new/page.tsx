import { RecipeForm } from "@/components/recipe-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New recipe" };

export default function NewRecipePage() {
  return (
    <>
      <PageHeader title="New recipe" back="/nutrition/recipes" />
      <RecipeForm />
    </>
  );
}
