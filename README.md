# flowaction-catalog

FlowAction public catalog of workflows that can be executed on the application.

Each block is a `workflow_call` reusable workflow plus a `flowaction.block/v1` manifest that tells FlowAction's modeler how to show and configure it. Execution repositories never copy these files: the segments FlowAction publishes call them from here, pinned by commit SHA.

```yaml
jobs:
  call_api:
    uses: caprivm/flowaction-catalog/.github/workflows/http-request.yml@<commit sha> # v1.0.0
    with:
      task_id: call_api
      method: GET
      url: https://api.github.com/zen
    secrets:
      auth_token: ${{ secrets.MY_API_TOKEN }}
```

## Blocks

| Block                                                        | BPMN element | Workflow                             | Allowed actions                                            |
| ------------------------------------------------------------ | ------------ | ------------------------------------ | ---------------------------------------------------------- |
| [`http-request`](.flowaction/blocks/http-request/block.json) | Service task | `.github/workflows/http-request.yml` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| [`script`](.flowaction/blocks/script/block.json)             | Script task  | `.github/workflows/script.yml`       | Python, JavaScript (Node), Bash                            |

Forms, human approvals, timers, gateways and subprocesses are not here: FlowAction holds or evaluates them, so they never occupy a runner.

## Layout

| Path                                 | Contents                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `.github/workflows/<id>.yml`         | Block workflows (`workflow_call` only)                                                                    |
| `.flowaction/blocks/<id>/block.json` | Block manifests (`flowaction.block/v1`)                                                                   |
| `schemas/block.v1.json`              | JSON Schema of the manifest, also for custom blocks                                                       |
| `.github/workflows/ci.yml`           | Lints the workflows, validates every block and tags releases from `main` using only `bash`, `jq` and `yq` |

## Custom blocks

Customers add their own blocks to their execution repository with the same contract: a manifest at `.flowaction/blocks/<id>/block.json` (add `"$schema"` pointing to `schemas/block.v1.json` for editor help) and the workflow it names, by convention `.github/workflows/flowaction-block-<id>.yml`. A custom block cannot reuse an id from this catalog.

## Rules for every block workflow

- Triggered only by `workflow_call`, with a required string input `task_id` and an optional `runs_on`; FlowAction fills both, so manifests do not list them.
- Inputs and secrets match the manifest exactly (name, type and required flag).
- `permissions: contents: read` and nothing more.
- Caller values reach the shell only through `env:`; `${{ }}` never appears inside `run:`.
- Credentials arrive only as `secrets:` mapped by the caller from a GitHub secret name.
- Actions are pinned by commit SHA with a `# vX.Y.Z` comment.
- The task output is a JSON object at `${{ runner.temp }}/flowaction-output/<task_id>.json`, uploaded as the `flowaction-output-<task_id>` artifact, and also published as the `output` output of the workflow (compact JSON, left empty when it is larger than 32 KiB) so another task of the same segment can read it without downloading the artifact.
- Every output the workflow declares is listed in the manifest, and the other way round.

## Versions

The catalog is versioned with SemVer tags (`v1.0.0`, `v1.1.0`, `v2.0.0`). FlowAction lists them so each block of a process can use its own catalog version, and the segment pins the tag's commit SHA with the tag as a comment:

```yaml
uses: caprivm/flowaction-catalog/.github/workflows/http-request.yml@<commit sha> # v1.1.0
```

Tags are created automatically. After every push to `main` that passes validation, the `release` job in `ci.yml` reads the Conventional Commits merged since the latest tag and publishes the next tag with a GitHub release and generated notes:

| Commit since the last tag                                            | Next version     |
| -------------------------------------------------------------------- | ---------------- |
| `feat!:`, `fix!:` (any type with `!`) or a `BREAKING CHANGE:` footer | Major (`v2.0.0`) |
| `feat:`                                                              | Minor (`v1.1.0`) |
| `fix:`, `perf:`, `revert:`                                           | Patch (`v1.0.1`) |
| `docs:`, `ci:`, `chore:`, `test:`, `refactor:`, `style:`, `build:`   | No release       |

Only the subject line sets the type, so squash-merge pull requests with a Conventional Commit title. A change that removes or renames an input, secret or output of a block, or makes an input required, is breaking. The first run, with no tag yet, publishes `v1.0.0`. The logic is the `Compute the next version` step of `ci.yml`; on pull requests it runs as a dry run that prints the version and publishes nothing.

A block's manifest `version` is the version of that block's contract; bump it whenever its inputs, secrets or outputs change. The tag is the version of the whole catalog.

## Access

GitHub lets other repositories call these workflows only if they can reach this repository. While it is private, only repositories owned by `caprivm` can use it, after enabling Settings → Actions → General → Access → "Accessible from repositories owned by the user 'caprivm'". Customers in other accounts need this repository to be public.
