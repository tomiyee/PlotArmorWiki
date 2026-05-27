import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Styled textarea matching Input's visual language. Passes all native
 * `<textarea>` props through, including `name` for Server Action forms.
 *
 * @example
 * <Textarea name="description" placeholder="Describe the serial…" rows={4} />
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "flex w-full min-w-0 rounded-lg border border-border bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 resize-y",
          className
        )}
        {...props}
      />
    )
  }
)

export { Textarea }
