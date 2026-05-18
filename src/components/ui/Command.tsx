"use client";

import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/**
 * Root Command container. Wraps cmdk's `Command` with project-level styling.
 * Place inside a Dialog or standalone for a command palette / search experience.
 *
 * @example
 * <Command>
 *   <CommandInput placeholder="Search..." />
 *   <CommandList>
 *     <CommandEmpty>No results.</CommandEmpty>
 *     <CommandItem onSelect={handleSelect}>Item</CommandItem>
 *   </CommandList>
 * </Command>
 */
function Command(props: ComponentProps<typeof CommandPrimitive>) {
  const { className, ...rest } = props;
  return (
    <CommandPrimitive
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground",
        className,
      )}
      {...rest}
    />
  );
}

type CommandInputProps = ComponentProps<typeof CommandPrimitive.Input>;

/**
 * Search input with a magnifying-glass icon. Filters the CommandList on every keystroke.
 *
 * @example
 * <CommandInput placeholder="Search pages..." />
 */
function CommandInput(props: CommandInputProps) {
  const { className, ...rest } = props;
  return (
    <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
      <SearchIcon className="mr-2 size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        className={cn(
          "flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...rest}
      />
    </div>
  );
}

type CommandListProps = ComponentProps<typeof CommandPrimitive.List>;

/**
 * Scrollable container for CommandItem and CommandGroup children.
 *
 * @example
 * <CommandList>
 *   <CommandItem>Item</CommandItem>
 * </CommandList>
 */
function CommandList(props: CommandListProps) {
  const { className, ...rest } = props;
  return (
    <CommandPrimitive.List
      className={cn("max-h-80 overflow-y-auto overflow-x-hidden p-1", className)}
      {...rest}
    />
  );
}

type CommandEmptyProps = ComponentProps<typeof CommandPrimitive.Empty>;

/**
 * Rendered when the CommandList has no matching items.
 *
 * @example
 * <CommandEmpty>No results found.</CommandEmpty>
 */
function CommandEmpty(props: CommandEmptyProps) {
  return (
    <CommandPrimitive.Empty
      className="py-6 text-center text-sm text-muted-foreground"
      {...props}
    />
  );
}

type CommandGroupProps = ComponentProps<typeof CommandPrimitive.Group>;

/**
 * Groups related CommandItems under an optional heading label.
 *
 * @example
 * <CommandGroup heading="Characters">
 *   <CommandItem>Frodo</CommandItem>
 * </CommandGroup>
 */
function CommandGroup(props: CommandGroupProps) {
  const { className, ...rest } = props;
  return (
    <CommandPrimitive.Group
      className={cn(
        "overflow-hidden text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...rest}
    />
  );
}

type CommandItemProps = ComponentProps<typeof CommandPrimitive.Item>;

/**
 * Selectable item inside a CommandList. Highlights on keyboard focus and mouse hover.
 *
 * @example
 * <CommandItem onSelect={() => router.push("/page")}>Character</CommandItem>
 */
function CommandItem(props: CommandItemProps) {
  const { className, ...rest } = props;
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-muted data-[selected=true]:text-foreground data-[disabled=true]:opacity-50",
        className,
      )}
      {...rest}
    />
  );
}

type CommandSeparatorProps = ComponentProps<typeof CommandPrimitive.Separator>;

/**
 * Horizontal rule dividing sections in a CommandList.
 *
 * @example
 * <CommandGroup>...</CommandGroup>
 * <CommandSeparator />
 * <CommandGroup>...</CommandGroup>
 */
function CommandSeparator(props: CommandSeparatorProps) {
  const { className, ...rest } = props;
  return (
    <CommandPrimitive.Separator
      className={cn("-mx-1 h-px bg-border", className)}
      {...rest}
    />
  );
}

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
};
