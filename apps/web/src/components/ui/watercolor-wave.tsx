import { useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent, useRef } from "react";

import { cn } from "@/lib/utils";
import {
  approach,
  drawWatercolor,
  loadWatercolorPaint,
  normalizedLevel,
} from "@/lib/watercolor-paint";

/** Decorative watercolor; microphone ownership stays with the conversation. */
export function WatercolorWave({
  active = true,
  getLevel,
  previewLevel = 0,
  className,
}: {
  active?: boolean;
  getLevel?: () => number;
  /** Simulated loudness for previews. This component never opens a microphone. */
  previewLevel?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wakeAnimation = useRef<(() => void) | null>(null);
  const reducedMotion = useReducedMotion();
  const isActive = useEffectEvent(() => active);
  const readLevel = useEffectEvent(() =>
    active ? normalizedLevel(getLevel ? getLevel() : previewLevel) : 0
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    let disposed = false;
    let visible = true;
    let frame = 0;
    let lastTime = 0;
    let time = 0;
    let level = 0;
    let colorLevel = 0;
    let width = 0;
    let height = 0;
    let dark = false;
    let background = "#faf8f3";
    let textures: Awaited<ReturnType<typeof loadWatercolorPaint>> = null;

    const draw = () => {
      if (width > 0 && height > 0) {
        drawWatercolor({
          context,
          width,
          height,
          time,
          level,
          colorLevel,
          textures,
          background,
          dark,
        });
      }
    };
    const tick = (now: number) => {
      frame = 0;
      if (disposed || !visible || document.hidden) {
        return;
      }
      // Follow the display cadence. Skipping frames made the flowing texture
      // stutter, especially when the display's refresh rate was not 60 Hz.
      const seconds = Math.min(
        lastTime ? (now - lastTime) / 1000 : 1 / 60,
        0.1
      );
      lastTime = now;
      // Boost visual sensitivity 4× so normal speech makes a clear swell.
      // This changes only the paint, not microphone gain or speech detection.
      const target = Math.sqrt(Math.min(1, readLevel() * 4));
      level = approach(level, target, seconds, target > level ? 0.08 : 0.4);
      colorLevel = approach(colorLevel, level, seconds, 2.4);
      const motion = isActive() ? 1 : Math.min(1, level * 10);
      // Integrate speed rather than changing an absolute phase with loudness.
      time += seconds * (0.8 + level * 0.9) * motion;
      draw();
      if (!isActive() && level < 0.002 && colorLevel < 0.005) {
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const updateAnimation = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      if (disposed || !visible || document.hidden) {
        return;
      }
      if (reducedMotion) {
        level = 0;
        colorLevel = 0;
        draw();
      } else {
        frame = requestAnimationFrame(tick);
      }
    };
    wakeAnimation.current = updateAnimation;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };
    const readTheme = () => {
      dark = document.documentElement.classList.contains("dark");
      background =
        getComputedStyle(canvas).getPropertyValue("--background").trim() ||
        "#faf8f3";
      draw();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      updateAnimation();
    });
    intersectionObserver.observe(canvas);
    const themeObserver = new MutationObserver(readTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    document.addEventListener("visibilitychange", updateAnimation);
    readTheme();
    resize();
    updateAnimation();
    void loadWatercolorPaint().then((paint) => {
      if (!disposed) {
        textures = paint;
        draw();
      }
    });

    return () => {
      disposed = true;
      wakeAnimation.current = null;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", updateAnimation);
      // Release this backing store while leaving the shared pigment cache reusable.
      canvas.width = 1;
      canvas.height = 1;
    };
  }, [reducedMotion]);

  useEffect(() => {
    wakeAnimation.current?.();
  }, [active]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
