"use client";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { usePersistedStore } from "@/hooks/usePersistedStore";

const STORAGE_KEY = "demo:counter";

export default function CounterDemoPage() {
  const [count, setCount] = usePersistedStore<number>(STORAGE_KEY, 0);

  return (
    <main className="flex flex-col items-center gap-8 px-6 py-16">
      <Text variant="h1">usePersistedStore demo</Text>

      <Text variant="body" muted className="max-w-prose text-center text-sm">
        This counter is saved to <code>localStorage</code> under the key{" "}
        <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">
          {STORAGE_KEY}
        </code>
        . Open this page in a second tab — clicking either button will update
        both tabs instantly without a page refresh.
      </Text>

      <div className="flex flex-col items-center gap-4">
        <span className="text-7xl font-bold tabular-nums">{count}</span>

        <div className="flex gap-3">
          <Button onClick={() => setCount((n) => n + 1)}>Increment</Button>
          <Button variant="outline" onClick={() => setCount(0)}>
            Reset
          </Button>
        </div>
      </div>

      <Text as="p" variant="body" className="text-xs text-gray-400">
        Refresh the page to confirm the value is persisted across sessions.
      </Text>
    </main>
  );
}
