import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect } from "react";
import type { PointerEvent } from "react";

const spring = { stiffness: 300, damping: 30 };

export function TiltImage({
  src,
  alt,
  disabled = false,
}: {
  src: string;
  alt: string;
  disabled?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const inactive = disabled || reducedMotion;
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);
  const engagement = useSpring(0, spring);
  const rotateX = useTransform(y, (value) => -value * 10);
  const rotateY = useTransform(x, (value) => value * 10);
  const z = useTransform(engagement, (value) => -value * 14);
  const shade = useTransform(() => {
    const horizontal = (x.get() + 1) * 50;
    const vertical = (y.get() + 1) * 50;
    return `radial-gradient(42% 34% at ${horizontal}% ${vertical}%, rgb(9 14 28 / 0.33), transparent), radial-gradient(52% 42% at ${100 - horizontal}% ${100 - vertical}%, rgb(255 255 255 / 0.204), transparent)`;
  });
  const shadow = useTransform(
    engagement,
    (value) =>
      `0 ${20 - value * 11}px ${44 - value * 20}px -8px rgb(15 23 42 / ${0.22 - value * 0.07})`
  );

  useEffect(() => {
    if (inactive) {
      x.jump(0);
      y.jump(0);
      engagement.jump(0);
    }
  }, [inactive, x, y, engagement]);

  function resetTilt() {
    x.set(0);
    y.set(0);
    engagement.set(0);
  }

  function updateTilt(event: PointerEvent<HTMLSpanElement>) {
    if (inactive || event.pointerType !== "mouse" || event.buttons !== 0) {
      return;
    }

    // Measure the stationary frame so rotation cannot move its own hit area.
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return;
    }
    x.set(
      Math.max(
        -1,
        Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1)
      )
    );
    y.set(
      Math.max(
        -1,
        Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1)
      )
    );
    engagement.set(1);
  }

  return (
    <span
      className="block size-full"
      style={{ perspective: 800 }}
      onPointerMove={updateTilt}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
      onPointerDown={resetTilt}
    >
      <motion.span
        className="bg-muted pointer-events-none relative block size-full overflow-hidden rounded-2xl"
        style={{
          rotateX: inactive ? 0 : rotateX,
          rotateY: inactive ? 0 : rotateY,
          z: inactive ? 0 : z,
          boxShadow: shadow,
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="block size-full object-cover"
        />
        <motion.span
          aria-hidden="true"
          className="absolute inset-0"
          style={{ backgroundImage: shade, opacity: inactive ? 0 : engagement }}
        />
      </motion.span>
    </span>
  );
}
