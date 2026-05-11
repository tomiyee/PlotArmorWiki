"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

/**
 * Triggers Google OAuth sign-in flow. Rendered in the navbar when no session
 * is active.
 *
 * @example
 * <SignInButton />
 */
export function SignInButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => signIn("google")}
    >
      Sign in
    </Button>
  );
}
