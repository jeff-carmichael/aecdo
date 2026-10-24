// Populated only by the Bun standalone entry (cli/bin/standalone.ts). A compiled
// binary has no package.json or ontology/ beside it, so those are bundled in.
export interface EmbeddedAssets {
  version?: string;
  schema?: Record<string, unknown>;
}

export const embedded: EmbeddedAssets = {};
