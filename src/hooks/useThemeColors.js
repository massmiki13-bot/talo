import { useEffect } from "react";

function hexToRgb(hex) {
  if (!hex || !hex.startsWith("#")) return null;
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hexToHslString(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb);
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

function adjustLightness(hex, delta) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb);
  hsl.l = Math.max(0, Math.min(100, hsl.l + delta));
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

function getLuminance({ r, g, b }) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrastForegroundHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "0 0% 100%";
  return getLuminance(rgb) > 0.5 ? "222 47% 11%" : "0 0% 100%";
}

/**
 * Applies company profile colors to the app's CSS variables (HSL format).
 * Primary -> buttons, active nav, rings, charts.
 * Menu -> sidebar background.
 * Secondary/Tertiary/Quaternary -> chart accents (optional).
 */
export function useThemeColors(profile) {
  useEffect(() => {
    if (!profile) return;
    const root = document.documentElement;

    const primary = profile.colore_principale || "#1e40af";
    const primaryHsl = hexToHslString(primary);
    if (primaryHsl) {
      root.style.setProperty("--primary", primaryHsl);
      root.style.setProperty("--primary-foreground", contrastForegroundHsl(primary));
      root.style.setProperty("--ring", primaryHsl);
      root.style.setProperty("--sidebar-primary", primaryHsl);
      root.style.setProperty("--sidebar-primary-foreground", contrastForegroundHsl(primary));
      root.style.setProperty("--sidebar-ring", primaryHsl);
      root.style.setProperty("--chart-1", primaryHsl);
    }

    const menu = profile.colore_menu || "#0f172a";
    const menuHsl = hexToHslString(menu);
    if (menuHsl) {
      root.style.setProperty("--sidebar-background", menuHsl);
      root.style.setProperty("--sidebar-foreground", contrastForegroundHsl(menu));
      root.style.setProperty("--sidebar-accent", adjustLightness(menu, 8) || menuHsl);
      root.style.setProperty("--sidebar-accent-foreground", contrastForegroundHsl(menu));
      root.style.setProperty("--sidebar-border", adjustLightness(menu, 6) || menuHsl);
    }

    const sfondo = profile.colore_sfondo;
    if (sfondo) {
      const bgHsl = hexToHslString(sfondo);
      if (bgHsl) root.style.setProperty("--background", bgHsl);
    }

    if (profile.colore_secondario) {
      const hsl = hexToHslString(profile.colore_secondario);
      if (hsl) root.style.setProperty("--chart-2", hsl);
    }
    if (profile.colore_terziario) {
      const hsl = hexToHslString(profile.colore_terziario);
      if (hsl) root.style.setProperty("--chart-3", hsl);
    }
    if (profile.colore_quaternario) {
      const hsl = hexToHslString(profile.colore_quaternario);
      if (hsl) root.style.setProperty("--chart-4", hsl);
    }
  }, [
    profile?.colore_principale,
    profile?.colore_menu,
    profile?.colore_sfondo,
    profile?.colore_secondario,
    profile?.colore_terziario,
    profile?.colore_quaternario,
  ]);
}

export function getContrastColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  return getLuminance(rgb) > 0.5 ? "#0f172a" : "#ffffff";
}