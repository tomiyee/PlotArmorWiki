"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

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
   * Width behaviour.
   * - `"trigger"` (default): dropdown matches trigger width.
   * - `"fixed"`: fixed 200 px width.
   */
  widthMode?: "trigger" | "fixed";
  /**
   * When false, the search input is hidden and options are never filtered.
   * Useful for short, well-known lists where search adds no value.
   * Defaults to true.
   */
  searchable?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a flat list of visible rows from the option tree, respecting
 * accordion expansion state and filtering.
 */
function buildFlatRows<T>(
  options: Option<T>[],
  expandedIds: ReadonlySet<string>,
  query: string,
  parentId = "",
): FlatRow<T>[] {
  const q = query.toLowerCase().trim();

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

      // Filter: skip options that don't match (and have no matching descendants).
      if (q && !matchesFilter(opt)) continue;

      const selectable = !opt.structural && !opt.disabled && !hasChildren;
      const selectableIdx = selectable ? selectableCounter.n++ : -1;

      // When filtering, auto-expand all ancestor accordions.
      const isExpanded = q
        ? true
        : expandedIds.has(id) !== false
          ? expandedIds.has(id)
          : true; // default: expanded

      rows.push({
        id,
        option: opt,
        depth,
        expanded: isExpanded,
        selectable,
        selectableIdx,
      });

      if (hasChildren && isExpanded) {
        const childRows = walk(opt.children!, depth + 1, id, selectableCounter);
        rows.push(...childRows);
      }
    }

    return rows;
  }

  const counter = { n: 0 };
  return walk(options, 0, parentId, counter);
}

/**
 * Returns the label of the option matching `value`, or `undefined` if not found.
 */
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
    widthMode = "trigger",
    searchable = true,
  } = props;

  // -------------------------------------------------------------------------
  // State — all internal; value/onChange are the only controlled interface.
  // -------------------------------------------------------------------------

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Set of row IDs whose accordions are explicitly expanded. Defaults to all expanded. */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  /** Whether the expandedIds set has been explicitly initialized (first open). */
  const [expandedInitialized, setExpandedInitialized] = useState(false);
  /** Selectable-index of the currently "active" (keyboard-highlighted) option. */
  const [activeSelectableIdx, setActiveSelectableIdx] = useState(0);

  // -------------------------------------------------------------------------
  // Refs
  // -------------------------------------------------------------------------

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // IDs
  // -------------------------------------------------------------------------

  const uid = useId();
  const treeId = `${uid}-tree`;
  const liveRegionId = `${uid}-live`;

  // -------------------------------------------------------------------------
  // Derived: flat visible rows
  // -------------------------------------------------------------------------

  // Build the full expanded-id set on first open (all IDs expanded by default).
  const allRowIds = useMemo(() => {
    function collectIds(opts: Option<T>[], prefix = ""): string[] {
      return opts.flatMap((opt, i) => {
        const id = prefix ? `${prefix}-${i}` : `${i}`;
        return [id, ...(opt.children ? collectIds(opt.children, id) : [])];
      });
    }
    return new Set(collectIds(options));
  }, [options]);

  const effectiveExpandedIds: ReadonlySet<string> = useMemo(() => {
    if (!expandedInitialized) return allRowIds;
    return expandedIds;
  }, [expandedInitialized, expandedIds, allRowIds]);

  const flatRows = useMemo(
    () => buildFlatRows(options, effectiveExpandedIds, searchable ? query : ""),
    [options, effectiveExpandedIds, query, searchable],
  );

  const selectableRows = useMemo(
    () => flatRows.filter((r) => r.selectable),
    [flatRows],
  );

  const totalSelectableCount = selectableRows.length;

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Focus the search input when the dropdown opens.
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 0);
      setActiveSelectableIdx(0);
    }
  }, [isOpen]);

  // Scroll active row into view when activeSelectableIdx changes.
  useEffect(() => {
    if (!isOpen) return;
    activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeSelectableIdx, isOpen]);

  // Close on outside click (input + popup are in separate DOM subtrees).
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger = triggerRef.current?.contains(target) ?? false;
      const inPopup = popupRef.current?.contains(target) ?? false;
      if (!inTrigger && !inPopup) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleOpen = useCallback(() => {
    if (disabled) return;
    if (!expandedInitialized) setExpandedInitialized(true);
    setQuery("");
    setIsOpen(true);
  }, [disabled, expandedInitialized]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }, []);

  const handleToggleExpand = useCallback(
    (rowId: string) => {
      if (!expandedInitialized) {
        // Initialize from allRowIds then toggle.
        const next = new Set(allRowIds);
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        setExpandedIds(next);
        setExpandedInitialized(true);
      } else {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          if (next.has(rowId)) next.delete(rowId);
          else next.add(rowId);
          return next;
        });
      }
    },
    [expandedInitialized, allRowIds],
  );

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

  const handleQueryChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setActiveSelectableIdx(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setActiveSelectableIdx((i) =>
            Math.min(i + 1, totalSelectableCount - 1),
          );
          // Auto-expand collapsed accordion if active item is inside it.
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setActiveSelectableIdx((i) => Math.max(i - 1, 0));
          break;
        }
        case "Home": {
          e.preventDefault();
          setActiveSelectableIdx(0);
          break;
        }
        case "End": {
          e.preventDefault();
          setActiveSelectableIdx(Math.max(0, totalSelectableCount - 1));
          break;
        }
        case "Enter": {
          e.preventDefault();
          const activeRow = selectableRows[activeSelectableIdx];
          if (activeRow) handleSelect(activeRow);
          break;
        }
        case "Escape": {
          e.preventDefault();
          handleClose();
          break;
        }
      }
    },
    [
      isOpen,
      totalSelectableCount,
      selectableRows,
      activeSelectableIdx,
      handleSelect,
      handleClose,
    ],
  );

  // -------------------------------------------------------------------------
  // Derived display values
  // -------------------------------------------------------------------------

  const selectedLabel =
    value !== undefined ? findLabel(options, value) : undefined;

  const activeRow = selectableRows[activeSelectableIdx];
  const activeRowDomId = activeRow ? `${uid}-row-${activeRow.id}` : undefined;

  // -------------------------------------------------------------------------
  // Render row
  // -------------------------------------------------------------------------

  function renderRow(row: FlatRow<T>) {
    const { option, depth, expanded, id } = row;
    const hasChildren = (option.children?.length ?? 0) > 0;
    const isActive =
      row.selectable && row.selectableIdx === activeSelectableIdx;
    const isSelected = value !== undefined && option.value === value;
    const domId = `${uid}-row-${id}`;
    const indentPx = depth * 16;

    if (option.structural || (hasChildren && !option.structural)) {
      // Group header / accordion trigger
      const isAccordion = hasChildren;
      return (
        <div
          key={id}
          id={domId}
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={false}
          aria-expanded={isAccordion ? expanded : undefined}
          style={{ paddingLeft: indentPx + 8 }}
          className="flex items-center gap-1.5 pr-3 h-9 text-xs font-semibold text-muted-foreground uppercase tracking-wide select-none cursor-pointer hover:bg-muted/50"
          onClick={() => isAccordion && handleToggleExpand(id)}
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
          <span className="truncate">{option.label}</span>
          {option.description && (
            <span className="truncate text-muted-foreground/70 ml-1">
              {option.description}
            </span>
          )}
        </div>
      );
    }

    // Selectable or disabled leaf option
    return (
      <div
        key={id}
        id={domId}
        role="treeitem"
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-disabled={option.disabled}
        ref={isActive ? activeRowRef : undefined}
        style={{ paddingLeft: indentPx + 8 }}
        className={cn(
          "flex items-start gap-2 pr-3 h-9 cursor-pointer select-none",
          "transition-colors",
          option.disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-muted/40",
          isActive &&
            !option.disabled &&
            "bg-primary/10 font-medium text-primary",
        )}
        onMouseDown={(e) => {
          e.preventDefault();
          if (!option.disabled) handleSelect(row);
        }}
      >
        <span className="truncate text-sm leading-9">{option.label}</span>
        {option.description && (
          <span className="truncate text-xs text-muted-foreground leading-9 shrink-0 max-w-[40%]">
            {option.description}
          </span>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Dropdown content
  // -------------------------------------------------------------------------

  const dropdownContent = (
    <div className="flex flex-col h-full">
      {/* Search input — omitted when searchable={false} */}
      {searchable && (
        <div className="px-2 py-1.5 border-b border-border shrink-0">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleKeyDown}
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

      {/* Live region for screen readers */}
      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {flatRows.length === 0
          ? "No options available."
          : `${totalSelectableCount} option${totalSelectableCount === 1 ? "" : "s"} available`}
      </div>

      {/* Option list */}
      {flatRows.length === 0 ? (
        <div
          role="status"
          aria-label="No options available."
          className="px-3 py-3 text-sm text-muted-foreground text-center"
        >
          No options available.
        </div>
      ) : (
        <div className="overflow-y-auto flex-1">
          <div id={treeId} role="tree">
            {flatRows.map((row) => renderRow(row))}
          </div>
        </div>
      )}
    </div>
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const popupWidth = widthMode === "trigger" ? "var(--anchor-width)" : "200px";

  return (
    <div data-slot="select2-wrapper" className={cn("relative", className)}>
      {/* Trigger button */}
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

      {/* Dropdown */}
      <Popover
        anchor={triggerRef}
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
        content={dropdownContent}
      />
    </div>
  );
}

export { Select };
