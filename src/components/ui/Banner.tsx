"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { PropsWithChildren } from "react";
import { Box } from "./Box";

const BannerSlotContext = createContext<HTMLDivElement | null>(null);
const BannerActivateContext = createContext<
  ((active: boolean) => void) | null
>(null);

/**
 * Returns the banner slot DOM element for use with `createPortal`. Returns
 * null when the banner is inactive, so portals should conditionally render
 * only when the slot is non-null.
 *
 * @example
 * const slot = useBannerSlot();
 * if (!slot) return null;
 * return createPortal(<MyBannerContent />, slot);
 */
export function useBannerSlot() {
  return useContext(BannerSlotContext);
}

/**
 * Returns a callback to activate or deactivate the nearest `<Banner>`. Call
 * with `true` to show the banner bar and `false` to hide it. The banner is
 * inactive by default so no empty bar appears before content is portaled in.
 *
 * @example
 * const activate = useBannerActivate();
 * useEffect(() => {
 *   activate?.(true);
 *   return () => activate?.(false);
 * }, [activate]);
 */
export function useBannerActivate() {
  return useContext(BannerActivateContext);
}

type BannerProps = PropsWithChildren<{
  /**
   * When true (default), wraps children in a full-height inner scroll container
   * so the banner bar stays pinned above scrolling content. Set to false when
   * the outer container already manages scroll (e.g., inside a Dialog body).
   */
  scrollable?: boolean;
}>;

/**
 * Generic layout wrapper that adds a sticky accent banner bar above a content
 * area. Descendants activate the banner and fill it via `useBannerActivate()`
 * and `useBannerSlot()` + `createPortal`. The banner is inactive by default;
 * no bar is visible until a descendant calls `useBannerActivate()(true)`.
 *
 * @example
 * <Banner>
 *   <PageContainer>...</PageContainer>
 * </Banner>
 */
export function Banner(props: BannerProps) {
  const { children, scrollable = true } = props;
  const [slotEl, setSlotEl] = useState<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const activate = useCallback((isActive: boolean) => setActive(isActive), []);

  const barClassName = scrollable
    ? "shrink-0 border-b border-accent-foreground/20 bg-accent"
    : "shrink-0 border-b border-accent-foreground/20 bg-accent sticky top-0 z-10";

  const bar = active ? (
    <Box flex={0} className={barClassName}>
      <div
        ref={setSlotEl}
        className="mx-auto max-w-(--content-width) w-full px-4 py-1 flex items-center justify-center gap-3"
      />
    </Box>
  ) : null;

  return (
    <BannerActivateContext.Provider value={activate}>
      <BannerSlotContext.Provider value={slotEl}>
        {scrollable ? (
          <Box col className="size-full overflow-hidden">
            {bar}
            <Box flex={1} className="min-h-0 overflow-y-auto">
              {children}
            </Box>
          </Box>
        ) : (
          <>
            {bar}
            {children}
          </>
        )}
      </BannerSlotContext.Provider>
    </BannerActivateContext.Provider>
  );
}
