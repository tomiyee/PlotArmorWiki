"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Box } from "@/components/ui/Box";
import { SignOutButton } from "@/components/navbar/SignOutButton";
import { Menu } from "../ui/Menu";
import { ThemeToggle } from "@/components/ThemeToggle";

type UserMenuProps = {
  /** Display name of the authenticated user. */
  name: string | null | undefined;
  /** Avatar image URL of the authenticated user. */
  image: string | null | undefined;
};

/**
 * Client Component that owns the open/close state for the user avatar dropdown.
 * Separated from the async Server Component `AuthControls` so that `useState`
 * can be used without converting the parent to a Client Component.
 *
 * @example
 * <UserMenu name={session.user.name} image={session.user.image} />
 */
export function UserMenu(props: UserMenuProps) {
  const { name, image } = props;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Menu
      isOpen={isOpen}
      align="right"
      contents={
        <>
          <Box className="items-center justify-between gap-4 px-3 py-1.5 border-b border-border">
            <span className="text-sm text-muted-foreground">Theme</span>
            <ThemeToggle />
          </Box>
          <SignOutButton />
        </>
      }
      onClose={() => setIsOpen(false)}
    >
      <Button variant="ghost" size="icon" onClick={() => setIsOpen((v) => !v)}>
        {image ? (
          <Image
            src={image}
            alt={name ?? "User avatar"}
            width={28}
            height={28}
            className="rounded-full"
          />
        ) : (
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {name?.[0]?.toUpperCase() ?? "?"}
          </span>
        )}
      </Button>
    </Menu>
  );
}
