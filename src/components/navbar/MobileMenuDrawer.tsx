"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Text } from "@/components/ui/Text";
import type { CategoryNavData } from "@/types";

type MobileMenuDrawerProps = {
  /** Serial title shown at the top of the drawer. Null when not on a serial route. */
  serialTitle: string | null;
  /** Serial URL slug used to build category links. Null when not on a serial route. */
  serialSlug: string | null;
  /** Page category links shown in the Pages section. */
  categories: CategoryNavData[];
  /** Pre-rendered SerialTOC tree shown inline in the Contents section. */
  tocContent: ReactNode;
};

/**
 * Hamburger button that opens a left-side drawer with serial navigation.
 * Shown on mobile in place of the logo. When on a serial route it shows
 * the serial title, page-category links, and the full table of contents.
 *
 * @example
 * <MobileMenuDrawer
 *   serialTitle={serialData?.serialTitle ?? null}
 *   serialSlug={serialData?.serialSlug ?? null}
 *   categories={serialData?.categories ?? []}
 *   tocContent={tocContent}
 * />
 */
export function MobileMenuDrawer(props: MobileMenuDrawerProps) {
  const { serialTitle, serialSlug, categories, tocContent } = props;
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation menu"
        onClick={() => setOpen(true)}
      >
        <MenuIcon className="size-5" />
      </Button>
      <Drawer open={open} onOpenChange={setOpen} direction="left">
        <div className="flex flex-col gap-4 p-4 w-72 overflow-y-auto">
          {serialTitle && serialSlug ? (
            <Link
              href={`/${serialSlug}`}
              onClick={() => setOpen(false)}
              className="text-lg font-semibold hover:text-foreground/80"
            >
              {serialTitle}
            </Link>
          ) : (
            <Text variant="h4">Menu</Text>
          )}
          {categories.length > 0 && serialSlug && (
            <div className="flex flex-col gap-0.5">
              <Text
                variant="label"
                muted
                className="text-xs uppercase tracking-wider mb-1"
              >
                Pages
              </Text>
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/${serialSlug}/${cat.slug}`}
                  onClick={() => setOpen(false)}
                  className="block rounded px-2 py-1.5 text-sm hover:bg-muted"
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          )}
          {tocContent && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div
              className="flex flex-col gap-0.5"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a")) setOpen(false);
              }}
            >
              <Text
                variant="label"
                muted
                className="text-xs uppercase tracking-wider mb-1"
              >
                Contents
              </Text>
              {tocContent}
            </div>
          )}
          {/* Help link - always shown at the bottom of the drawer */}
          <div className="flex flex-col gap-0.5 border-t pt-3 mt-1">
            <Link
              href="/help"
              onClick={() => setOpen(false)}
              className="block rounded px-2 py-1.5 text-sm hover:bg-muted"
            >
              Help &amp; Documentation
            </Link>
          </div>
        </div>
      </Drawer>
    </>
  );
}
