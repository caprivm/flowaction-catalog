# Contributing

Contributions to the FlowAction public catalog are welcome. For a substantial
change, open an issue first to discuss the proposed behavior. Submit changes as
a pull request against `main`, with a clear description of the change and any
relevant compatibility or security impact.

## Adding or changing a block

Each catalog block consists of a manifest at
`.flowaction/blocks/<id>/block.json` and the reusable workflow it names under
`.github/workflows/`. Keep both in sync:

- The manifest must follow `flowaction.block/v1` and the schema in
  `schemas/block.v1.json`.
- The workflow must be triggered only by `workflow_call`; its inputs, secrets,
  and outputs must match the manifest.
- Keep workflow permissions to exactly `contents: read`. Pass caller-provided
  values to shell scripts through environment variables, not expressions
  interpolated into `run:` commands.
- Declare credentials as workflow secrets. Pin every action to a full commit
  SHA and include its version in a comment.
- Preserve the task output contract documented in the README.
- If a block's inputs, secrets, or outputs change, update that block's manifest
  `version` according to the contract change.

The pull-request CI workflow runs `actionlint` and validates block manifests,
workflow declarations, and the repository's workflow security conventions.
Please check that it passes before requesting review.

## Pull requests and releases

Use a Conventional Commit title for the pull request because squash-merge
commits determine catalog releases. For example, use `feat:` for a
backward-compatible feature, `fix:` for a patch, and `feat!:` or a
`BREAKING CHANGE:` footer for an incompatible change. Documentation-only
changes can use `docs:` and do not trigger a release. See the README's
**Versions** section for the complete release rules.
