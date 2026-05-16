"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/Button";

/**
 * Client-side sign-out button. Uses next-auth/react's `signOut` (not the
 * server action) so it can be invoked from an event handler.
 *
 * @example
 * <SignOutButton />
 */
export function SignOutButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => signOut()}>
      Sign out
    </Button>
  );
}
