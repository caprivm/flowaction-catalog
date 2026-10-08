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

| Block | BPMN element | Workflow | Allowed actions |
| --- | --- | --- | --- |
| [`http-request`](.flowaction/blocks/http-request/block.json) | Service task | `.github/workflows/http-request.yml` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` |
| [`script`](.flowaction/blocks/script/block.json) | Script task | `.github/workflows/script.yml` | Python, JavaScript (Node), Bash |
| [`github`](.flowaction/blocks/github/block.json) | Service task | `.github/workflows/github.yml` | Issues, pull requests, releases, file edits, workflow runs |
| [`approval`](.flowaction/blocks/approval/block.json) | User task | None: FlowAction holds it | Approve, reject |

The `approval` manifest has no workflow: the instance waits in FlowAction, with no runner, until a person decides. Its inputs are the texts FlowAction shows (they read process variables with `{{ name.path }}`) and who may decide, set in the process definition's `blocks` under `with`; its outputs (`decision`, `comment`, `decided_by`, `decided_at`) become process variables under the task id, so an exclusive gateway after it can read `review.decision = "approved"`. Only the catalog defines blocks like this, because FlowAction implements their behavior. Forms, timers, gateways and subprocesses are not here either: FlowAction holds or evaluates them.

The `github` block runs with this workflow's read-only token unless the caller maps a token as its `token` secret. To change issues, grant the calling job `issues: write` and map its own token:

```yaml
jobs:
  publish:
    permissions:
      contents: read
      issues: write
    uses: caprivm/flowaction-catalog/.github/workflows/github.yml@<commit sha> # v1.2.0
    with:
      task_id: publish
      operation: create-issue
      title: Joke of the day
      body: ${{ fromJSON(inputs.vars).joke.body.setup }}
    secrets:
      token: ${{ secrets.GITHUB_TOKEN }}
```

Its other operations work on pull requests (`create-pull-request`, `wait-checks`, `rerun-checks`, `merge-pull-request`, `close-pull-request`), releases (`latest-release`), files (`edit-files` replaces an extended regular expression in the files a glob matches and commits the result to a new branch; `revert-commit` reverts a commit on a new branch) and workflows (`run-workflow` dispatches one and waits for its run; `wait-workflow` waits for the run of a workflow on a commit). Waiting operations poll GitHub until the checks or the run end, or `timeout_minutes` passes, and report how they ended in the output (`conclusion`) instead of failing, so a gateway after the task decides what comes next. A new branch is never pushed over an existing one.

GitHub does not let `GITHUB_TOKEN` change files in `.github/workflows/`, and what it merges starts no other workflow. For those operations, install a GitHub App on the repository and pass its client id as `app_client_id` and its private key as the `app_private_key` secret; the block creates a token for that repository only with `actions/create-github-app-token` and GitHub revokes it when the job ends:

```yaml
jobs:
  pins:
    uses: caprivm/flowaction-catalog/.github/workflows/github.yml@<commit sha> # v1.3.0
    with:
      task_id: pins
      operation: edit-files
      ref: flowaction/catalog-v1.3.0
      path: .github/workflows/*.yml
      find: "(caprivm/flowaction-catalog/[^@]+)@[0-9a-f]{40} # v[0-9.]+"
      replace: '\1@<new commit sha> # v1.3.0'
      message: "chore(deps): use catalog v1.3.0"
      app_client_id: ${{ vars.DEMO_APP_CLIENT_ID }}
    secrets:
      app_private_key: ${{ secrets.DEMO_APP_PRIVATE_KEY }}
```

## Layout

| Path | Contents |
| --- | --- |
| `.github/workflows/<id>.yml` | Block workflows (`workflow_call` only) |
| `.flowaction/blocks/<id>/block.json` | Block manifests (`flowaction.block/v1`) |
| `schemas/block.v1.json` | JSON Schema of the manifest, also for custom blocks |
| `.github/workflows/ci.yml` | Lints the workflows, validates every block and tags releases from `main` using only `bash`, `jq` and `yq` |

## Custom blocks

Customers add their own blocks to their execution repository with the same contract: a manifest at `.flowaction/blocks/<id>/block.json` (add `"$schema"` pointing to `schemas/block.v1.json` for editor help) and the workflow it names, by convention `.github/workflows/flowaction-block-<id>.yml`. A custom block cannot reuse an id from this catalog.

## Rules for every block workflow

- A block that waits in FlowAction (`bpmn:UserTask`) has no workflow, and none of the rules below apply to it. Every other block names its workflow.
- Triggered only by `workflow_call`, with a required string input `task_id` and an optional `runs_on`; FlowAction fills both, so manifests do not list them.
- Inputs and secrets match the manifest exactly (name, type and required flag).
- `permissions: contents: read` and nothing more.
- Caller values reach the shell only through `env:`; `${{ }}` never appears inside `run:`.
- Credentials arrive only as `secrets:` mapped by the caller from a GitHub secret name. A secret of the workflow cannot be named `github_*`: GitHub reserves those names and refuses to start any workflow that calls it.
- Actions are pinned by commit SHA with a `# vX.Y.Z` comment.
- The task output is a JSON object at `${{ runner.temp }}/flowaction-output/<task_id>.json`, uploaded as the `flowaction-output-<task_id>` artifact, and also published as the `output` output of the workflow (compact JSON, left empty when it is larger than 32 KiB) so another task of the same segment can read it without downloading the artifact.
- Every output the workflow declares is listed in the manifest, and the other way round.

## Versions

The catalog is versioned with SemVer tags (`v1.0.0`, `v1.1.0`, `v2.0.0`). FlowAction lists them so each block of a process can use its own catalog version, and the segment pins the tag's commit SHA with the tag as a comment:

```yaml
uses: caprivm/flowaction-catalog/.github/workflows/http-request.yml@<commit sha> # v1.1.0
```

Tags are created automatically. After every push to `main` that passes validation, the `release` job in `ci.yml` reads the Conventional Commits merged since the latest tag and publishes the next tag with a GitHub release and generated notes:

| Commit since the last tag | Next version |
| --- | --- |
| `feat!:`, `fix!:` (any type with `!`) or a `BREAKING CHANGE:` footer | Major (`v2.0.0`) |
| `feat:` | Minor (`v1.1.0`) |
| `fix:`, `perf:`, `revert:` | Patch (`v1.0.1`) |
| `docs:`, `ci:`, `chore:`, `test:`, `refactor:`, `style:`, `build:` | No release |

Only the subject line sets the type, so squash-merge pull requests with a Conventional Commit title. A change that removes or renames an input, secret or output of a block, or makes an input required, is breaking. The first run, with no tag yet, publishes `v1.0.0`. The logic is the `Compute the next version` step of `ci.yml`; on pull requests it runs as a dry run that prints the version and publishes nothing.

A block's manifest `version` is the version of that block's contract; bump it whenever its inputs, secrets or outputs change. The tag is the version of the whole catalog.

## Access

GitHub lets other repositories call these workflows only if they can reach this repository. While it is private, only repositories owned by `caprivm` can use it, after enabling Settings → Actions → General → Access → "Accessible from repositories owned by the user 'caprivm'". Customers in other accounts need this repository to be public.

## Project policies

- [License](LICENSE)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
