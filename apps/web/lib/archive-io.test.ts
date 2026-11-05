import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { loadCaseFile, loadReleaseContent } from "../../../tools/lib/release-content.ts";
import type { SaveEnvelope } from "@turtle-soup/mystery-core";
import {
  downloadSaveArchive,
  readSaveArchive,
  serializeSaveArchive,
  MAX_SAVE_ARCHIVE_BYTES,
} from "./archive-io.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const { entries } = loadReleaseContent(root, "v2.11-internal-rc");
const identities = Object.fromEntries(
  entries.map((item) => [
    item.id,
    { caseVersion: item.contentVersion, contentHash: item.canonicalHash },
  ]),
);
const saves: SaveEnvelope[] = entries.map((entry) => {
  const rawText = loadCaseFile(entry).questionSemantics[0].examplePhrases![0];
  return {
    schemaVersion: 1,
    caseId: entry.id,
    caseVersion: entry.contentVersion,
    contentHash: entry.canonicalHash,
    updatedAt: "2026-09-06T00:00:00.000Z",
    commands: Array.from({ length: 1_000 }, () => ({
      type: "ask_text",
      rawText,
    })),
  };
});

function downloadTransport(context: TestContext) {
  let blob: Blob | undefined;
  let downloads = 0;
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: { append: () => undefined },
      createElement: () => ({
        href: "",
        download: "",
        hidden: false,
        remove: () => undefined,
        click: () => {
          downloads += 1;
        },
      }),
    },
  });
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  });
  context.mock.method(URL, "createObjectURL", (value: Blob) => {
    blob = value;
    return "blob:archive-test";
  });
  context.mock.method(URL, "revokeObjectURL", () => undefined);
  context.mock.timers.enable({ apis: ["setTimeout"] });
  return {
    get blob() {
      return blob;
    },
    get downloads() {
      return downloads;
    },
  };
}

test("archive export/import round trips every frozen case with one thousand natural questions", async (context) => {
  const transport = downloadTransport(context);
  downloadSaveArchive(saves);
  assert.equal(transport.downloads, 1);
  assert.ok(transport.blob);
  const file = new File([transport.blob], "all-cases.json", { type: "application/json" });
  const imported = await readSaveArchive(file, identities);
  assert.equal(imported.ok, true);
  if (imported.ok) assert.deepEqual(imported.value.saves, saves);
});

test("archive rejects an oversized UTF-8 export before triggering any download", (context) => {
  const transport = downloadTransport(context);
  const oversized: SaveEnvelope = {
    ...saves[0],
    commands: Array.from({ length: 3_000 }, () => ({
      type: "ask_text",
      rawText: "问".repeat(2_000),
    })),
  };
  assert.throws(() => downloadSaveArchive([oversized]), /16 MiB|分批|按案/);
  assert.equal(transport.downloads, 0);
  assert.equal(transport.blob, undefined);
});

test("archive byte limit is inclusive, uses UTF-8, and rejects oversized input before reading it", async () => {
  const serialized = serializeSaveArchive([saves[0]]);
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  assert.ok(byteLength > serialized.length, "Chinese text must be measured as UTF-8 bytes");
  const exact = new File(
    [serialized, " ".repeat(MAX_SAVE_ARCHIVE_BYTES - byteLength)],
    "boundary.json",
  );
  assert.equal(exact.size, MAX_SAVE_ARCHIVE_BYTES);
  assert.equal((await readSaveArchive(exact, identities)).ok, true);
  let readCount = 0;
  const oversized = {
    size: MAX_SAVE_ARCHIVE_BYTES + 1,
    text: async () => {
      readCount += 1;
      return serialized;
    },
  } as File;
  assert.equal((await readSaveArchive(oversized, identities)).ok, false);
  assert.equal(readCount, 0);
});
