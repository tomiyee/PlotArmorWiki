// Single shared wrapper for @mdxeditor/editor so the dynamic import with
// ssr:false (required because MDXEditor uses browser-only APIs) is declared once
// rather than duplicated in every editor component that needs it.
//
// The component is re-exported from ForwardRefEditor.tsx (which also imports the
// required CSS) so the style.css side-effect is loaded on the client only.
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { MDXEditorProps, MDXEditorMethods } from "@mdxeditor/editor";
import type { RefAttributes } from "react";

export const MDXEditorClient = dynamic(
  () =>
    import("@/components/ForwardRefEditor").then(
      (mod) => mod.ForwardRefEditor,
    ),
  { ssr: false },
) as ComponentType<MDXEditorProps & RefAttributes<MDXEditorMethods>>;
