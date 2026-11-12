import { createRequire } from "node:module";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { embedded } from "../lib/embedded.js";

/** The app's own files, served under app/. Kept in step with cli/bin/embed-assets.ts. */
export const APP_FILES = ["index.html", "app.css", "app.js", "pdf-view.js", "chat.js", "list.js", "keys.js", "icon.svg", "icon.ico", "icon.icns"] as const;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".icns": "image/icns",
};

export function contentType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

let pdfjsRoot: string | undefined;

function pdfjsDir(): string {
  pdfjsRoot ??= dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  return pdfjsRoot;
}

/** cli/gui, from dist/src/gui/assets.js or cli/src/gui/assets.ts. */
function appDir(): string {
  return fileURLToPath(new URL("../../../cli/gui/", import.meta.url));
}

/**
 * Where a URL path under the app's root lives: "app/…" in cli/gui, "pdfjs/…" in pdfjs-dist.
 * The standalone binary carries these files itself (embedded.guiAssets).
 */
export function assetPath(urlPath: string): string | undefined {
  if (embedded.guiAssets) return embedded.guiAssets[urlPath];
  const clean = normalize(urlPath);
  if (clean.startsWith("..") || clean.includes(`${sep}..`)) return undefined;
  if (clean.startsWith(`app${sep}`)) {
    const name = clean.slice(4);
    return (APP_FILES as readonly string[]).includes(name) ? join(appDir(), name) : undefined;
  }
  if (clean.startsWith(`pdfjs${sep}`)) {
    const rest = clean.slice(6);
    if (/^(standard_fonts|wasm|cmaps)[\\/]/.test(rest)) return join(pdfjsDir(), rest);
    return join(pdfjsDir(), "legacy", "build", rest);
  }
  return undefined;
}
