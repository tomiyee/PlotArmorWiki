import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db/index";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string | null;
    } & DefaultSession["user"];
  }
}

/**
 * Auth.js v5 configuration with Google OAuth and Drizzle database sessions.
 *
 * Database sessions are used (not JWT) so that `session.user.id` is reliably
 * available on the server via `auth()`. After sign-in, users with a null
 * `username` are redirected to `/onboarding` to complete their profile.
 *
 * @example
 * // In a Server Component or Server Action:
 * const session = await auth();
 * const userId = session?.user?.id;
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      // Expose the database user id and username on the session for server-side use.
      if (session.user) {
        session.user.id = user.id;
        session.user.username = (user as typeof user & { username: string | null }).username ?? null;
      }
      return session;
    },
    async signIn({ user }) {
      // If the user has no username set, redirect them to onboarding.
      // This is checked after the adapter creates/fetches the user row.
      const [dbUser] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, user.id!))
        .limit(1);
      if (dbUser && dbUser.username === null) {
        // Return the redirect URL; Auth.js will follow it.
        return "/onboarding";
      }
      return true;
    },
  },
});
