import { PageOrientation } from "./types";

export const A4_PORTRAIT_MM = { w: 210, h: 297 };
export const A4_LANDSCAPE_MM = { w: 297, h: 210 };

// Fisso per ora, poi potremo usare devicePixelRatio
export const pxPerMm = 3.78;

export function mmToPx(mm: number): number {
  return mm * pxPerMm;
}

export function pxToMm(px: number): number {
  return px / pxPerMm;
}

export function getPageMm(orientation: PageOrientation): { w: number; h: number } {
  return orientation === "portrait" ? A4_PORTRAIT_MM : A4_LANDSCAPE_MM;
}

export function snapToGrid(valueMm: number, stepMm: number): number {
  return Math.round(valueMm / stepMm) * stepMm;
}

