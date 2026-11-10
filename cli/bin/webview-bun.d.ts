// The parts of webview-bun the app window uses. The package ships TypeScript written for Bun's
// module resolution, which tsc can't check here, so tsconfig.bun.json maps it to this file.
export declare const enum SizeHint {
  NONE = 0,
  MIN = 1,
  MAX = 2,
  FIXED = 3,
}

export declare class Webview {
  constructor(debug?: boolean, size?: { width: number; height: number; hint: SizeHint });
  set title(title: string);
  navigate(url: string): void;
  bind(name: string, callback: (...args: never[]) => unknown): void;
  run(): void;
  terminate(): void;
}
