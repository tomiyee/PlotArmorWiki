import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface Props {
  children: string;
  /** Extra classes to merge onto the prose wrapper. */
  className?: string;
  /** Use smaller prose sizing (e.g. inside reference panels). Defaults to false. */
  sm?: boolean;
}

/**
 * Renders a markdown string as styled HTML using Tailwind Typography prose
 * classes and remark-gfm (tables, strikethrough, task lists, autolinks).
 * Use this wherever read-only markdown content needs to be displayed so the
 * styling is consistent across the app.
 *
 * @example
 * <MarkdownRenderer>{section.content}</MarkdownRenderer>
 * <MarkdownRenderer sm className="mt-2">{schema.body}</MarkdownRenderer>
 */
export function MarkdownRenderer({ children, className, sm = false }: Props) {
  return (
    <div
      className={cn(
        "prose prose-gray max-w-none text-gray-700",
        sm && "prose-sm",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
