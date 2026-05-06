import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Text } from "@/components/ui/text";

interface Props {
  children: string;
  /** Extra classes to merge onto the wrapper. */
  className?: string;
  /** Use smaller text sizing (e.g. inside reference panels). Defaults to false. */
  sm?: boolean;
}

const COMPONENTS: Components = {
  h1: ({ children }) => (
    <Text
      variant="h1"
      className="mt-6 mb-4 text-2xl pb-2 border-b border-gray-200"
    >
      {children}
    </Text>
  ),
  h2: ({ children }) => (
    <Text variant="h2" className="mt-5 mb-3">
      {children}
    </Text>
  ),
  h3: ({ children }) => (
    <Text variant="h3" className="mt-4 mb-2">
      {children}
    </Text>
  ),
  h4: ({ children }) => (
    <Text variant="h4" className="mt-3 mb-2">
      {children}
    </Text>
  ),
  h5: ({ children }) => (
    <h5 className="text-sm font-semibold mt-3 mb-1 text-gray-900">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-xs font-semibold mt-2 mb-1 text-gray-900">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <Text variant="body" className="mb-4 leading-relaxed">
      {children}
    </Text>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-outside pl-6 mb-4 space-y-1 text-gray-700">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside pl-6 mb-4 space-y-1 text-gray-700">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-500 my-4">
      {children}
    </blockquote>
  ),
  // In react-markdown v10, block code is always inside <pre>; bare <code> is inline only.
  code: ({ children }) => (
    <code className="bg-gray-100 text-gray-800 rounded px-1 py-0.5 text-sm font-mono">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="bg-gray-100 rounded-md p-4 overflow-x-auto mb-4 text-sm font-mono text-gray-800 [&>code]:bg-transparent [&>code]:p-0 [&>code]:rounded-none">
      {children}
    </pre>
  ),
  hr: () => <hr className="border-gray-200 my-6" />,
  a: ({ href, children }) => (
    <a href={href} className="text-blue-600 underline hover:text-blue-800">
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="min-w-full border border-gray-200 text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="divide-y divide-gray-200">{children}</tbody>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-3 py-2 text-gray-700">{children}</td>,
};

const SM_COMPONENTS: Components = {
  ...COMPONENTS,
  // One step down the Text scale for each heading level in sm mode.
  h1: ({ children }) => (
    <Text as="h1" variant="h2" className="mt-4 mb-3">
      {children}
    </Text>
  ),
  h2: ({ children }) => (
    <Text as="h2" variant="h3" className="mt-3 mb-2">
      {children}
    </Text>
  ),
  h3: ({ children }) => (
    <Text as="h3" variant="h4" className="mt-3 mb-1">
      {children}
    </Text>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold mt-2 mb-1 text-gray-900">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-relaxed text-gray-700">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-outside pl-5 mb-3 space-y-0.5 text-sm text-gray-700">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside pl-5 mb-3 space-y-0.5 text-sm text-gray-700">
      {children}
    </ol>
  ),
  pre: ({ children }) => (
    <pre className="bg-gray-100 rounded-md p-3 overflow-x-auto mb-3 text-xs font-mono text-gray-800 [&>code]:bg-transparent [&>code]:p-0 [&>code]:rounded-none">
      {children}
    </pre>
  ),
};

/**
 * Renders a markdown string as styled HTML using explicit Tailwind utility
 * classes on each element — does not depend on @tailwindcss/typography so
 * heading sizes and weights are always correct.
 *
 * @example
 * <MarkdownRenderer>{section.content}</MarkdownRenderer>
 * <MarkdownRenderer sm className="mt-2">{schema.body}</MarkdownRenderer>
 */
export function MarkdownRenderer({ children, className, sm = false }: Props) {
  return (
    <div className={cn("max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={sm ? SM_COMPONENTS : COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
