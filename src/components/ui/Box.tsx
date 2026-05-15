import * as React from "react";
import { cn } from "@/lib/utils";

export type BoxProps = {
  /** If true, the children are stacked vertically (`flex-col`) */
  col?: boolean;
  /** The inline flex style */
  flex?: number | string;
} & React.ComponentProps<"div">;

/**
 * A `flex` container div.
 * All other div props and className are forwarded and merged.
 *
 * @example
 * <Box className="gap-3 items-center">
 *   <Avatar />
 *   <Text>Username</Text>
 * </Box>
 *
 * <Box col className="gap-2">
 *   <Label htmlFor="name">Name</Label>
 *   <Input id="name" name="name" />
 * </Box>
 *
 * <Box col flex={1} className="gap-1">
 *   <Input name="search" />
 * </Box>
 */
export function Box(props: BoxProps) {
  const { col, flex, className, style, ...rest } = props;
  return (
    <div
      className={cn("flex", col && "flex-col", className)}
      style={flex !== undefined ? { flex, ...style } : style}
      {...rest}
    />
  );
}
