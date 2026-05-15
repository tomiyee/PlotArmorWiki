import * as React from "react";
import { Text } from "@/components/ui/Text";

type LabelProps = Omit<React.ComponentPropsWithoutRef<"label">, "className"> & {
  /** Extra classes merged onto the label element. */
  className?: string;
};

/**
 * A `<label>` styled with the `label` text variant (`text-sm font-medium`).
 * Use `htmlFor` to associate it with an input by ID.
 *
 * @example
 * <Label htmlFor="title">
 *   Title <span className="text-red-500">*</span>
 * </Label>
 * <Input id="title" name="title" required />
 */
function Label(props: LabelProps) {
  const { htmlFor, ...rest } = props;
  return <Text as="label" variant="label" htmlFor={htmlFor} {...rest} />;
}

export { Label };
