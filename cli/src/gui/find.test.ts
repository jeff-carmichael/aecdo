import { test } from "node:test";
import assert from "node:assert/strict";

interface FinderLike {
  search(query: string): Promise<void>;
  after(fn: () => void): Promise<void>;
}
type FinderClass = new (lookup: (q: string) => Promise<string[]>, show: (m: string[] | undefined) => void) => FinderLike;

// The app's frontend file, loaded from the source tree (dist/src/gui → repo root).
const { Finder } = (await import(new URL("../../../cli/gui/find.js", import.meta.url).href)) as { Finder: FinderClass };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

test("keys pressed before the matches arrive act on the filtered list", async () => {
  const log: string[] = [];
  const answer = deferred<string[]>();
  const finder = new Finder(
    () => answer.promise,
    (m) => log.push(`show ${m?.join(",") ?? "all"}`),
  );
  void finder.search("a1");
  void finder.after(() => log.push("down"));
  const done = finder.after(() => log.push("enter"));
  await Promise.resolve();
  assert.deepEqual(log, []);
  answer.resolve(["A101", "A102"]);
  await done;
  assert.deepEqual(log, ["show A101,A102", "down", "enter"]);
});

test("a slower, older search doesn't replace newer matches", async () => {
  const shown: (string[] | undefined)[] = [];
  const answers = new Map([
    ["a", deferred<string[]>()],
    ["a1", deferred<string[]>()],
  ]);
  const finder = new Finder(
    (q) => answers.get(q)!.promise,
    (m) => shown.push(m),
  );
  const first = finder.search("a");
  const second = finder.search("a1");
  answers.get("a1")!.resolve(["A101"]);
  await second;
  answers.get("a")!.resolve(["A101", "A201"]);
  await first;
  assert.deepEqual(shown, [["A101"]]);
});

test("clearing the filter shows every sheet at once and drops a pending search", async () => {
  const shown: (string[] | undefined)[] = [];
  const answer = deferred<string[]>();
  const finder = new Finder(
    () => answer.promise,
    (m) => shown.push(m),
  );
  const pending = finder.search("a");
  void finder.search("");
  assert.deepEqual(shown, [undefined]);
  answer.resolve(["A101"]);
  await pending;
  assert.deepEqual(shown, [undefined]);
});

test("a failed lookup still lets queued keys run", async () => {
  const finder = new Finder(
    () => Promise.reject(new Error("offline")),
    () => assert.fail("nothing to show"),
  );
  void finder.search("a");
  let ran = false;
  await finder.after(() => (ran = true));
  assert.equal(ran, true);
});
