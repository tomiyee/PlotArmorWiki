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
 */
export function useServerAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: (fd: FormData) => Promise<void>, fd: FormData, onDone?: () => void) {
    startTransition(async () => {
      await action(fd);
      router.refresh();
      onDone?.();
    });
  }

  return { run, isPending };
}
