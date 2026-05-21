"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/Command";
import {
  getVisiblePages,
  type PageSearchResult,
} from "@/app/[serial]/search-actions";

type SerialSearchProps = {
  /** The slug of the currently active serial, used to scope the page search. */
  serialSlug: string;
};

/**
 * Search icon button + command-palette dialog for the navbar. Only rendered
 * when inside a serial route. Opens a list of all wiki pages visible at the
 * user's current chapter cutoff (spoiler-safe), with client-side fuzzy
 * filtering as the user types.
 *
 * Also responds to Cmd+K / Ctrl+K.
 *
 * @example
 * <SerialSearch serialSlug="my-serial" />
 */
export function SerialSearch(props: SerialSearchProps) {
  const { serialSlug } = props;
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PageSearchResult[]>([]);
  const router = useRouter();

  // Fetch visible pages (spoiler-filtered) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getVisiblePages(serialSlug).then((data) => {
      if (!cancelled) setResults(data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, serialSlug]);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const handleSelect = useCallback(
    (slug: string) => {
      router.push(`/${serialSlug}/${slug}`);
      setOpen(false);
    },
    [router, serialSlug],
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search pages (Ctrl+K)"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="size-4" />
      </Button>
      <Dialog
          isOpen={open}
          onClose={() => {
            setOpen(false);
            // Reset results so the next open gets fresh data if the cutoff changed.
            setResults([]);
          }}
          showCloseButton={false}
        >
        <Command>
          <CommandInput placeholder="Search pages…" autoFocus />
          <CommandList>
            <CommandEmpty>
              {results.length === 0 ? "Loading…" : "No pages found."}
            </CommandEmpty>
            {results.map((page) => (
              <CommandItem
                key={page.id}
                value={page.name}
                onSelect={() => handleSelect(page.slug)}
              >
                {page.name}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </Dialog>
    </>
  );
}
