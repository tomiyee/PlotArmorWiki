import { auth } from "@/auth";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { SignOutButton } from "@/components/navbar/SignOutButton";

/**
 * Server Component that reads the Auth.js session and renders either a
 * "Sign in" button (unauthenticated) or a user avatar + "Sign out" button
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
        <Button variant="outline" size="sm">
          Sign in
        </Button>
      </Link>
    );
  }

  const { name, image } = session.user;

  return (
    <div className="flex items-center gap-2">
      {image ? (
        <Image
          src={image}
          alt={name ?? "User avatar"}
          width={28}
          height={28}
          className="rounded-full"
        />
      ) : (
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
          {name?.[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      <SignOutButton />
    </div>
  );
}
