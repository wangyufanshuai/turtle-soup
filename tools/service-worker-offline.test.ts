import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("offline route navigation can read precached Next.js RSC exports with _rsc query", async () => {
  let listener: (event: { request: Request; respondWith: (value: Promise<Response>) => void }) => void;
  let fetches = 0;
  const precached = new Map([
    ["/case/c84-handoff-after-stop/__next._tree.txt", "static route tree"],
    ["/case/c84-handoff-after-stop/", "case html"],
  ]);
  runInNewContext(readFileSync("apps/web/public/sw.js", "utf8"), {
    self: { location: { origin: "http://localhost:8135" }, addEventListener: (type: string, fn: typeof listener) => { if (type === "fetch") listener = fn; } },
    caches: { open: async () => ({ match: async (key: Request | string) => { const value = precached.get(typeof key === "string" ? key : key.url); return value ? new Response(value) : undefined; } }) },
    fetch: async () => { fetches++; throw new Error("source origin offline"); },
    URL, Response,
  });
  let response!: Promise<Response>;
  listener!({ request: new Request("http://localhost:8135/case/c84-handoff-after-stop/__next._tree.txt?_rsc=hash"), respondWith: value => { response = value; } });
  assert.equal(await (await response).text(), "static route tree");
  assert.equal(fetches, 0);
  listener!({ request: new Request("http://localhost:8135/case/c84-handoff-after-stop/__next._tree.txt?custom=value"), respondWith: value => { response = value; } });
  assert.equal((await response).type, "error", "unrelated query semantics must not be replaced by a static response");
  assert.equal(fetches, 1);
});
