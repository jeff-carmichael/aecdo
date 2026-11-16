import { readFileSync } from "node:fs";
import { embedded } from "./embedded.js";

let version: string | undefined;

/** This aecdo's version: bundled into the standalone binary, else read from package.json. */
export function appVersion(): string {
  version ??=
    embedded.version ??
    (JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf-8")) as { version: string }).version;
  return version;
}

/** Whether this is the standalone binary (which `aecdo update` can replace) rather than an npm install. */
export function isStandalone(): boolean {
  return embedded.version !== undefined;
}
