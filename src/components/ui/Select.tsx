"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  type ChangeEvent,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { cn, normalizeQuery } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Option type
// ---------------------------------------------------------------------------

export type Option<T> = {
  /** Display text shown in the dropdown and used for filtering. */
  label: string;
  /** Optional secondary text shown below the label; also matched during filtering. */
  description?: string;
  /** When true, the option cannot be selected or navigated to with keyboard. */
  disabled?: boolean;
  /**
   * The value emitted to `onChange` when this option is selected.
   * For structural nodes this value is never emitted — use a sentinel like `null`.
   */
  value: T;
  /**
   * When true the option acts as a non-selectable section header.
   * Clicking it expands/collapses its children accordion.
   */
  structural?: boolean;
  /** Child options. Options with children render as expandable accordion sections. */
  children?: Option<T>[];
};

// ---------------------------------------------------------------------------
// Internal flat-row type
// ---------------------------------------------------------------------------

type FlatRow<T> = {
  /** Stable string key derived from the option's path in the tree (not index-based). */
  id: string;
  option: Option<T>;
  /** Nesting depth (0 = root). */
  depth: number;
  /** Whether this row's accordion is currently expanded. */
  expanded: boolean;
  /** Whether this row is a selectable option (not structural, not disabled). */
  selectable: boolean;
  /** Sequential index among selectable rows only — used for keyboard navigation. */
  selectableIdx: number;
};

// ---------------------------------------------------------------------------
// Select props
// ---------------------------------------------------------------------------

type SelectProps<T> = {
  /** Flat or hierarchical option list. */
  options: Option<T>[];
  /** Currently-selected value (controlled). Pass `undefined` for no selection. */
  value?: T;
  /** Called when the user selects an option. */
  onChange?: (value: T) => void;
  /** Placeholder text shown in the trigger button when no value is selected. */
  placeholder?: string;
  /** Extra classes merged onto the root wrapper element. */
  className?: string;
  /** When true, prevents all interaction. */
  disabled?: boolean;
  /** Forwarded to the trigger button as an `id`. */
  id?: string;
  /**
   * CSS width value applied to the popup (e.g. `"240px"`, `"var(--anchor-width)"`).
   * Defaults to `"var(--anchor-width)"` (match trigger width).
   */
  popupWidth?: string;
  /**
   * When false, the search input is hidden and options are never filtered.
   * Useful for short, well-known lists where search adds no value.
   * Defaults to true.
   */
  searchable?: boolean;
  /**
   * Optional custom trigger element rendered in place of the default outline
   * button. Clicking anywhere inside the element opens the dropdown.
   * The dropdown is positioned relative to this element.
   *
   * @example
   * <Select options={opts} value={v} onChange={setV}>
   *   <Button variant="ghost"><CalendarIcon /></Button>
   * </Select>
   */
  children?: ReactNode;
};

// ---------------------------------------------------------------------------
// buildFlatRows — flattens the option tree into a visible row list
// ---------------------------------------------------------------------------

function buildFlatRows<T>(
  options: Option<T>[],
  expandedIds: ReadonlySet<string>,
  query: string,
  parentId = "",
): FlatRow<T>[] {
  const q = normalizeQuery(query);

  function matchesFilter(opt: Option<T>): boolean {
    if (opt.label.toLowerCase().includes(q)) return true;
    if (opt.description?.toLowerCase().includes(q)) return true;
    if (opt.children) return opt.children.some((c) => matchesFilter(c));
    return false;
  }

  function walk(
    opts: Option<T>[],
    depth: number,
    prefix: string,
    selectableCounter: { n: number },
  ): FlatRow<T>[] {
    const rows: FlatRow<T>[] = [];

    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      const id = prefix ? `${prefix}-${i}` : `${i}`;
      const hasChildren = (opt.children?.length ?? 0) > 0;

      if (q && !matchesFilter(opt)) continue;

      const selectable = !opt.structural && !opt.disabled && !hasChildren;
      const selectableIdx = selectable ? selectableCounter.n++ : -1;
      // When filtering, force-expand all accordions so matches are always visible.
      const isExpanded = q ? true : expandedIds.has(id);

      rows.push({ id, option: opt, depth, expanded: isExpanded, selectable, selectableIdx });

      if (hasChildren && isExpanded) {
        rows.push(...walk(opt.children!, depth + 1, id, selectableCounter));
      }
    }

    return rows;
  }

  return walk(options, 0, parentId, { n: 0 });
}

// ---------------------------------------------------------------------------
// findLabel — walks the tree to find the display label for a value
// ---------------------------------------------------------------------------

function findLabel<T>(options: Option<T>[], value: T): string | undefined {
  for (const opt of options) {
    if (opt.value === value) return opt.label;
    if (opt.children) {
      const found = findLabel(opt.children, value);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// useAccordionState — manages expand/collapse for grouped options
// ---------------------------------------------------------------------------

/**
 * Tracks which accordion sections are expanded. Starts with all expanded
 * (null sentinel), then switches to an explicit set on first user toggle.
 *
 * @example
 * const { effectiveExpandedIds, toggleExpand } = useAccordionState(options);
 */
function useAccordionState<T>(options: Option<T>[]) {
  // null = uninitialized: treat every ID as expanded (same as allRowIds)
  const [expandedIds, setExpandedIds] = useState<Set<string> | null>(null);

  const allRowIds = useMemo(() => {
    function collectIds(opts: Option<T>[], prefix = ""): string[] {
      return opts.flatMap((opt, i) => {
        const id = prefix ? `${prefix}-${i}` : `${i}`;
        return [id, ...(opt.children ? collectIds(opt.children, id) : [])];
      });
    }
    return new Set(collectIds(options));
  }, [options]);

  const effectiveExpandedIds: ReadonlySet<string> = expandedIds ?? allRowIds;

  const toggleExpand = useCallback(
    (rowId: string) => {
      setExpandedIds((prev) => {
        const base = prev ?? allRowIds;
        const next = new Set(base);
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        return next;
      });
    },
    [allRowIds],
  );

  return { effectiveExpandedIds, toggleExpand };
}

// ---------------------------------------------------------------------------
// useFlatRows — derives the visible row list and keyboard-nav metadata
// ---------------------------------------------------------------------------

function useFlatRows<T>(
  options: Option<T>[],
  effectiveExpandedIds: ReadonlySet<string>,
  query: string,
  searchable: boolean,
) {
  const flatRows = useMemo(
    () => buildFlatRows(options, effectiveExpandedIds, searchable ? query : ""),
    [options, effectiveExpandedIds, query, searchable],
  );
  const selectableRows = useMemo(
    () => flatRows.filter((r) => r.selectable),
    [flatRows],
  );
  return { flatRows, selectableRows, totalSelectableCount: selectableRows.length };
}

// ---------------------------------------------------------------------------
// useKeyboardNav — keyboard handler for the search input
// ---------------------------------------------------------------------------

type KeyboardNavOptions<T> = {
  isOpen: boolean;
  totalSelectableCount: number;
  selectableRows: FlatRow<T>[];
  activeSelectableIdx: number;
  setActiveSelectableIdx: Dispatch<SetStateAction<number>>;
  onSelect: (row: FlatRow<T>) => void;
  onClose: () => void;
};

function useKeyboardNav<T>(opts: KeyboardNavOptions<T>) {
  const {
    isOpen,
    totalSelectableCount,
    selectableRows,
    activeSelectableIdx,
    setActiveSelectableIdx,
    onSelect,
    onClose,
  } = opts;

  return useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveSelectableIdx((i) => Math.min(i + 1, totalSelectableCount - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveSelectableIdx((i) => Math.max(i - 1, 0));
          break;
        case "Home":
          e.preventDefault();
          setActiveSelectableIdx(0);
          break;
        case "End":
          e.preventDefault();
          setActiveSelectableIdx(Math.max(0, totalSelectableCount - 1));
          break;
        case "Enter": {
          e.preventDefault();
          const row = selectableRows[activeSelectableIdx];
          if (row) onSelect(row);
          break;
        }
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [
      isOpen,
      totalSelectableCount,
      selectableRows,
      activeSelectableIdx,
      setActiveSelectableIdx,
      onSelect,
      onClose,
    ],
  );
}

// ---------------------------------------------------------------------------
// GroupRow — non-selectable section header / accordion trigger
// ---------------------------------------------------------------------------

type GroupRowProps = {
  /** DOM element id for ARIA references. */
  domId: string;
  label: string;
  description?: string;
  /** Nesting depth used to compute left-padding. */
  depth: number;
  expanded: boolean;
  /** When false, the row is a static label with no expand/collapse behavior. */
  isAccordion: boolean;
  onToggle: () => void;
};

function GroupRow(props: GroupRowProps) {
  const { domId, label, description, depth, expanded, isAccordion, onToggle } = props;
  return (
    <div
      id={domId}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={false}
      aria-expanded={isAccordion ? expanded : undefined}
      style={{ paddingLeft: depth * 16 + 8 }}
      className="flex items-center gap-1.5 pr-3 h-9 text-xs font-semibold text-muted-foreground uppercase tracking-wide select-none cursor-pointer hover:bg-muted/50"
      onClick={() => isAccordion && onToggle()}
    >
      {isAccordion && (
        <span className="shrink-0 text-muted-foreground">
          {expanded ? (
            <ChevronDownIcon className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3" />
          )}
        </span>
      )}
      <span className="truncate">{label}</span>
      {description && (
        <span className="truncate text-muted-foreground/70 ml-1">{description}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LeafRow — selectable or disabled leaf option
// ---------------------------------------------------------------------------

type LeafRowProps = {
  /** DOM element id for ARIA references. */
  domId: string;
  label: string;
  description?: string;
  /** Nesting depth used to compute left-padding. */
  depth: number;
  disabled?: boolean;
  isActive: boolean;
  isSelected: boolean;
  /** Attached only when this row is the keyboard-active item, for scroll-into-view. */
  activeRowRef?: RefObject<HTMLDivElement | null>;
  onSelect: () => void;
};

function LeafRow(props: LeafRowProps) {
  const {
    domId, label, description, depth, disabled, isActive, isSelected, activeRowRef, onSelect,
  } = props;
  return (
    <div
      id={domId}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={isSelected}
      aria-disabled={disabled}
      ref={activeRowRef}
      style={{ paddingLeft: depth * 16 + 8 }}
      className={cn(
        "flex items-start gap-2 pr-3 h-9 cursor-pointer select-none transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/40",
        isActive && !disabled && "bg-primary/10 font-medium text-primary",
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onSelect();
      }}
    >
      <span className="truncate text-sm leading-9">{label}</span>
      {description && (
        <span className="truncate text-xs text-muted-foreground leading-9 shrink-0 max-w-[40%]">
          {description}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DropdownContent — the panel rendered inside the Popover
// ---------------------------------------------------------------------------

type DropdownContentProps = {
  searchable: boolean;
  query: string;
  onQueryChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  isOpen: boolean;
  treeId: string;
  activeRowDomId: string | undefined;
  hasOptions: boolean;
  selectableCount: number;
  children: ReactNode;
};

function DropdownContent(props: DropdownContentProps) {
  const {
    searchable,
    query,
    onQueryChange,
    onKeyDown,
    isOpen,
    treeId,
    activeRowDomId,
    hasOptions,
    selectableCount,
    children,
  } = props;

  const liveRegionId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  return (
    <div className="flex flex-col h-full">
      {searchable && (
        <div className="px-2 py-1.5 border-b border-border shrink-0">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={onQueryChange}
              onKeyDown={onKeyDown}
              placeholder="Search…"
              autoComplete="off"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls={treeId}
              aria-autocomplete="list"
              aria-activedescendant={activeRowDomId}
              className={cn(
                "w-full h-7 pl-7 pr-2 text-sm bg-transparent outline-none",
                "placeholder:text-muted-foreground",
              )}
            />
          </div>
        </div>
      )}

      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {hasOptions
          ? `${selectableCount} option${selectableCount === 1 ? "" : "s"} available`
          : "No options available."}
      </div>

      {hasOptions ? (
        <div className="overflow-y-auto flex-1">
          <div id={treeId} role="tree">
            {children}
          </div>
        </div>
      ) : (
        <div
          role="status"
          aria-label="No options available."
          className="px-3 py-3 text-sm text-muted-foreground text-center"
        >
          No options available.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select component
// ---------------------------------------------------------------------------

/**
 * Searchable, hierarchical dropdown select with keyboard navigation and full
 * ARIA accessibility (combobox + tree semantics).
 *
 * Supports:
 * - Searchable input inside the dropdown
 * - Structural (non-selectable) group headers
 * - Expandable accordion sections with multi-level nesting
 * - Full keyboard navigation (ArrowUp/Down/Home/End/Enter/Escape)
 *
 * All persistent state (open, search, expanded accordions, active option) is
 * managed internally. The only controlled state is `value`/`onChange`.
 *
 * @example
 * // Flat list
 * <Select
 *   options={VOLUME_TYPE_OPTIONS}
 *   value={volumeType}
 *   onChange={setVolumeType}
 *   placeholder="Volume type"
 * />
 *
 * @example
 * // Grouped hierarchical
 * <Select
 *   options={volumes.map(v => ({
 *     label: v.name, value: null, structural: true,
 *     children: v.chapters.map(c => ({ label: c.name, value: c.id })),
 *   }))}
 *   value={selectedChapterId}
 *   onChange={setSelectedChapterId}
 *   placeholder="Select chapter…"
 * />
 *
 * @example
 * // Custom trigger — any element as the dropdown button
 * <Select options={opts} value={v} onChange={setV}>
 *   <Button variant="ghost" size="icon"><BookmarkIcon /></Button>
 * </Select>
 */
function Select<T>(props: SelectProps<T>) {
  const {
    options,
    value,
    onChange,
    placeholder = "Select…",
    className,
    disabled,
    id,
    popupWidth = "var(--anchor-width)",
    searchable = true,
    children,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeSelectableIdx, setActiveSelectableIdx] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);

  const hasCustomTrigger = children != null;

  const uid = useId();
  const treeId = `${uid}-tree`;

  const { effectiveExpandedIds, toggleExpand } = useAccordionState(options);
  const { flatRows, selectableRows, totalSelectableCount } = useFlatRows(
    options,
    effectiveExpandedIds,
    query,
    searchable,
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (row: FlatRow<T>) => {
      if (!row.selectable) return;
      onChange?.(row.option.value);
      setIsOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const handleOpen = useCallback(() => {
    if (disabled) return;
    setQuery("");
    setIsOpen(true);
  }, [disabled]);

  const handleQueryChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setActiveSelectableIdx(0);
  }, []);

  const handleKeyDown = useKeyboardNav({
    isOpen,
    totalSelectableCount,
    selectableRows,
    activeSelectableIdx,
    setActiveSelectableIdx,
    onSelect: handleSelect,
    onClose: handleClose,
  });

  // Reset active index when the dropdown opens.
  useEffect(() => {
    if (isOpen) setActiveSelectableIdx(0);
  }, [isOpen]);

  // Scroll the keyboard-active row into view.
  useEffect(() => {
    if (!isOpen) return;
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeSelectableIdx, isOpen]);

  // Close when the user clicks outside the trigger and popup.
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger =
        (triggerRef.current?.contains(target) ?? false) ||
        (wrapperRef.current?.contains(target) ?? false);
      const inPopup = popupRef.current?.contains(target) ?? false;
      if (!inTrigger && !inPopup) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const selectedLabel =
    value !== undefined ? findLabel(options, value) : undefined;

  const activeRow = selectableRows[activeSelectableIdx];
  const activeRowDomId = activeRow ? `${uid}-row-${activeRow.id}` : undefined;

  function renderRow(row: FlatRow<T>) {
    const { option, depth, expanded, id: rowId } = row;
    const hasChildren = (option.children?.length ?? 0) > 0;
    const domId = `${uid}-row-${rowId}`;

    if (option.structural || hasChildren) {
      return (
        <GroupRow
          key={rowId}
          domId={domId}
          label={option.label}
          description={option.description}
          depth={depth}
          expanded={expanded}
          isAccordion={hasChildren}
          onToggle={() => toggleExpand(rowId)}
        />
      );
    }

    const isActive = row.selectable && row.selectableIdx === activeSelectableIdx;
    const isSelected = value !== undefined && option.value === value;
    return (
      <LeafRow
        key={rowId}
        domId={domId}
        label={option.label}
        description={option.description}
        depth={depth}
        disabled={option.disabled}
        isActive={isActive}
        isSelected={isSelected}
        activeRowRef={isActive ? activeRowRef : undefined}
        onSelect={() => handleSelect(row)}
      />
    );
  }

  const anchorRef = hasCustomTrigger
    ? (wrapperRef as RefObject<Element | null>)
    : (triggerRef as RefObject<Element | null>);

  return (
    <div data-slot="select-wrapper" className={cn("relative", className)}>
      {hasCustomTrigger ? (
        <div
          ref={wrapperRef}
          onClick={disabled ? undefined : handleOpen}
          className="inline-flex"
        >
          {children}
        </div>
      ) : (
        <Button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="tree"
          aria-expanded={isOpen}
          aria-controls={isOpen ? treeId : undefined}
          onClick={handleOpen}
          variant="outline"
          size="lg"
          className={cn(
            "w-full justify-between px-3 border-input shadow-xs",
            !selectedLabel && "text-muted-foreground",
          )}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "shrink-0 size-4 text-muted-foreground transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </Button>
      )}

      <Popover
        anchor={anchorRef}
        open={isOpen}
        modal={false}
        popupRef={popupRef}
        popupId={treeId}
        popupRole="dialog"
        initialFocus={false}
        side="bottom"
        align="start"
        popupStyle={{ width: popupWidth, height: "min(300px, 60vh)" }}
        className="flex flex-col bg-background text-foreground overflow-hidden"
        content={
          <DropdownContent
            searchable={searchable}
            query={query}
            onQueryChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            isOpen={isOpen}
            treeId={treeId}
            activeRowDomId={activeRowDomId}
            hasOptions={flatRows.length > 0}
            selectableCount={totalSelectableCount}
          >
            {flatRows.map((row) => renderRow(row))}
          </DropdownContent>
        }
      />
    </div>
  );
}

export { Select };
