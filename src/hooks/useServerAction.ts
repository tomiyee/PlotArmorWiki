'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Wraps a server action in a transition that automatically refreshes the router
 * on completion, keeping server state in sync with client UI.
 *
 * @example
 * const { run, isPending } = useServerAction();
 * run(deleteAction, formData, () => setDialogOpen(false));
 * run(addAction, formData, onDone, (err) => toast({ title: err.message, variant: "error" }));
 */
export function useServerAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(
    action: (fd: FormData) => Promise<void>,
    fd: FormData,
    onDone?: () => void,
    onError?: (error: Error) => void,
  ) {
    startTransition(async () => {
      try {
        await action(fd);
        router.refresh();
        onDone?.();
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  return { run, isPending };
}
