import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

interface ScrollspyProps {
  children: ReactNode;
  targetRef?: RefObject<
    HTMLElement | HTMLDivElement | Document | null | undefined
  >;
  onUpdate?: (id: string) => void;
  offset?: number;
  smooth?: boolean;
  className?: string;
  dataAttribute?: string;
  history?: boolean;
}

export function Scrollspy({
  children,
  targetRef,
  onUpdate,
  className,
  offset = 0,
  smooth = true,
  dataAttribute = "scrollspy",
  history = true,
}: ScrollspyProps) {
  const selfRef = useRef<HTMLDivElement | null>(null);
  const anchorElementsRef = useRef<Element[] | null>(null);
  const prevIdTracker = useRef<string | null>(null);

  // Sets active nav, hash, prevIdTracker, and calls onUpdate
  const setActiveSection = useCallback(
    (sectionId: string | null, force = false) => {
      if (!sectionId) {
        return;
      }
      for (const item of anchorElementsRef.current ?? []) {
        const id = item.getAttribute(`data-${dataAttribute}-anchor`);
        if (id === sectionId) {
          // ReUI accepts generic Elements, which need attribute methods.
          // oxlint-disable-next-line unicorn/prefer-dom-node-dataset
          item.setAttribute("data-active", "true");
          item.setAttribute("aria-current", "location");
        } else {
          // oxlint-disable-next-line unicorn/prefer-dom-node-dataset
          item.removeAttribute("data-active");
          item.removeAttribute("aria-current");
        }
      }
      if (onUpdate) {
        onUpdate(sectionId);
      }
      if (history && (force || prevIdTracker.current !== sectionId)) {
        window.history.replaceState(window.history.state, "", `#${sectionId}`);
      }
      prevIdTracker.current = sectionId;
    },
    [anchorElementsRef, dataAttribute, history, onUpdate]
  );

  const handleScroll = useCallback(() => {
    if (!anchorElementsRef.current || anchorElementsRef.current.length === 0) {
      return;
    }

    let scrollElement =
      targetRef?.current === document
        ? document.documentElement
        : (targetRef?.current as HTMLElement);

    if (!scrollElement) {
      return;
    }

    // If the scrollElement has a data-slot="scroll-area-viewport" inside, use that
    const viewport = scrollElement.querySelector(
      '[data-slot="scroll-area-viewport"]'
    );
    if (viewport instanceof HTMLElement) {
      scrollElement = viewport;
    }

    const scrollTop =
      scrollElement === document.documentElement
        ? window.scrollY || document.documentElement.scrollTop
        : scrollElement.scrollTop;

    // Find the anchor whose section is closest to but not past the top
    let activeIdx = 0;
    let minDelta = Infinity;

    for (const [idx, anchor] of anchorElementsRef.current.entries()) {
      const sectionId = anchor.getAttribute(`data-${dataAttribute}-anchor`);
      const sectionElement = sectionId
        ? document.querySelector<HTMLElement>(`[id="${sectionId}"]`)
        : null;
      if (!sectionElement) {
        continue;
      }

      let customOffset = offset;
      const dataOffset = anchor.getAttribute(`data-${dataAttribute}-offset`);
      if (dataOffset) {
        customOffset = Math.trunc(Number(dataOffset));
      }

      const delta = Math.abs(
        sectionElement.offsetTop - customOffset - scrollTop
      );

      if (
        sectionElement.offsetTop - customOffset <= scrollTop &&
        delta < minDelta
      ) {
        minDelta = delta;
        activeIdx = idx;
      }
    }

    // If at bottom, force last anchor
    const { scrollHeight } = scrollElement as HTMLElement;
    const { clientHeight } = scrollElement as HTMLElement;

    if (scrollTop + clientHeight >= scrollHeight - 2) {
      activeIdx = anchorElementsRef.current.length - 1;
    }

    // Set only one anchor active and sync the URL hash
    const activeAnchor = anchorElementsRef.current[activeIdx];
    const sectionId =
      activeAnchor?.getAttribute(`data-${dataAttribute}-anchor`) || null;

    setActiveSection(sectionId);
  }, [anchorElementsRef, targetRef, dataAttribute, offset, setActiveSection]);

  const scrollTo = useCallback(
    (anchorElement: HTMLElement) => (event?: Event) => {
      if (event) {
        event.preventDefault();
      }
      const sectionId =
        anchorElement
          .getAttribute(`data-${dataAttribute}-anchor`)
          ?.replace("#", "") || null;
      if (!sectionId) {
        return;
      }
      const sectionElement = document.querySelector<HTMLElement>(
        `[id="${sectionId}"]`
      );
      if (!sectionElement) {
        return;
      }

      let scrollToElement: HTMLElement | Window | null =
        targetRef?.current === document
          ? window
          : (targetRef?.current as HTMLElement);

      if (scrollToElement instanceof HTMLElement) {
        const viewport = scrollToElement.querySelector(
          '[data-slot="scroll-area-viewport"]'
        );
        if (viewport instanceof HTMLElement) {
          scrollToElement = viewport;
        }
      }

      let customOffset = offset;
      const dataOffset = anchorElement.getAttribute(
        `data-${dataAttribute}-offset`
      );
      if (dataOffset) {
        customOffset = Math.trunc(Number(dataOffset));
      }

      const scrollTop = sectionElement.offsetTop - customOffset;

      if (scrollToElement && "scrollTo" in scrollToElement) {
        scrollToElement.scrollTo({
          top: scrollTop,
          left: 0,
          behavior: smooth ? "smooth" : "auto",
        });
      }
      setActiveSection(sectionId, true);
    },
    [dataAttribute, offset, smooth, targetRef, setActiveSection]
  );

  // Scroll to the section if the ID is present in the URL hash
  const scrollToHashSection = useCallback(() => {
    if (!history) {
      return;
    }
    const hash = CSS.escape(window.location.hash.replace("#", ""));

    if (hash) {
      const targetElement = document.querySelector(
        `[data-${dataAttribute}-anchor="${hash}"]`
      ) as HTMLElement;
      if (targetElement) {
        scrollTo(targetElement)();
      }
    }
  }, [dataAttribute, history, scrollTo]);

  useEffect(() => {
    // Query elements and store them in the ref, avoiding unnecessary re-renders
    if (selfRef.current) {
      anchorElementsRef.current = [
        ...selfRef.current.querySelectorAll(`[data-${dataAttribute}-anchor]`),
      ];
    }

    const currentAnchors = anchorElementsRef.current;
    const listeners = currentAnchors?.map((item) => {
      const handler = scrollTo(item as HTMLElement);
      item.addEventListener("click", handler);
      return { item, handler };
    });

    const onScroll = (event: Event) => {
      const scrollElement =
        targetRef?.current === document
          ? window
          : (targetRef?.current as HTMLElement);
      if (!scrollElement) {
        return;
      }

      if (
        scrollElement === window ||
        (scrollElement instanceof HTMLElement &&
          scrollElement.contains(event.target as Node))
      ) {
        handleScroll();
      }
    };

    // Use window listener with capture to catch scroll events from targetRef even if set later
    window.addEventListener("scroll", onScroll, true);

    // Check if there's a hash in the URL and scroll to the corresponding section
    const initialTimeout = setTimeout(() => {
      scrollToHashSection();
      handleScroll();
    }, 100);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      for (const { item, handler } of listeners ?? []) {
        item.removeEventListener("click", handler);
      }
      clearTimeout(initialTimeout);
    };
  }, [
    // Rebind anchors when the live transcript adds or replaces navigation items.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
    children,
    targetRef,
    selfRef,
    handleScroll,
    dataAttribute,
    scrollTo,
    scrollToHashSection,
  ]);

  return (
    <div data-slot="scrollspy" className={className} ref={selfRef}>
      {children}
    </div>
  );
}
