import {
  motion,
  type MotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useId } from "react";

import { cn } from "@/lib/utils";

type ChitState = "idle" | "listening" | "thinking" | "speaking";

const pieces = [
  {
    name: "blue",
    thinkingDelay: 1.2,
    origin: "55% 78%",
    path: "M270 780 L345 804 Q408 866 480 872 Q555 880 620 795 Q665 743 674 669 Q694 714 800 704 Q908 706 966 674 L1000 674 L1000 970 L270 970Z",
    x: 0,
    y: 5,
    rotate: 3,
  },
  {
    name: "red",
    thinkingDelay: 0,
    origin: "28% 44%",
    path: "M270 370 H655 Q671 475 668 565 L674 669 Q665 743 620 795 Q555 880 480 872 Q408 866 345 804 L270 780Z",
    x: -5,
    y: -3,
    rotate: -4,
  },
  {
    name: "yellow",
    thinkingDelay: 0.6,
    origin: "76% 30%",
    path: "M655 370 H1000 V674 H966 Q908 706 800 704 Q694 714 674 669 L668 565 Q671 475 655 370Z",
    x: 5,
    y: -4,
    rotate: 5,
  },
] as const;

/** Three independent crayon pieces; idle stays still and speech opens the mark. */
export function ChitAvatar({
  state = "idle",
  size = 88,
  className,
  label = "Chit",
  getAnalyser,
  previewLevel = 0,
}: {
  state?: ChitState;
  size?: number;
  className?: string;
  label?: string;
  getAnalyser?: () => AnalyserNode | null;
  /** Explicit simulated loudness for the design gallery; no microphone access. */
  previewLevel?: number;
}) {
  const reducedMotion = useReducedMotion();
  const id = useId();
  const level = useSpring(0, { stiffness: 380, damping: 30 });
  const active = state === "speaking" || state === "listening";
  const intensity = state === "listening" ? 0.3 : 1;

  useEffect(() => {
    if (reducedMotion) {
      level.jump(0);
      return;
    }
    if (!active) {
      level.set(0);
      return;
    }
    if (!getAnalyser) {
      level.set(Math.max(0, Math.min(1, previewLevel)) * intensity);
      return;
    }
    let frame = 0;
    let samples = new Float32Array(0);
    const update = () => {
      // Resolve every frame: playback and microphone analysers can switch
      // without a React render, including pauses within Chit's reply.
      const analyser = getAnalyser();
      let loudness = 0;
      if (analyser) {
        if (samples.length !== analyser.fftSize) {
          samples = new Float32Array(analyser.fftSize);
        }
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) {
          energy += sample * sample;
        }
        const rms = Math.sqrt(energy / Math.max(1, samples.length));
        // Ignore the quiet noise floor; match our existing audio meter gain.
        loudness = Math.min(1, Math.max(0, rms - 0.01) * 4);
      }
      level.set(loudness * intensity);
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [active, getAnalyser, intensity, level, previewLevel, reducedMotion]);
  return (
    <span
      role="img"
      aria-label={label}
      data-state={state}
      className={cn("relative inline-block shrink-0 align-middle", className)}
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-[12%]">
        {pieces.map((piece) => (
          <ChitPiece
            key={piece.name}
            piece={piece}
            id={id}
            level={level}
            size={size}
            thinking={state === "thinking" && !reducedMotion}
            reducedMotion={Boolean(reducedMotion)}
          />
        ))}
      </span>
    </span>
  );
}

function ChitPiece({
  piece,
  id,
  level,
  size,
  thinking,
  reducedMotion,
}: {
  piece: (typeof pieces)[number];
  id: string;
  level: MotionValue<number>;
  size: number;
  thinking: boolean;
  reducedMotion: boolean;
}) {
  const x = useTransform(level, (value) => (piece.x * value * size) / 88);
  const y = useTransform(level, (value) => (piece.y * value * size) / 88);
  const rotate = useTransform(level, (value) => piece.rotate * value);
  const scale = useTransform(level, (value) => 1 + 0.07 * value);
  return (
    <motion.span className="absolute inset-0" style={{ x, y, rotate, scale }}>
      <motion.svg
        style={{ transformOrigin: piece.origin }}
        animate={{ rotate: thinking ? [0, 3, -1.5, 0, 0] : 0 }}
        transition={
          thinking
            ? {
                duration: 2.4,
                times: [0, 0.1, 0.2, 0.3, 1],
                delay: piece.thinkingDelay,
                repeat: Infinity,
                ease: "easeInOut",
              }
            : { duration: reducedMotion ? 0 : 0.2, delay: 0, repeat: 0 }
        }
        aria-hidden="true"
        viewBox="270 370 720 600"
        className="size-full"
        overflow="visible"
      >
        <defs>
          <clipPath id={`${id}-${piece.name}`}>
            <path d={piece.path} />
          </clipPath>
        </defs>
        <image
          href="/images/chit/original.png"
          width="1254"
          height="1254"
          clipPath={`url(#${id}-${piece.name})`}
        />
      </motion.svg>
    </motion.span>
  );
}
