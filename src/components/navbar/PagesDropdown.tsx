"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { SchemaNavData } from "@/types";

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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleMouseDown(e: React.MouseEvent) {
    if (
      containerRef.current &&
      !containerRef.current.contains(e.target as Node)
    ) {
      setOpen(false);
    }
  }

  // Close on outside click via document listener
  function handleToggle() {
    if (!open) {
      const close = (e: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
          document.removeEventListener("mousedown", close);
        }
      };
      document.addEventListener("mousedown", close);
    }
    setOpen((v) => !v);
  }

  return (
    <div ref={containerRef} className="relative" onMouseDown={handleMouseDown}>
      <button
        onClick={handleToggle}
        className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 rounded px-2 py-1 hover:bg-gray-100 transition-colors"
      >
        Pages
        <ChevronDownIcon
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 min-w-40 rounded-md border bg-white shadow-md py-1">
          {schemas.length === 0 ? (
            <span className="block px-3 py-2 text-sm text-gray-400">
              No pages yet
            </span>
          ) : (
            schemas.map((schema) => (
              <Link
                key={schema.id}
                href={`/${serialSlug}/${encodeURIComponent(schema.name)}`}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                {schema.name}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
