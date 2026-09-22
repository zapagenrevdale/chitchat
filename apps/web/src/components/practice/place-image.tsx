import type {
  CustomPlaceSummary,
  PlaceImageRequest,
} from "@chitchat/contracts";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Dialog } from "radix-ui";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/env";

import { TiltImage } from "./tilt-image";

export function PlaceImage({
  place,
  scene,
  imageSrc,
}: {
  place: CustomPlaceSummary;
  scene?: PlaceImageRequest["scene"];
  imageSrc?: string;
}) {
  const [open, setOpen] = useState(false);
  const imageId = useId();
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion
    ? { duration: 0.15 }
    : ({ type: "spring", bounce: 0, duration: 0.4 } as const);
  const {
    data: generatedImage,
    isPending,
    isError,
    refetch,
  } = useQuery({
    // Regenerate cached scenes with the refined character and framing instructions.
    queryKey: ["place-image", 3, place.name, place.description, scene],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${apiUrl}/api/practice/place-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: place.name,
          description: place.description,
          scene,
        }),
        signal,
      });
      if (!response.ok) {
        throw new Error("Couldn't create the place image.");
      }
      const result: { image?: unknown } = await response.json();
      if (
        typeof result.image !== "string" ||
        !result.image.startsWith("data:image/")
      ) {
        throw new Error("No place image was returned.");
      }
      return result.image;
    },
    enabled: !imageSrc,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    retryOnMount: false,
  });

  const data = imageSrc ?? generatedImage;
  const description = scene
    ? `${place.name}. ${scene.situation.description}`
    : place.description;

  return (
    <div
      className={`relative flex aspect-3/2 w-60 max-w-full items-center justify-center rounded-2xl ${data ? "" : "bg-muted"}`}
    >
      {data && (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <motion.button
              type="button"
              aria-label={`Enlarge ${place.name} photo`}
              className="focus-visible:outline-ring size-full cursor-zoom-in outline-offset-4 focus-visible:outline-2"
              style={{ borderRadius: 16 }}
              layoutId={reducedMotion ? undefined : imageId}
              transition={transition}
            >
              <TiltImage src={data} alt={description} disabled={open} />
            </motion.button>
          </Dialog.Trigger>
          <Dialog.Portal forceMount>
            <AnimatePresence>
              {open && (
                <div
                  key="photo-dialog"
                  className="pointer-events-none fixed inset-0 z-50 grid place-items-center"
                >
                  <Dialog.Overlay forceMount asChild>
                    <motion.div
                      className="pointer-events-auto absolute inset-0 bg-black/60"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reducedMotion ? 0.15 : 0.25 }}
                    />
                  </Dialog.Overlay>
                  <Dialog.Content forceMount asChild>
                    <motion.div
                      layoutId={reducedMotion ? undefined : imageId}
                      transition={transition}
                      initial={reducedMotion ? { opacity: 0 } : false}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: reducedMotion ? 0 : 1 }}
                      style={{
                        borderRadius: 16,
                        width:
                          "min(36rem, calc(100vw - 4rem), calc((100dvh - 8rem) * 1.5))",
                      }}
                      className="pointer-events-auto relative aspect-3/2 outline-none"
                    >
                      <Dialog.Title className="sr-only">
                        {place.name}
                      </Dialog.Title>
                      <Dialog.Description className="sr-only">
                        {description}
                      </Dialog.Description>
                      <TiltImage src={data} alt={description} />
                      <Dialog.Close asChild>
                        <Button
                          variant="secondary"
                          size="icon"
                          aria-label="Close photo"
                          className="absolute -top-14 right-0"
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </Dialog.Close>
                    </motion.div>
                  </Dialog.Content>
                </div>
              )}
            </AnimatePresence>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {!imageSrc && isPending && (
        <output
          aria-label={
            scene ? "Generating practice scene" : "Generating place image"
          }
          className="flex flex-col items-center justify-center gap-4"
        >
          <motion.div
            aria-hidden="true"
            className="bg-primary size-10 shadow-sm"
            style={{ borderRadius: "10%" }}
            animate={
              reducedMotion
                ? undefined
                : {
                    borderRadius: ["10%", "50%", "10%"],
                    rotate: [0, 90, 180],
                    scale: [1, 0.8, 1],
                  }
            }
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="text-muted-foreground text-xs">
            {scene ? "Imagining your scene…" : "Imagining your place…"}
          </span>
        </output>
      )}
      {!imageSrc && isError && (
        <div className="flex flex-col items-center gap-1 px-2 text-center">
          <output className="text-muted-foreground text-xs">
            Image unavailable
          </output>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch();
            }}
          >
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
