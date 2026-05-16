import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";
import { UsernameForm } from "./UsernameForm";

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  // Already has a username — nothing to do here
  if (session.user.username !== null) {
    redirect("/");
  }

  return (
    <main className="flex-1 min-h-0 overflow-y-scroll">
      <PageContainer className="max-w-sm">
        <Text variant="h1" className="text-2xl mb-2">
          Welcome to PlotArmor Wiki!
        </Text>
        <Text variant="body" muted className="mb-8">
          Choose a username to complete your profile.
        </Text>
        <UsernameForm />
      </PageContainer>
    </main>
  );
}
