"use client";

// This file is the non-SSR entry point for @mdxeditor/editor.
// It is imported via dynamic() in MDEditor.tsx with { ssr: false } so the
// browser-only editor code is never executed on the server.
import "@mdxeditor/editor/style.css";
export { MDXEditor as ForwardRefEditor } from "@mdxeditor/editor";
