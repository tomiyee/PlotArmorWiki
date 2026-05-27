import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

type PageContainerProps = ComponentProps<"div">;

/**
 * Standard page-level content container. Constrains width to `--content-width`
 * (the shared layout token), centers horizontally, and applies consistent
 * horizontal padding and vertical spacing. Override via `className` — e.g.
 * pass `max-w-lg` for narrow forms.
 *
 * @example
 * // Default width (most pages)
 * <PageContainer>…</PageContainer>
 *
 * // Narrower layout (creation forms)
 * <PageContainer className="max-w-lg">…</PageContainer>
 */
function PageContainer(props: PageContainerProps) {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn("max-w-[--content-width] mx-auto w-full px-4 py-6", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export { PageContainer };
