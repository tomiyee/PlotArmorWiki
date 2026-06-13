import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { Text } from "@/components/ui/Text";
import { buttonVariants } from "@/components/ui/Button";
import { BackButton } from "@/app/BackButton";

/**
 * Root-level custom 404 page. Inherits the app's Navbar, ThemeProvider, and
 * Geist font from `src/app/layout.tsx` automatically — no extra wrappers needed.
 * Covers all `notFound()` call sites across the app.
 *
 * @example
 * // Rendered automatically by Next.js when notFound() is called anywhere.
 */
export default function NotFound() {
  return (
    <PageContainer className="flex flex-col items-center justify-center gap-6 py-24 text-center">
      <Text variant="h1">404 — Page Not Found</Text>
      <Text muted>
        The page you&apos;re looking for doesn&apos;t exist, was moved, or the
        link may be broken.
      </Text>
      <div className="flex gap-3">
        <BackButton>Go back</BackButton>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go home
        </Link>
      </div>
    </PageContainer>
  );
}
