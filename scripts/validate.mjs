// Validates every catalog block: its flowaction.block/v1 manifest, the workflow it names, and the
// security conventions every block workflow follows. FlowAction applies the same manifest rules
// (src/server/catalog/block-manifest.ts) to catalog and custom blocks.
//
// Usage: node scripts/validate.mjs <dir>, where <dir> holds each workflow converted to JSON by
// `yq -o=json` as <workflow file name>.json. Dependency-free on purpose.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const jsonDir = process.argv[2];
if (!jsonDir)
  throw new Error("Usage: node scripts/validate.mjs <workflow JSON dir>");

const RESERVED = ["task_id", "runs_on"];
const NAME = /^[a-z][a-z0-9_]{0,63}$/;
const CI_WORKFLOWS = new Set(["ci.yml"]);
const errors = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);

function checkManifest(path, manifest) {
  const where = path;
  if (manifest.format !== "flowaction.block/v1")
    fail(where, "format must be flowaction.block/v1");
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(manifest.id ?? ""))
    fail(where, "invalid id");
  if (path !== `.flowaction/blocks/${manifest.id}/block.json`)
    fail(where, "path must match the id");
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? ""))
    fail(where, "version must be x.y.z");
  if (
    !["bpmn:ServiceTask", "bpmn:ScriptTask", "bpmn:SendTask"].includes(
      manifest.bpmnType,
    )
  ) {
    fail(where, "unsupported bpmnType");
  }
  if (
    !/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(
      manifest.workflow ?? "",
    )
  ) {
    fail(where, "workflow must be a file in .github/workflows");
  }
  const outputNames = new Set();
  for (const output of manifest.outputs ?? []) {
    if (!NAME.test(output.name ?? "")) fail(where, `invalid output ${output.name}`);
    if (outputNames.has(output.name))
      fail(where, `duplicate output ${output.name}`);
    outputNames.add(output.name);
  }
  const names = new Set();
  for (const input of manifest.inputs ?? []) {
    if (!NAME.test(input.name) || RESERVED.includes(input.name))
      fail(where, `invalid input ${input.name}`);
    if (names.has(input.name)) fail(where, `duplicate input ${input.name}`);
    names.add(input.name);
    if (!["string", "number", "boolean"].includes(input.type))
      fail(where, `input ${input.name} has an invalid type`);
    if (input.options && input.type !== "string")
      fail(where, `only string inputs can list options`);
  }
}

function checkWorkflow(manifest, file, source, workflow) {
  const where = file;
  const on = workflow.on ?? {};
  if (Object.keys(on).join() !== "workflow_call") {
    fail(where, "must be triggered only by workflow_call");
    return;
  }
  const call = on.workflow_call ?? {};
  const inputs = call.inputs ?? {};
  const secrets = call.secrets ?? {};
  if (inputs.task_id?.type !== "string" || inputs.task_id?.required !== true) {
    fail(where, "must declare a required string input task_id");
  }
  const declared = new Map(
    (manifest.inputs ?? []).map((input) => [input.name, input]),
  );
  for (const [name, input] of declared) {
    const actual = inputs[name];
    if (!actual) fail(where, `input ${name} is missing`);
    else if (actual.type !== input.type)
      fail(
        where,
        `input ${name} is ${actual.type}, manifest says ${input.type}`,
      );
    else if ((actual.required === true) !== (input.required === true)) {
      fail(
        where,
        `input ${name} has a different required flag than the manifest`,
      );
    }
  }
  for (const name of Object.keys(inputs)) {
    if (!RESERVED.includes(name) && !declared.has(name))
      fail(where, `input ${name} is not in the manifest`);
  }
  const declaredOutputs = call.outputs ?? {};
  for (const output of manifest.outputs ?? []) {
    if (!(output.name in declaredOutputs))
      fail(where, `output ${output.name} is missing`);
  }
  for (const name of Object.keys(declaredOutputs)) {
    if (!(manifest.outputs ?? []).some((output) => output.name === name))
      fail(where, `output ${name} is not in the manifest`);
  }
  const manifestSecrets = new Set(
    (manifest.secrets ?? []).map((secret) => secret.name),
  );
  for (const name of Object.keys(secrets)) {
    if (!manifestSecrets.has(name))
      fail(where, `secret ${name} is not in the manifest`);
  }
  for (const name of manifestSecrets) {
    if (!(name in secrets)) fail(where, `secret ${name} is missing`);
  }

  if (
    JSON.stringify(workflow.permissions) !==
    JSON.stringify({ contents: "read" })
  ) {
    fail(where, "permissions must be exactly contents: read");
  }
  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    if (job.permissions !== undefined)
      fail(where, `job ${jobName} must not change permissions`);
    for (const step of job.steps ?? []) {
      if (step.run?.includes("${{"))
        fail(where, `job ${jobName} interpolates an expression into run:`);
      if (step.uses) {
        if (!/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(step.uses))
          fail(where, `${step.uses} is not pinned by SHA`);
        else if (!source.includes(`${step.uses} # v`))
          fail(where, `${step.uses} needs a # vX.Y.Z comment`);
      }
    }
  }
}

const manifests = existsSync(".flowaction/blocks")
  ? readdirSync(".flowaction/blocks").map(
      (id) => `.flowaction/blocks/${id}/block.json`,
    )
  : [];
const used = new Set();
for (const path of manifests) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(path, "not valid JSON");
    continue;
  }
  checkManifest(path, manifest);
  const file = manifest.workflow ?? "";
  used.add(basename(file));
  const converted = join(jsonDir, `${basename(file)}.json`);
  if (!existsSync(file) || !existsSync(converted)) {
    fail(path, `workflow ${file} does not exist`);
    continue;
  }
  checkWorkflow(
    manifest,
    file,
    readFileSync(file, "utf8"),
    JSON.parse(readFileSync(converted, "utf8")),
  );
}
for (const file of readdirSync(".github/workflows")) {
  if (!CI_WORKFLOWS.has(file) && !used.has(file))
    fail(`.github/workflows/${file}`, "has no block manifest");
}

if (errors.length > 0) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}
console.log(`Validated ${manifests.length} blocks.`);
