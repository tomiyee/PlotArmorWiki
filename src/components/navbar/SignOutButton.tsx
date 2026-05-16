"use client";

import { MenuItem } from "../ui/Menu";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { Box } from "../ui/Box";
import { signOut } from "next-auth/react";

/**
 * Client-side sign-out button. Uses next-auth/react's `signOut` (not the
 * server action) so it can be invoked from an event handler.
 */
export function SignOutButton() {
  return (
    <MenuItem onClick={() => signOut()}>
      <Box className="items-center gap-2">
        <FontAwesomeIcon icon={faArrowRightFromBracket} />
        Sign out
      </Box>
    </MenuItem>
  );
}
