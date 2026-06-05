import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type BackBreadcrumbProps = {
  /** Resolved href for the back link (includes remaining trail query param if applicable). */
  backHref: string;
  /** Display title of the page to navigate back to. */
  backTitle: string;
};

/**
 * Renders a "← Back to {title}" link from a pre-resolved trail entry.
 * Title and href are computed server-side from the `?trail=` query param —
 * no browser APIs required.
 *
 * @example
 * <BackBreadcrumb backHref="/my-serial/characters?trail=arcs" backTitle="Characters" />
 */
export function BackBreadcrumb(props: BackBreadcrumbProps) {
  const { backHref, backTitle } = props;

  return (
    <Link
      href={backHref}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
    >
      <ArrowLeft className="size-3.5 shrink-0" />
      Back to {backTitle}
    </Link>
  );
}
