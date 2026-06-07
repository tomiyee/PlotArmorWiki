"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type BackButtonProps = {
  /** Text label displayed inside the button. */
  children: React.ReactNode;
};

/**
 * Thin client wrapper that calls `router.back()` on click. Needed because
 * `not-found.tsx` is a Server Component but history navigation is client-only.
 *
 * @example
 * <BackButton>Go back</BackButton>
 */
export function BackButton(props: BackButtonProps) {
  const { children } = props;
  const router = useRouter();
  return (
    <Button variant="outline" onClick={() => router.back()}>
      {children}
    </Button>
  );
}
