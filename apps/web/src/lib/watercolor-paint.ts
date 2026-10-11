interface PaintTextures {
  blue: HTMLCanvasElement;
  violet: HTMLCanvasElement;
  rose: HTMLCanvasElement;
}

let texturePromise: Promise<PaintTextures | null> | undefined;

async function createPaintTextures(): Promise<PaintTextures | null> {
  try {
    const image = new Image();
    image.src = "/images/watercolor/pigment.jpg";
    await image.decode();
    const source = document.createElement("canvas");
    source.width = 1024;
    source.height = Math.round((image.height / image.width) * source.width);
    const context = source.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return null;
    }
    context.drawImage(image, 0, 0, source.width, source.height);
    const pixels = context.getImageData(0, 0, source.width, source.height);
    const tint = (red: number, green: number, blue: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = source.width;
      canvas.height = source.height;
      const target = canvas.getContext("2d");
      if (!target) {
        throw new Error("Watercolor texture context unavailable");
      }
      const wash = target.createImageData(canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const density = 1 - (pixels.data[index] ?? 255) / 255;
        wash.data[index] = red;
        wash.data[index + 1] = green;
        wash.data[index + 2] = blue;
        wash.data[index + 3] = Math.min(230, (0.02 + density * 1.55) * 255);
      }
      target.putImageData(wash, 0, 0);
      return canvas;
    };
    const violet = tint(141, 119, 217);
    const violetContext = violet.getContext("2d");
    if (violetContext) {
      const spread = violetContext.createLinearGradient(0, 0, violet.width, 0);
      spread.addColorStop(0, "transparent");
      spread.addColorStop(0.45, "rgba(0,0,0,0.3)");
      spread.addColorStop(1, "black");
      violetContext.globalCompositeOperation = "destination-in";
      violetContext.fillStyle = spread;
      violetContext.fillRect(0, 0, violet.width, violet.height);
    }
    const rose = tint(225, 143, 169);
    const roseContext = rose.getContext("2d");
    if (roseContext) {
      const bloom = roseContext.createRadialGradient(
        rose.width * 0.55,
        rose.height * 0.2,
        0,
        rose.width * 0.55,
        rose.height * 0.2,
        rose.width * 0.34
      );
      bloom.addColorStop(0, "black");
      bloom.addColorStop(1, "transparent");
      roseContext.globalCompositeOperation = "destination-in";
      roseContext.fillStyle = bloom;
      roseContext.fillRect(0, 0, rose.width, rose.height);
    }
    return { blue: tint(73, 149, 234), violet, rose };
  } catch {
    // A pale painted silhouette still works if image decoding is unavailable.
    return null;
  }
}

/** Decode the pigment once, then reuse the tinted washes across canvases. */
export async function loadWatercolorPaint() {
  texturePromise ??= createPaintTextures();
  const pending = texturePromise;
  const paint = await pending;
  // A temporary decode/memory failure should not persist across conversations.
  if (!paint && texturePromise === pending) {
    texturePromise = undefined;
  }
  return paint;
}

export function normalizedLevel(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function approach(
  current: number,
  target: number,
  seconds: number,
  time: number
) {
  return current + (target - current) * (1 - Math.exp(-seconds / time));
}

/** The contour is broad; fine fixed irregularities give its edge paper texture. */
function surfaceY(
  x: number,
  width: number,
  height: number,
  time: number,
  level: number,
  layer: number
) {
  const position = x / width;
  const envelope = Math.sin(Math.PI * position);
  const phase = time * 0.95 + layer * 1.2;
  const swell = Math.sin(position * Math.PI * 4.3 - phase);
  const ripple = Math.sin(position * Math.PI * 6.6 + phase * 0.7);
  const grain =
    Math.sin(x * 1.73) * 0.42 +
    Math.sin(x * 0.43) * 0.65 +
    Math.sin(x * 0.13) * 0.8;
  return (
    height * (0.46 + layer * 0.047 - level * 0.065) -
    envelope *
      height *
      (0.045 + swell * (0.024 + level * 0.09) + ripple * 0.015) +
    grain
  );
}

function contour(
  width: number,
  height: number,
  time: number,
  level: number,
  layer: number
) {
  const path = new Path2D();
  path.moveTo(-2, height + 2);
  for (let x = 0; x <= width + 2; x += 2) {
    path.lineTo(x, surfaceY(x, width, height, time, level, layer));
  }
  path.lineTo(width + 2, height + 2);
  path.closePath();
  return path;
}

/** Bend the pigment itself, with adjoining strips sharing the same flow field. */
function drawFlowingPigment(
  context: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  width: number,
  height: number,
  time: number,
  level: number,
  offset: number
) {
  const phase = time * (0.9 + offset * 0.0015) + offset * 0.06;
  const strength = Math.min(42, height * (0.028 + level * 0.13));
  const paintWidth = width + 200;
  const paintHeight = height + 130;
  const left = -100 + Math.sin(phase * 0.72) * (14 + level * 28);
  const top = height * 0.16 - 60 + Math.cos(phase * 0.48) * 9;
  const sourceScale = texture.width / paintWidth;
  // A continuous shear keeps broad paint motion smooth with fewer draw calls,
  // leaving room to draw at the display's frame rate on mobile.
  const stripWidth = Math.max(12, Math.ceil(width / 48));
  const displacement = (x: number) =>
    strength *
    (Math.sin((x / width) * Math.PI * 2.3 + phase) * 0.7 +
      Math.sin((x / width) * Math.PI * 4.8 - phase * 0.65) * 0.3);

  for (let x = 0; x < width; x += stripWidth) {
    const span = Math.min(stripWidth, width - x);
    const y = displacement(x);
    const shear = (displacement(x + span) - y) / span;
    context.save();
    // Disjoint output bands prevent double alpha at seams. Sample slightly
    // beyond each band so image interpolation never sees a transparent edge.
    context.beginPath();
    context.rect(x, 0, span, height);
    context.clip();
    context.transform(1, shear, 0, 1, x, top + y);
    context.drawImage(
      texture,
      (x - left - 1) * sourceScale,
      0,
      (span + 2) * sourceScale,
      texture.height,
      -1,
      0,
      span + 2,
      paintHeight
    );
    context.restore();
  }
}

export function drawWatercolor({
  context,
  width,
  height,
  time,
  level,
  colorLevel,
  textures,
  background,
  dark,
}: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  level: number;
  colorLevel: number;
  textures: PaintTextures | null;
  background: string;
  dark: boolean;
}) {
  context.clearRect(0, 0, width, height);
  const blue = contour(width, height, time, level, 0);
  context.fillStyle = dark
    ? "rgba(114,160,238,0.12)"
    : "rgba(128,181,242,0.09)";
  context.fill(blue);

  if (textures) {
    const drift = (Math.sin(time * 0.25) + 1) / 2;
    const layers = [
      { texture: textures.blue, path: blue, opacity: 0.48, offset: 0 },
      {
        texture: textures.violet,
        path: contour(width, height, time, level, 1),
        opacity: 0.1 + colorLevel * (0.55 + drift * 0.2),
        offset: 37,
      },
      {
        texture: textures.rose,
        path: blue,
        opacity: colorLevel * (0.35 + (1 - drift) * 0.2),
        offset: 83,
      },
    ];
    for (const layer of layers) {
      if (layer.opacity === 0) {
        continue;
      }
      context.save();
      context.clip(layer.path);
      context.globalAlpha = layer.opacity * (dark ? 0.72 : 1);
      drawFlowingPigment(
        context,
        layer.texture,
        width,
        height,
        time,
        level,
        layer.offset
      );
      context.restore();
    }
  }

  // A second, faint edge deposits pigment just beneath the outer contour.
  context.save();
  context.clip(blue);
  context.strokeStyle = dark
    ? "rgba(142,182,244,0.13)"
    : "rgba(92,150,225,0.11)";
  context.lineWidth = 1.8;
  context.stroke(blue);
  context.restore();

  // Dilute the lower wash so the fixed status and controls sit on quiet paint.
  const fade = context.createLinearGradient(0, height * 0.48, 0, height);
  fade.addColorStop(0, "transparent");
  fade.addColorStop(1, background);
  context.globalAlpha = dark ? 0.3 : 0.5;
  context.fillStyle = fade;
  context.fillRect(0, height * 0.48, width, height * 0.52);
  context.globalAlpha = 1;
}
