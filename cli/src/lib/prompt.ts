/** Opening the app needs a person at a terminal on both ends. */
export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}
