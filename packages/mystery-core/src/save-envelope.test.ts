import assert from "node:assert/strict";
import { test } from "node:test";
import { createSaveArchive, validateSaveArchive, validateSaveEnvelope } from "./save-envelope.ts";

const validSave = {
  schemaVersion: 1,
  caseId: "c01-cold-room-knock",
  caseVersion: 1,
  contentHash: "sha256:c01-cold-room-knock-v1",
  commands: [
    { type: "ask_text", rawText: "门会自动上锁吗？" },
    { type: "select_theory", theoryId: "theory-a" },
  ],
  updatedAt: "2026-08-23T00:00:00.000Z",
  completed: false,
};

test("valid save envelopes are sanitized without carrying unknown spoiler fields", () => {
  const result = validateSaveEnvelope({ ...validSave, solutionCertificate: { spoiler: true } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal("solutionCertificate" in result.value, false);
  assert.deepEqual(result.value.commands, validSave.commands);
});

test("corrupt, partial, old-schema and invalid-command saves fail closed", () => {
  assert.equal(validateSaveEnvelope(null).ok, false);
  assert.equal(validateSaveEnvelope({ ...validSave, commands: undefined }).ok, false);
  assert.deepEqual(validateSaveEnvelope({ ...validSave, schemaVersion: 0 }), {
    ok: false,
    code: "unsupported_schema",
    reason: "存档格式版本不受支持",
  });
  assert.equal(validateSaveEnvelope({ ...validSave, commands: [{ type: "reveal_solution" }] }).ok, false);
});

test("AI-confirmed questions remain schema-one compatible and sanitize extra fields", () => {
  const command = { type: "ask_resolved_text", rawText: "门自己锁了吗？", queryId: "query-door-auto-lock", resolutionSource: "ai-confirmed", contextHash: "a1b2c3", apiKey: "must-not-survive" };
  const result = validateSaveEnvelope({ ...validSave, commands: [command] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.commands, [{ type: "ask_resolved_text", rawText: "门自己锁了吗？", queryId: "query-door-auto-lock", resolutionSource: "ai-confirmed", contextHash: "a1b2c3" }]);
  assert.equal(JSON.stringify(result.value).includes("must-not-survive"), false);
  assert.equal(validateSaveEnvelope({ ...validSave, commands: [{ ...command, resolutionSource: "model-decided" }] }).ok, false);
});

test("save archives reject duplicates and incompatible case identities", () => {
  const archive = createSaveArchive([validSave], "2026-08-23T00:00:00.000Z");
  const identities = { "c01-cold-room-knock": { caseVersion: 1, contentHash: "sha256:c01-cold-room-knock-v1" } };
  assert.equal(validateSaveArchive(archive, identities).ok, true);
  assert.equal(validateSaveArchive({ ...archive, saves: [validSave, validSave] }, identities).ok, false);
  assert.equal(validateSaveArchive(archive, { "c01-cold-room-knock": { caseVersion: 2, contentHash: "changed" } }).ok, false);
});
