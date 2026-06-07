"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { Text } from "@/components/ui/Text";
import { CategoryNavData } from "@/types";

interface PagesDropdownProps {
  /** URL slug of the current serial, used to build category link hrefs. */
  serialSlug: string;
  /** Top-level page categories to list in the dropdown. */
  categories: CategoryNavData[];
}

/**
 * Dropdown listing the page categories for the current serial.
 * Each entry links to /{serialSlug}/{categoryName}.
 *
 * @example
 * <PagesDropdown serialSlug="my-serial" categories={[{ id: 1, name: "Characters" }]} />
 */
export function PagesDropdown(props: PagesDropdownProps) {
  const { serialSlug, categories } = props;
  const [open, setOpen] = useState(false);

  return (
    <Menu
      isOpen={open}
      onClose={() => setOpen(false)}
      align="left"
      role="menu"
      aria-label="Page categories"
      contents={
        categories.length === 0 ? (
          <Text
            as="span"
            variant="label"
            className="block px-3 py-2 text-sm text-muted-foreground"
          >
            No pages yet
          </Text>
        ) : (
          categories.map((category) => (
            <Link
              key={category.id}
              href={`/${serialSlug}/${category.slug}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              {category.name}
            </Link>
          ))
        )
      }
    >
      <Button
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Pages menu"
        className="font-medium text-foreground/70 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
      >
        <span className="hidden sm:inline">Pages</span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </Button>
    </Menu>
  );
}
