"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export interface Option<T> {
  /** Display text shown in the dropdown. */
  label: string;
  /** The value emitted to `onChange` when this option is selected. */
  value: T;
  /** When true, prevents the option from being selected. */
  disabled?: boolean;
  /** Nested options — renders this option as an `<optgroup>` header. */
  children?: Option<T>[];
}

type SelectProps<T> = {
  /** List of options (or option groups) to render. */
  options: Option<T>[];
  /** Called with the matched Option value when the user picks an entry. */
  onChange?: (value: T) => void;
  /** The currently-selected value (controlled). */
  value?: T;
  /** The default-selected value (uncontrolled). */
  defaultValue?: T;
  /** Extra classes merged onto the `<select>` element. */
  className?: string;
} & Omit<React.ComponentProps<"select">, "onChange" | "value" | "defaultValue" | "children">

/**
 * Renders a native `<select>` styled to match the design system.
 *
 * Options with `children` are rendered as `<optgroup>` elements — the group
 * label is non-selectable and the children appear as individual options inside.
 * Options with `disabled: true` cannot be clicked.
 *
 * The generic type `T` is the value type; internally the DOM value is the
 * string serialisation of `T`, and `onChange` restores the original `T`.
 *
 * @example
 * // Flat list
 * <Select
 *   name="volume"
 *   options={volumes.map(v => ({ label: v.displayName, value: v.id }))}
 *   defaultValue={volumes.at(-1)?.id}
 * />
 *
 * @example
 * // Grouped
 * <Select
 *   options={[
 *     { label: "Volume 1", value: "v1", children: [
 *       { label: "Chapter 1", value: "c1" },
 *       { label: "Chapter 2", value: "c2", disabled: true },
 *     ]},
 *   ]}
 * />
 */
function Select<T>(props: SelectProps<T>) {
  const { options, onChange, value, defaultValue, className, ...rest } = props;
  /** Flatten options so we can resolve the original T from the string key. */
  function allLeafOptions(opts: Option<T>[]): Option<T>[] {
    return opts.flatMap((o) => (o.children ? allLeafOptions(o.children) : [o]))
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (!onChange) return
    const stringVal = e.target.value
    const match = allLeafOptions(options).find(
      (o) => String(o.value) === stringVal
    )
    if (match !== undefined) {
      onChange(match.value)
    }
  }

  function renderOption(opt: Option<T>, idx: number) {
    if (opt.children && opt.children.length > 0) {
      return (
        <optgroup key={idx} label={opt.label}>
          {opt.children.map((child, ci) => renderOption(child, ci))}
        </optgroup>
      )
    }
    return (
      <option key={idx} value={String(opt.value)} disabled={opt.disabled}>
        {opt.label}
      </option>
    )
  }

  return (
    <div data-slot="select-wrapper" className="relative">
      <select
        data-slot="select"
        value={value !== undefined ? String(value) : undefined}
        defaultValue={defaultValue !== undefined ? String(defaultValue) : undefined}
        onChange={handleChange}
        className={cn(
          "flex h-9 w-full appearance-none rounded-lg border border-input bg-background px-3 py-1 pr-8 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        {...rest}
      >
        {options.map((opt, i) => renderOption(opt, i))}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { Select }
