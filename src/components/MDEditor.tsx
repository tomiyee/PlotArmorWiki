// Single shared wrapper for @uiw/react-md-editor so the dynamic import with
// ssr:false (required because MDEditor uses browser-only APIs) is declared once
// rather than duplicated in every editor component that needs it.
import dynamic from "next/dynamic";

export const MDEditor = dynamic(() => import("@uiw/react-md-editor"), {
  ssr: false,
});
