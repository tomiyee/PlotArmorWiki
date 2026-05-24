"use client";

import { useState, useRef, useCallback, useEffect, useId } from "react";
import { Popover } from "@/components/ui/Popover";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn, normalizeQuery } from "@/lib/utils";
import type { Option } from "@/components/ui/Select";

export type { Option } from "@/components/ui/Select";

const DEBOUNCE_MS = 200;

type ComboboxBaseProps<T> = {
  /** Placeholder text shown in the input when empty. */
  placeholder?: string;
  /** Forwarded to the underlying `<input>` element. */
  id?: string;
  /** Extra classes merged onto the root wrapper element. */
  className?: string;
  /** Selected value for controlled usage; pass `null` to reset the input. */
  value?: T | null;
  /** Called with the selected option value, or `null` when the user edits the input after a selection. */
  onChange?: (value: T | null) => void;
  /** When true, prevents all interaction. */
  disabled?: boolean;
};

export type ComboboxProps<T> =
  | (ComboboxBaseProps<T> & {
      /** Static list of options; filtered client-side as the user types. */
      options: Option<T>[];
      getOptions?: never;
    })
  | (ComboboxBaseProps<T> & {
      options?: never;
      /** Async lookup called with the current query; debounced 200 ms internally. */
      getOptions: (query: string) => Promise<Option<T>[]>;
    });

function filterStatic<T>(options: Option<T>[], query: string): Option<T>[] {
  const q = normalizeQuery(query);
  if (!q) return options;
  return options.filter((o) => o.label.toLowerCase().includes(q));
}

/**
 * Searchable combobox supporting a static option list (client-side filter) or
 * an async `getOptions` callback (server-side, debounced 200 ms). Arrow-key
 * navigation, Enter to select, Escape to dismiss.
 *
 * Uses `@base-ui/react/popover` primitives for portal + positioning so the dropdown escapes
 * `overflow-hidden` containers without manual coordinate tracking.
 *
 * @example
 * // Static
 * <Combobox
 *   options={users.map(u => ({ label: u.name, value: u.id }))}
 *   onChange={(id) => setUserId(id)}
 *   placeholder="Pick a user…"
 * />
 *
 * @example
 * // Async
 * <Combobox
 *   getOptions={async (q) => searchUsers(q)}
 *   onChange={(id) => setUserId(id)}
 *   placeholder="Search users…"
 * />
 */
function Combobox<T>(props: ComboboxProps<T>) {
  const { placeholder, id, className, value, onChange, disabled } = props;
  const options = "options" in props ? props.options : undefined;
  const getOptions = "getOptions" in props ? props.getOptions : undefined;

  const [inputValue, setInputValue] = useState("");
  const [displayedOptions, setDisplayedOptions] = useState<Option<T>[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRef = useRef<{ cancelled: boolean } | null>(null);
  const listboxId = useId();

  // Sync: reset the visible input when the controlled value is cleared externally.
  // Uses React's "set state during render" pattern to avoid a useEffect.
  const [seenValue, setSeenValue] = useState<T | null | undefined>(value);
  if (seenValue !== value) {
    setSeenValue(value);
    if (value == null && inputValue !== "") setInputValue("");
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (cancelRef.current) cancelRef.current.cancelled = true;
    };
  }, []);

  // Must check both the input and the portaled popup since they are separate DOM subtrees.
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inInput = inputRef.current?.contains(target) ?? false;
      const inPopup = popupRef.current?.contains(target) ?? false;
      if (!inInput && !inPopup) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const fetchOptions = useCallback(
    (query: string) => {
      setHighlightedIndex(-1);
      if (options !== undefined) {
        setDisplayedOptions(filterStatic(options, query));
      } else if (getOptions) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (cancelRef.current) cancelRef.current.cancelled = true;
        const token = { cancelled: false };
        cancelRef.current = token;
        debounceRef.current = setTimeout(async () => {
          setIsLoading(true);
          try {
            const results = await getOptions(query);
            if (!token.cancelled) setDisplayedOptions(results);
          } finally {
            if (!token.cancelled) setIsLoading(false);
          }
        }, DEBOUNCE_MS);
      }
    },
    [options, getOptions],
  );

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInputValue(val);
    fetchOptions(val);
    setIsOpen(true);
    onChange?.(null);
  }

  function handleFocus() {
    if (!isOpen) {
      fetchOptions(inputValue);
      setIsOpen(true);
    }
  }

  function handleSelect(option: Option<T>) {
    setInputValue(option.label);
    setIsOpen(false);
    onChange?.(option.value);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        fetchOptions(inputValue);
        setIsOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, displayedOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      const opt = displayedOptions[highlightedIndex];
      if (opt) handleSelect(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  }

  const highlightedOptionId =
    highlightedIndex >= 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined;

  const dropdownContent = isLoading ? (
    <div className="px-3 py-2 text-sm text-muted-foreground">Loading…</div>
  ) : displayedOptions.length === 0 ? (
    <div className="px-3 py-2 text-sm text-muted-foreground">No results.</div>
  ) : (
    displayedOptions.map((option, i) => (
      <Button
        key={i}
        id={`${listboxId}-opt-${i}`}
        type="button"
        variant="ghost"
        role="option"
        aria-selected={i === highlightedIndex}
        className={cn(
          "h-auto w-full justify-start rounded-none px-3 py-1.5 text-sm font-normal",
          i === highlightedIndex && "bg-primary/10 font-medium text-primary",
        )}
        onMouseDown={(e) => {
          e.preventDefault();
          handleSelect(option);
        }}
        onMouseEnter={() => setHighlightedIndex(i)}
      >
        {option.label}
      </Button>
    ))
  );

  return (
    <div className={className}>
      <Input
        ref={inputRef}
        id={id}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={highlightedOptionId}
        aria-autocomplete="list"
        className="w-full"
      />
      <Popover
        anchor={inputRef}
        open={isOpen}
        modal={false}
        popupRef={popupRef}
        popupId={listboxId}
        popupRole="listbox"
        initialFocus={false}
        side="bottom"
        align="start"
        popupStyle={{ width: "var(--anchor-width)" }}
        className="max-h-60 overflow-y-auto bg-background py-1 text-foreground"
        content={dropdownContent}
      />
    </div>
  );
}

export { Combobox };
