"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/Command";
import {
  searchPages,
  type PageSearchResult,
} from "@/app/[serial]/search-actions";

/** Debounce delay in milliseconds before firing the server-side search. */
const DEBOUNCE_MS = 300;

type SerialSearchProps = {
  /** The slug of the currently active serial, used to scope the page search. */
  serialSlug: string;
  /** When true, shows a "+ Page {query}" option so admins can jump directly to the new-page form. */
  isAdmin: boolean;
};

/**
 * Search icon button + command-palette dialog for the navbar. Only rendered
 * when inside a serial route. Performs debounced server-side search filtered
 * to pages visible at the user's current chapter cutoff (spoiler-safe).
 *
 * Shows a "Type to search" prompt on open so the palette is never populated
 * by an expensive fetch-all. Results are capped at 20 rows server-side.
 *
 * Also responds to Cmd+K / Ctrl+K.
 *
 * @example
 * <SerialSearch serialSlug="my-serial" isAdmin={false} />
 */
export function SerialSearch(props: SerialSearchProps) {
  const { serialSlug, isAdmin } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PageSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  /** Ref to track the debounce timer so we can cancel it on each keystroke. */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset query each time the dialog closes; the search effect handles clearing results.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Debounced server-side search: fires 300 ms after the user stops typing.
  // Clears results immediately on empty query so the empty-state prompt appears.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    debounceRef.current = setTimeout(() => {
      searchPages(serialSlug, query).then((data) => {
        if (!cancelled) {
          setResults(data);
          setIsLoading(false);
        }
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, serialSlug]);

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

  const handleCreatePage = useCallback(() => {
    router.push(
      `/${serialSlug}/new?name=${encodeURIComponent(query.trim())}`,
    );
    setOpen(false);
  }, [router, serialSlug, query]);

  /**
   * Resolves the message shown in the empty slot of the command list.
   * Three states: no query typed yet → prompt; loading → searching; no matches → not found.
   */
  function emptyMessage(): string {
    if (!query.trim()) return "Search for a page - type a name to find it";
    if (isLoading) return "Searching…";
    return "No pages found.";
  }

  return (
    <>
      <Tooltip content="Search pages (Ctrl+K)" side="bottom">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search pages (Ctrl+K)"
          onClick={() => setOpen(true)}
        >
          <SearchIcon className="size-4" />
        </Button>
      </Tooltip>
      <Dialog
        isOpen={open}
        onClose={() => setOpen(false)}
        showCloseButton={false}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search pages…"
            autoFocus
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{emptyMessage()}</CommandEmpty>
            {results.map((page) => (
              <CommandItem
                key={page.id}
                value={page.name}
                onSelect={() => handleSelect(page.slug)}
              >
                {page.name}
              </CommandItem>
            ))}
            {isAdmin && query.trim() && (
              <CommandItem
                value={`+ Page ${query.trim()}`}
                onSelect={handleCreatePage}
              >
                + Page &ldquo;{query.trim()}&rdquo;
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </Dialog>
    </>
  );
}
