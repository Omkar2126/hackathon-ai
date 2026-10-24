import { l2Normalize } from "@/lib/embeddings";

export type FaceBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function cropAndEmbed(
  video: HTMLVideoElement,
  box: FaceBox,
): { embedding: number[]; thumbnail: string } {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { embedding: [], thumbnail: "" };

  const pad = 0.18;
  const sx = Math.max(0, box.x - box.w * pad);
  const sy = Math.max(0, box.y - box.h * pad);
  const sw = Math.min(video.videoWidth - sx, box.w * (1 + pad * 2));
  const sh = Math.min(video.videoHeight - sy, box.h * (1 + pad * 2));
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  return {
    embedding: describeFace(data, size),
    thumbnail: canvas.toDataURL("image/jpeg", 0.72),
  };
}

export function describeFace(data: Uint8ClampedArray, size: number): number[] {
  const cells = 8;
  const cell = size / cells;
  const vec: number[] = [];

  for (let cy = 0; cy < cells; cy += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let lumSum = 0;
      let lumSq = 0;
      let n = 0;
      for (let y = 0; y < cell; y += 1) {
        for (let x = 0; x < cell; x += 1) {
          const i = ((cy * cell + y) * size + (cx * cell + x)) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          lumSum += lum;
          lumSq += lum * lum;
          n += 1;
        }
      }
      vec.push(r / n / 255, g / n / 255, b / n / 255);
      const mean = lumSum / n;
      vec.push(Math.sqrt(Math.max(0, lumSq / n - mean * mean)) / 255);
    }
  }

  return l2Normalize(vec);
}

export function iou(a: FaceBox, b: FaceBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union === 0 ? 0 : inter / union;
}

export function lerpBox(from: FaceBox, to: FaceBox, t: number): FaceBox {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    w: from.w + (to.w - from.w) * t,
    h: from.h + (to.h - from.h) * t,
  };
}

export function mapBoxToStage(
  box: FaceBox,
  video: HTMLVideoElement,
  stage: HTMLElement,
  mirrored: boolean,
): FaceBox {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const cw = stage.clientWidth;
  const ch = stage.clientHeight;
  const scale = Math.max(cw / vw, ch / vh);
  const dx = (cw - vw * scale) / 2;
  const dy = (ch - vh * scale) / 2;
  const x = mirrored ? (vw - box.x - box.w) * scale + dx : box.x * scale + dx;
  const y = box.y * scale + dy;
  return { x, y, w: box.w * scale, h: box.h * scale };
}
