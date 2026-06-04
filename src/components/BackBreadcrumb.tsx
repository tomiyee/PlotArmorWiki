"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPageNameBySlug } from "@/lib/wiki-link-preview-action";

type BackBreadcrumbProps = {
  /** Serial slug used to validate that document.referrer belongs to this serial. */
  serialSlug: string;
};

/**
 * Renders a "← Back to {title}" link when the reader arrived via a wiki link
 * within the same serial. Reads document.referrer on mount; no-ops when the
 * referrer is empty, cross-origin, or not a serial wiki page.
 *
 * @example
 * <BackBreadcrumb serialSlug="wandering-inn" />
 */
export function BackBreadcrumb(props: BackBreadcrumbProps) {
  const { serialSlug } = props;
  const [backLink, setBackLink] = useState<{ href: string; title: string } | null>(null);

  useEffect(() => {
    const referrer = document.referrer;
    if (!referrer) return;

    let url: URL;
    try {
      url = new URL(referrer);
    } catch {
      return;
    }

    if (url.origin !== window.location.origin) return;

    const parts = url.pathname.split("/").filter(Boolean);
    // Must be exactly /{serial}/{page} — two path segments, no sub-paths
    if (parts.length !== 2) return;
    if (parts[0] !== serialSlug) return;
    if (parts[1] === "new") return;

    const pageSlug = decodeURIComponent(parts[1]);

    getPageNameBySlug(serialSlug, pageSlug).then((name) => {
      if (name) setBackLink({ href: referrer, title: name });
    });
  }, [serialSlug]);

  if (!backLink) return null;

  return (
    <Link
      href={backLink.href}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
    >
      <ArrowLeft className="size-3.5 shrink-0" />
      Back to {backLink.title}
    </Link>
  );
}
