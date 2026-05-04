"use client";

import Link from "next/link";
import { SchemaNavData } from "@/types";
import {
  useDropdown,
  DropdownContainer,
  DropdownTrigger,
  DropdownPanel,
  DropdownEmptyState,
} from "@/components/ui/dropdown";

interface Props {
  serialSlug: string;
  schemas: SchemaNavData[];
}

/**
 * Dropdown listing the page schemas (categories) for the current serial.
 * Each entry links to /{serialSlug}/{schemaName}.
 *
 * @example
 * <PagesDropdown serialSlug="my-serial" schemas={[{ id: 1, name: "Characters" }]} />
 */
export function PagesDropdown({ serialSlug, schemas }: Props) {
  const { containerRef, open, setOpen } = useDropdown();

  return (
    <DropdownContainer ref={containerRef}>
      <DropdownTrigger
        open={open}
        onToggle={() => setOpen((v) => !v)}
        className="h-8 w-auto border-transparent bg-transparent shadow-none px-2 hover:bg-gray-100 hover:text-gray-900 text-gray-600 font-medium"
        aria-label="Pages menu"
      >
        Pages
      </DropdownTrigger>

      <DropdownPanel open={open} align="left" role="menu" aria-label="Page categories">
        {schemas.length === 0 ? (
          <DropdownEmptyState>No pages yet</DropdownEmptyState>
        ) : (
          schemas.map((schema) => (
            <Link
              key={schema.id}
              href={`/${serialSlug}/${encodeURIComponent(schema.name)}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              {schema.name}
            </Link>
          ))
        )}
      </DropdownPanel>
    </DropdownContainer>
  );
}
