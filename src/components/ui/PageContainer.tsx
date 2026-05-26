import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

type PageContainerProps = ComponentProps<"div">;

/**
 * Standard page-level content container. Constrains width to `max-w-5xl`,
 * centers horizontally, and applies consistent horizontal padding and
 * vertical spacing. Override via `className` — e.g. pass `max-w-6xl` for
 * wiki pages with a floater sidebar, or `max-w-lg` for narrow forms.
 *
 * @example
 * // Default width (most pages)
 * <PageContainer>…</PageContainer>
 *
 * // Wider layout (wiki page with floater sidebar)
 * <PageContainer className="max-w-6xl">…</PageContainer>
 *
 * // Narrower layout (creation forms)
 * <PageContainer className="max-w-lg">…</PageContainer>
 */
function PageContainer(props: PageContainerProps) {
  const { className, children, ...rest } = props;
  return (
    <div
      className={cn("max-w-5xl mx-auto w-full px-4 py-6", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export { PageContainer };
