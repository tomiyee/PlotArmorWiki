import { auth } from "@/auth";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { UserMenu } from "@/components/navbar/UserMenu";

/**
 * Server Component that reads the Auth.js session and renders either a
 * "Sign in" button (unauthenticated) or a user avatar dropdown
 * (authenticated). Rendered in the root layout so it is never stale.
 *
 * @example
 * // Inside a Server Component layout:
 * <AuthControls />
 */
export async function AuthControls() {
  const session = await auth();

  if (!session?.user) {
    return (
      <Link href="/api/auth/signin">
        <Button size="sm">Sign in</Button>
      </Link>
    );
  }

  const { name, image } = session.user;
  return <UserMenu name={name} image={image} />;
}
