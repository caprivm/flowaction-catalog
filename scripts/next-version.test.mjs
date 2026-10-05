// Tests for next-version.mjs. Run with `node --test scripts/next-version.test.mjs`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bumpOf, latestVersion, nextVersion } from "./next-version.mjs";

test("picks the highest SemVer tag and ignores the rest", () => {
  assert.deepEqual(latestVersion(["v1.2.0", "v1.10.0", "v1.9.3", "latest", "v2.0", ""]), [1, 10, 0]);
  assert.equal(latestVersion(["latest"]), undefined);
});

test("reads the bump from the Conventional Commit header and footer", () => {
  assert.equal(bumpOf("feat: add the email block (#4)"), "minor");
  assert.equal(bumpOf("feat(script): accept PowerShell"), "minor");
  assert.equal(bumpOf("fix: quote the URL (#5)"), "patch");
  assert.equal(bumpOf("perf: cache the image"), "patch");
  assert.equal(bumpOf("feat!: rename the url input"), "major");
  assert.equal(bumpOf("fix: drop timeout\n\nBREAKING CHANGE: timeout_seconds is gone"), "major");
  assert.equal(bumpOf("docs: explain tags"), "none");
  assert.equal(bumpOf("ci: pin actionlint"), "none");
  assert.equal(bumpOf("Merge pull request #3 from branch"), "none");
});

test("only the subject sets the type of a squashed commit", () => {
  assert.equal(bumpOf("docs: update README (#6)\n\n* feat: something listed in the body"), "none");
});

test("computes the next tag from the highest bump", () => {
  assert.equal(nextVersion(undefined, []), "v1.0.0");
  assert.equal(nextVersion([1, 0, 0], ["docs: a", "fix: b"]), "v1.0.1");
  assert.equal(nextVersion([1, 0, 1], ["fix: b", "feat: c"]), "v1.1.0");
  assert.equal(nextVersion([1, 1, 0], ["feat: c", "feat!: d"]), "v2.0.0");
  assert.equal(nextVersion([1, 1, 0], ["docs: a", "chore: b"]), undefined);
});
