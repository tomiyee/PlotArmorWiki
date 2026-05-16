"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/index";
import { users } from "@/db/schema";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export type UsernameActionState = { error: string } | null;

/**
 * Validates and persists a username for the currently signed-in user,
 * then redirects to /. Returns an error state for inline display on failure.
 *
 * @example
 * const [state, formAction] = useActionState(setUsername, null);
 */
export async function setUsername(
  _: UsernameActionState,
  formData: FormData,
): Promise<UsernameActionState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in to set a username." };
  }

  const raw = formData.get("username");
  if (typeof raw !== "string" || !USERNAME_RE.test(raw)) {
    return {
      error:
        "Username must be 3–20 characters: letters, numbers, and underscores only.",
    };
  }
  const username = raw;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existing) {
    return { error: "That username is already taken." };
  }

  await db.update(users).set({ username }).where(eq(users.id, session.user.id));

  redirect("/");
}
