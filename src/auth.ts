import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";

/**
 * Auth.js configuration with Google provider and Drizzle adapter (database
 * sessions). `session.user.id` is available in Server Components via `auth()`.
 *
 * The `needsOnboarding` flag is set on the session when `users.username` is
 * null so that the root layout can redirect new sign-ins to `/onboarding`.
 *
 * @example
 * import { auth } from "@/auth";
 * const session = await auth();
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  session: {
    strategy: "database",
  },
  callbacks: {
    /**
     * Expose `user.id` and `user.needsOnboarding` on the session so Server
     * Components can read them without an extra DB round-trip.
     */
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).needsOnboarding = (user as any).username === null;
      }
      return session;
    },
  },
});
