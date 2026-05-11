"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

/**
 * Triggers Auth.js sign-out (clears session cookie, redirects to home).
 * Rendered inside the user menu when a session is active.
 *
 * @example
 * <SignOutButton />
 */
export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => signOut({ callbackUrl: "/" })}
    >
      Sign out
    </Button>
  );
}
