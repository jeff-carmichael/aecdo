// Populated only by the Bun standalone entry (cli/bin/standalone.ts). A compiled
// binary has no package.json or ontology/ beside it, so those are bundled in.
export interface EmbeddedAssets {
  version?: string;
  schema?: Record<string, unknown>;
  /** The app's web files and PDF.js, by the path the app server serves them at (e.g. "pdfjs/pdf.min.mjs"). */
  guiAssets?: Record<string, string>;
  /** The command that opens the app window on `url` (the binary re-running itself), when webview is bundled. */
  windowCommand?: (url: string) => string[];
}

export const embedded: EmbeddedAssets = {};
