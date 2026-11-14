// The part of bun:ffi the app window uses (tsc has no Bun types here).
declare module "bun:ffi" {
  export function dlopen(path: string, symbols: Record<string, { args: string[]; returns: string }>): { symbols: Record<string, (...args: unknown[]) => unknown>; close(): void };
}
