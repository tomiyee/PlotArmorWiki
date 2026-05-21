"use client";

import { useState } from "react";
import Link from "next/link";
import { UserIcon, LogInIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Box } from "@/components/ui/Box";
import { Menu } from "@/components/ui/Menu";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * User icon button for unauthenticated visitors. Opens a dropdown with a
 * "Sign in" link and a theme toggle. Always visible regardless of screen size
 * so there's always a way to authenticate and change the theme on narrow viewports.
 *
 * @example
 * <UnauthMenu />
 */
export function UnauthMenu() {
  const [open, setOpen] = useState(false);

  return (
    <Menu
      isOpen={open}
      onClose={() => setOpen(false)}
      align="right"
      contents={
        <div className="py-1 min-w-40">
          <Link
            href="/api/auth/signin"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted w-full"
          >
            <LogInIcon className="size-4" />
            Sign in
          </Link>
          <Box className="items-center justify-between gap-4 px-3 py-1.5 border-t border-border">
            <span className="text-sm text-muted-foreground">Theme</span>
            <ThemeToggle />
          </Box>
        </div>
      }
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserIcon className="size-4" />
      </Button>
    </Menu>
  );
}
