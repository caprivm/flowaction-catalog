// Computes the next catalog release from the Conventional Commits merged since the latest tag.
//
// - A `!` after the type (`feat!:`) or a `BREAKING CHANGE:` footer bumps the major version.
// - `feat` bumps the minor version.
// - `fix`, `perf` and `revert` bump the patch version.
// - Anything else (`docs`, `ci`, `chore`, `test`, `refactor`, `style`, `build`) makes no release.
//
// With no `vX.Y.Z` tag yet, the first release is v1.0.0: the catalog's blocks were already
// published as 1.0.0 before tags existed.
//
// Usage: node scripts/next-version.mjs prints the next tag (for example `v1.2.0`), or nothing when
// no release is due. Dependency-free on purpose.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HEADER = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<breaking>!)?: \S/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /m;
const BUMPS = { feat: "minor", fix: "patch", perf: "patch", revert: "patch" };
const RANK = { none: 0, patch: 1, minor: 2, major: 3 };

/** The highest `vX.Y.Z` tag, as [major, minor, patch], or undefined when there is none. */
export function latestVersion(tags) {
  return tags
    .map((tag) => TAG.exec(tag.trim()))
    .filter(Boolean)
    .map((match) => match.slice(1, 4).map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
    .at(-1);
}

/** The bump one commit message asks for: "major", "minor", "patch" or "none". */
export function bumpOf(message) {
  const [subject = ""] = message.trim().split("\n");
  const header = HEADER.exec(subject);
  if (header?.groups.breaking || BREAKING_FOOTER.test(message)) return "major";
  return BUMPS[header?.groups.type] ?? "none";
}

/** The next tag after `current` for these commit messages, or undefined when none is due. */
export function nextVersion(current, messages) {
  if (!current) return "v1.0.0";
  const bump = messages
    .map(bumpOf)
    .reduce((highest, next) => (RANK[next] > RANK[highest] ? next : highest), "none");
  const [major, minor, patch] = current;
  if (bump === "major") return `v${major + 1}.0.0`;
  if (bump === "minor") return `v${major}.${minor + 1}.0`;
  if (bump === "patch") return `v${major}.${minor}.${patch + 1}`;
  return undefined;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const current = latestVersion(git("tag", "--list", "v*").split("\n"));
  const messages = current
    ? git("log", "--format=%B%x1e", `v${current.join(".")}..HEAD`)
        .split("\x1e")
        .filter((message) => message.trim())
    : [];
  const next = nextVersion(current, messages) ?? "";
  console.log(next);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${next}\n`);
  }
}
