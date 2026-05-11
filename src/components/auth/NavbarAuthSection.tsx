import Image from "next/image";
import { auth } from "@/auth";
import { SignInButton } from "./SignInButton";
import { SignOutButton } from "./SignOutButton";
import { Text } from "@/components/ui/text";

/**
 * Server Component that reads the current Auth.js session and renders either
 * a "Sign in" button (no session) or an avatar + display name + "Sign out"
 * button (active session).
 *
 * Rendered once in the root layout and passed into the Navbar as a slot so the
 * Navbar stays a Client Component while auth state is resolved server-side.
 *
 * @example
 * <NavbarAuthSection />
 */
export async function NavbarAuthSection() {
  const session = await auth();

  if (!session?.user) {
    return <SignInButton />;
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
        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center">
          <Text variant="label" className="text-xs text-gray-600">
            {name?.[0]?.toUpperCase() ?? "?"}
          </Text>
        </div>
      )}
      <Text variant="label" className="text-sm text-gray-700 hidden sm:inline">
        {name}
      </Text>
      <SignOutButton />
    </div>
  );
}
