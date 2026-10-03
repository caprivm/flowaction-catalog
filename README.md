# flowaction-catalog

FlowAction public catalog of workflows that can be executed on the application.

Each block is a `workflow_call` reusable workflow plus a `flowaction.block/v1` manifest that tells FlowAction's modeler how to show and configure it. Execution repositories never copy these files: the segments FlowAction publishes call them from here, pinned by commit SHA.

```yaml
jobs:
  call_api:
    uses: caprivm/flowaction-catalog/.github/workflows/http-request.yml@<commit sha> # catalog 1.0.0
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

| Path                                 | Contents                                                       |
| ------------------------------------ | -------------------------------------------------------------- |
| `.github/workflows/<id>.yml`         | Block workflows (`workflow_call` only)                         |
| `.flowaction/blocks/<id>/block.json` | Block manifests (`flowaction.block/v1`)                        |
| `schemas/block.v1.json`              | JSON Schema of the manifest, also for custom blocks            |
| `scripts/validate.mjs`               | Checks every manifest against its workflow and the conventions |
| `.github/workflows/ci.yml`           | Runs actionlint and the validator on every pull request        |

## Custom blocks

Customers add their own blocks to their execution repository with the same contract: a manifest at `.flowaction/blocks/<id>/block.json` (add `"$schema"` pointing to `schemas/block.v1.json` for editor help) and the workflow it names, by convention `.github/workflows/flowaction-block-<id>.yml`. A custom block cannot reuse an id from this catalog.

## Rules for every block workflow

- Triggered only by `workflow_call`, with a required string input `task_id` and an optional `runs_on`; FlowAction fills both, so manifests do not list them.
- Inputs and secrets match the manifest exactly (name, type and required flag).
- `permissions: contents: read` and nothing more.
- Caller values reach the shell only through `env:`; `${{ }}` never appears inside `run:`.
- Credentials arrive only as `secrets:` mapped by the caller from a GitHub secret name.
- Actions are pinned by commit SHA with a `# vX.Y.Z` comment.
- The task output is a JSON object at `${{ runner.temp }}/flowaction-output/<task_id>.json`, uploaded as the `flowaction-output-<task_id>` artifact.

## Versions

Segments pin a commit SHA. Bump a block's `version` in its manifest whenever its inputs, secrets or outputs change, and tag releases (`v1.0.0`) so the pin can carry a readable comment.

## Access

GitHub lets other repositories call these workflows only if they can reach this repository. While it is private, only repositories owned by `caprivm` can use it, after enabling Settings → Actions → General → Access → "Accessible from repositories owned by the user 'caprivm'". Customers in other accounts need this repository to be public.
