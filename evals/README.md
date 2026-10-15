# evals

A small evaluation framework that measures how well each LLM drives the openloops reasoning engine, and how much it costs. It answers two questions:

1. **Models**: for each model, which *setup* (mode + reasoning level + strict schema) gives the best accuracy per dollar on a fixed set of agent-style cases?
2. **Skills**: does the real prompt of a skill (for example `reasoningEngine`) behave well on the models and modes we picked?

Every run writes a JSON result. Every `models` run also generates an HTML report (for you) and a JSON bundle (for an agent that analyzes failures). `skills` runs also generate an HTML report and a JSON bundle, one pair per skill. Bundles live in `results/bundles/models/` and `results/bundles/skills/`.

---

## Contents

1. [Concepts](#concepts)
2. [Setup](#setup)
3. [Quick start](#quick-start)
4. [Command reference](#command-reference)
   - [eval models](#eval-models)
   - [eval skills](#eval-skills)
   - [eval compare](#eval-compare)
   - [eval show](#eval-show)
   - [eval bundle](#eval-bundle)
   - [eval report](#eval-report)
   - [eval list](#eval-list)
5. [Flag reference](#flag-reference)
6. [Recipes](#recipes)
7. [Modes](#modes)
8. [Reasoning and strict](#reasoning-and-strict)
9. [Cases](#cases)
10. [Results, refs and bundles](#results-refs-and-bundles)
11. [Adding a model, a case or a skill](#adding-a-model-a-case-or-a-skill)
12. [Cost guide](#cost-guide)
13. [Troubleshooting](#troubleshooting)

---

## Concepts

| Term | Meaning |
| --- | --- |
| **Case** | One scenario (for example "count items in the warehouse") with fake tools, a scripted world and a checker that decides pass or fail. |
| **Run** | One full conversation of one case. Each cell repeats every case `--runs` times because models are not deterministic. |
| **Mode** | How the agent turn is sent to the model: plain text JSON, or native function calling in one of two shapes. See [Modes](#modes). |
| **Reasoning** | The native provider thinking effort (`off`, `low`, `medium`, `high`). It is not the `reasoning` field inside the JSON contract. |
| **Strict** | Whether the tool schema is sent with strict structured output. Only meaningful for function calling modes. |
| **Setup** | The combination model + mode + reasoning + strict. |
| **Cell** | One setup evaluated on all selected cases and runs. |
| **Snapshot** | A concrete model id (for example `gpt-6-luna`). A model file can list several snapshots. |
| **Bundle** | A JSON file (plus an HTML report) that groups the newest result of each model snapshot, or the last execution of one skill, and its earlier runs. |

Directory layout:

```
evals/
  run.ts                  CLI entry point
  cases/                  the 10 model cases and the fake warehouse world
  models/                 one file per model (what to test and with which defaults)
  skills/                 one folder per skill eval (spec + scenarios)
  core/                   runner, modes, store, bundle, html report
  results/                versioned output: raw results and bundles (see Results, refs and bundles)
```

---

## Setup

1. Run everything from the **repository root**, not from inside `evals/`.
2. Provider credentials must be available as environment variables, the same ones `@earendil-works/pi-ai` reads for each provider (for example the OpenAI, Anthropic and Google keys). Before spending anything, the framework sends a tiny ping to each selected model and skips the ones it cannot reach (`skip ... no access`).
3. The scripts to run it are already defined in the root `package.json`, and each one forwards its arguments to the CLI:

```json
{
  "scripts": {
    "eval": "ts-node --project evals/tsconfig.json evals/run.ts",
    "eval:models": "ts-node --project evals/tsconfig.json evals/run.ts models",
    "eval:skills": "ts-node --project evals/tsconfig.json evals/run.ts skills",
    "eval:compare": "ts-node --project evals/tsconfig.json evals/run.ts compare",
    "eval:bundle": "ts-node --project evals/tsconfig.json evals/run.ts bundle",
    "eval:report": "ts-node --project evals/tsconfig.json evals/run.ts report",
    "eval:show": "ts-node --project evals/tsconfig.json evals/run.ts show",
    "eval:list": "ts-node --project evals/tsconfig.json evals/run.ts list"
  }
}
```

### How arguments are passed

With yarn, flags go directly after the script name. Do not add `--` (that is only needed with npm):

```bash
yarn eval:models --reasoning off,low --with-tools-off
```

Rules of the flag parser:

- A flag takes the next token as its value unless that token starts with `--`. A flag with no value becomes `true`.
- Lists are comma separated with no spaces: `--reasoning off,low`.
- Put positional arguments (model names, skill names, refs) **before** the flags. `--with-tools-off gpt-6-luna` would read `gpt-6-luna` as the value of the flag, and the flag would not turn on.
- Boolean flags (`--with-tools-off`, `--full`, `--no-history`) are best written last, or followed by another `--flag`.

---

## Quick start

```bash
yarn eval:list
yarn eval:models gpt-6-luna --runs 1
yarn eval:models
```

1. `eval:list` shows which models, modes, cases, skills and past results exist.
2. The second command is a cheap smoke test: one model, one run per case, default modes, reasoning off.
3. The third command runs every model file with its defaults. When it ends it prints the paths of the HTML report and the JSON bundle.

---

## Command reference

### eval models

Runs the 10 model cases against the selected models and saves one result per snapshot.

```
yarn eval:models [names...] [--snapshot ids] [--reasoning levels] [--modes ids]
                       [--with-tools-off] [--strict on,off] [--cases ids]
                       [--runs n] [--timeout ms] [--concurrency n]
```

**Selecting models.** Positional names match, in this order of equivalence: the file name in `models/` (`gpt-6-luna`), the model id, `provider/model` (`openai/gpt-6-luna`) or any listed snapshot. With no names, every file in `models/` runs (files starting with `_` are ignored).

```bash
yarn eval:models
yarn eval:models gpt-6-luna
yarn eval:models gpt-6-luna gemini-2.5-flash
yarn eval:models openai/gpt-4o-mini
```

**Reasoning levels.** `--reasoning off,low` runs each reasoning-capable model twice per mode, once per level. Models that do not support reasoning ignore the flag and run once as `n/a`. Defaults to `off`.

```bash
yarn eval:models --reasoning off,low
yarn eval:models gpt-5-nano --reasoning low,medium,high
```

**Including the reference mode.** `--with-tools-off` adds the `tools-off` mode (tools declared in the `tools` field but disabled, JSON in plain text) on top of whatever modes would run. It is excluded by default because it performs badly and wastes money. Use it only when you want a reference point.

```bash
yarn eval:models --with-tools-off
yarn eval:models --reasoning off,low --with-tools-off
yarn eval:models gemini-2.5-flash --with-tools-off --runs 1
```

The first example runs every model with the default modes plus `tools-off`. The second is the full comparison: two reasoning levels and the reference mode (expect roughly 0.8 to 1.0 USD for the six default models, see [Cost guide](#cost-guide)).

**Choosing modes explicitly.** `--modes` replaces the default list (`text,fc-split,fc-step`). If you list `tools-off` yourself you do not need `--with-tools-off`.

```bash
yarn eval:models --modes text,fc-step
yarn eval:models --modes tools-off,text
yarn eval:models --modes fc-step --strict on,off
```

**Strict schema.** `--strict on,off` tests the function calling modes with and without strict schema. Text modes ignore it. Defaults to `on`.

```bash
yarn eval:models gpt-6-luna --modes fc-step --strict on,off
```

**Restricting cases.** Use case ids (see [Cases](#cases)).

```bash
yarn eval:models --cases inventory-count,typed-args
yarn eval:models gpt-4o-mini --cases injection --runs 5
```

**Runs, timeout and concurrency.**

```bash
yarn eval:models --runs 1
yarn eval:models --runs 5
yarn eval:models --timeout 90000
yarn eval:models --concurrency 3
```

- `--runs n`: repetitions per case (default 3). More runs reduce noise and raise cost linearly.
- `--timeout ms`: per LLM call limit (default 45000). Slow reasoning models may need more.
- `--concurrency n`: parallel conversations (default 6). Lower it if you hit provider rate limits.

**Snapshots.** `--snapshot` overrides the snapshot list of the selected model files, so you can test a dated model id or compare versions without editing the file.

```bash
yarn eval:models gpt-4o-mini --snapshot gpt-4o-mini
```

**Combined example.**

```bash
yarn eval:models gpt-6-luna claude-haiku-5-5 --modes text,fc-step --reasoning off,low --cases dependent-chain,typed-args --runs 2 --concurrency 4
```

**What happens during a run.**

1. A plan line is printed: `plan: N snapshots, N cells, N conversations`.
2. Each model is pinged. Unreachable or unknown models are skipped with the reason.
3. Combinations that cannot work are skipped and reported (for example Anthropic with reasoning on and forced tool choice).
4. Cells run in parallel with a progress line, running cost and elapsed time.
5. Tables per model and a cost table are printed.
6. One result file per snapshot is saved, then both bundles are generated and their paths are printed:

```
Bundles generated:
  HTML report (open it in your browser, it is for you): evals/results/bundles/bundle-2026-10-11T19-14-00.html
  JSON bundle (give it to an agent if you want it analyzed, it has the failure details): evals/results/bundles/bundle-2026-10-11T19-14-00.json
```

The bundle created by a run only contains the snapshots from that run (plus their earlier runs as history). To see everything in one report use [eval bundle](#eval-bundle).

**Precedence of settings:** CLI flags, then the model file (`models/<name>.ts`), then framework defaults (`reasoning off`, `strict on`, `runs 3`, `timeout 45000`, `concurrency 6`, modes `text,fc-split,fc-step`).

---

### eval skills

Runs the real system prompt of a skill against a few scenarios and saves the results of that skill. At the end you get console tables, one result JSON per model, and one bundle per skill: an HTML executive report (same design as the model report, with the modes described for what they really send) and a JSON bundle for an agent. If a bundle was not generated (for example the run was interrupted, or the results come from an older version of the framework), rebuild it from the last execution with `yarn eval:bundle --skill reasoning-engine`.

```
yarn eval:skills [skill names...] [--models names] [--dry-run] [same flags as eval models]
```

```bash
yarn eval:skills --dry-run
yarn eval:skills reasoning-engine --dry-run
yarn eval:skills reasoning-engine
yarn eval:skills reasoning-engine --models gpt-6-luna
yarn eval:skills reasoning-engine --modes text --runs 1
yarn eval:skills reasoning-engine --cases direct-answer,honest-failure,prompt-extraction
yarn eval:skills reasoning-engine --reasoning off,low
```

- `--dry-run` sends nothing, prints the plan and a rough cost estimate (based on the real size of the skill prompt). Run it first.
- With no skill names, every folder in `skills/` runs (folders starting with `_` are ignored).
- `--models` overrides the model list of the skill spec. Names follow the same matching as `eval models`.
- Each skill has its own default scenarios (`defaultCases` in the spec) to keep the cost low. `--cases` can pick any scenario of the skill. For `reasoning-engine` the defaults are `lookup-chain`, `name-to-id`, `error-recovery`, `ask-user`, `injection`; the others available are `direct-answer`, `prompt-extraction`, `honest-failure`.
- Defaults for `reasoning-engine`: models `gpt-6-luna`, `gpt-4o-mini`, `claude-haiku-5-5`, `gemini-2.5-flash`; modes `text` and `fc-step`; reasoning `off`; strict `on`; 2 runs. That is 80 conversations and roughly 0.10 to 0.15 USD (the real cost of the last run was 0.14 USD with `tools-off` included).
- Skill kinds and modes:
  - `loop` skills (like `reasoning-engine`, they call tools and observe results) support `text`, `fc-step` and `tools-off` (reference only, needs `--with-tools-off`). `tools-off` is what production sends today (tools declared with tool choice `none`).
  - `single` skills (one call in, one JSON object out, like `approval-request`) support `text` (JSON in plain text) and `schema` (a forced `output` tool whose parameters are the response schema, strict by default).
- The skill is loaded from the source of `@loops/agi` (or wherever its spec points), so the prompt and version tested are the ones in the working tree. The result records the skill name and version.
- The bundle is written to `results/bundles/skills/<skill>-<timestamp>.json` with the `.html` next to it, and both paths are printed when the run ends. It contains every model and mode of that execution.
- Results are stored under `results/skills/<skill>/<provider>/<snapshot>/<timestamp>.json`. Read them back with `yarn eval:show skill/reasoning-engine/gpt-6-luna` or compare runs with `yarn eval:compare`.
- What is real and what is replicated: the system prompt, the opening message and the observation format are the real ones. The harness behavior (`known`, `schemas`, warnings, stop reasons, placeholders, workspace stubs) is not run: the eval only sends `HARNESS.budget`.

---

### eval compare

Prints a side-by-side table of two or more saved results (accuracy, cost, time per setup) so you can see what changed.

```
yarn eval:compare <ref> <ref> [more refs]
```

```bash
yarn eval:compare gpt-6-luna gpt-4o-mini
yarn eval:compare openai/gpt-6-luna gemini-2.5-flash
yarn eval:compare gpt-6-luna@2026-10-10 gpt-6-luna@2026-10-11
yarn eval:compare skill/reasoning-engine/gpt-6-luna evals/results/models/openai/gpt-6-luna/latest.json
```

At least two refs are required. See [Refs](#refs) for the syntax. Only compare results with the same `casesVersion`; otherwise the cases were different and the numbers are not comparable.

---

### eval show

Prints saved results as tables without running anything.

```
yarn eval:show [refs...] [--stamp prefix]
```

```bash
yarn eval:show
yarn eval:show gpt-6-luna
yarn eval:show gpt-6-luna@2026-10-11T19
yarn eval:show --stamp 2026-10-11
```

- With no refs, it shows the latest result of every snapshot.
- `--stamp 2026-10-11` limits the display to snapshots that have a run whose timestamp starts with that prefix, and shows that run.
- Ends with a cost table for everything shown.

---

### eval bundle

Builds a JSON bundle and the HTML report from saved results, without calling any model. Use it to gather results from several separate runs into one report.

```
yarn eval:bundle [refs...] [--skill name] [--all] [--last] [--stamp prefix] [--full] [--no-history] [--out file]
```

```bash
yarn eval:bundle
yarn eval:bundle --stamp 2026-10-11
yarn eval:bundle gpt-6-luna gemini-2.5-flash
yarn eval:bundle --skill reasoning-engine
yarn eval:bundle --skill reasoning-engine --all
yarn eval:bundle --last
yarn eval:bundle --no-history
yarn eval:bundle --full --out evals/results/bundles/full.json
```

Behavior:

- **No refs, no `--skill`**: a models bundle. It includes every model snapshot found in `results/models/`. For each one only the **newest** run goes in `results`; older runs of the same snapshot go to `history` (aggregates only) so the report can show whether a model improved or regressed.
- **`--skill name`**: a bundle of that skill (`--skill` alone, with no name, bundles every skill together). By default it takes the **last execution** of the skill, which means the runs that started within 10 minutes of the newest one, so it holds exactly the models and modes of your latest `eval:skills`. Add `--all` to take the newest run of every model that has ever been evaluated instead. History only includes older runs of the same skill version and the same scenarios.
- **`--last`**: the same last-execution rule for models bundles.
- **With refs**: includes exactly those results and nothing else; the bundle goes to the models or skills folder depending on the refs.
- `--stamp prefix`: pick, for each snapshot, the newest run whose timestamp starts with the prefix instead of the newest overall.
- `--no-history`: leave out earlier runs.
- `--full`: keep longer answers and raw model output and keep **all** passing conversations (default keeps one passing sample per case and truncates text). The file gets much larger.
- `--out file`: write the JSON there. The HTML is written next to it with the same name and a `.html` extension. Default: `results/bundles/models/bundle-<timestamp>.json` for models and `results/bundles/skills/<skill>-<timestamp>.json` for skills.

Which file is for whom: the **HTML** is for you to read. The **JSON** is for an agent: it contains every failed conversation with the answer, the reason and per-turn detail.

---

### eval report

Rebuilds the HTML report. Use it after the report template changed, or to regenerate the HTML of an old bundle.

```
yarn eval:report [bundle.json] [--skill name] [--all] [--last] [--stamp prefix] [--out file]
```

```bash
yarn eval:report evals/results/bundles/models/bundle-2026-10-11T19-14-00.json
yarn eval:report
yarn eval:report --skill reasoning-engine
```

- With `--skill <name>`: same as `eval bundle --skill <name>`.
- With a bundle path: writes `<same name>.html` next to it from that JSON, nothing else changes.
- Without a path: behaves like `eval bundle` with no refs and prints both file paths.

---

### eval list

Prints what is available and what has been saved.

```bash
yarn eval:list
```

Output sections: model files (provider/model, snapshots, reasoning levels), modes (with the default set), case ids, skill specs (models, modes, scenarios, runs) and all saved results with their timestamps.

---

## Flag reference

| Flag | Used by | Value | Default | Effect |
| --- | --- | --- | --- | --- |
| `--snapshot` | models, skills | comma list of model ids | the model file's `snapshots` or its `model` | Override which concrete model ids are tested. |
| `--models` | skills | comma list of model names | the skill spec's `models` | Override which models run the skill. |
| `--reasoning` | models, skills | `off`, `low`, `medium`, `high` (comma list) | `off` | Native thinking effort per cell. Ignored by models without reasoning. |
| `--modes` | models, skills | `tools-off`, `text`, `fc-split`, `fc-step`, `schema` (skills of kind `single` only) (comma list) | `text,fc-split,fc-step` (skills: the spec's modes) | Replace the list of modes. |
| `--with-tools-off` | models, skills | none (boolean) | off | Add the `tools-off` reference mode. |
| `--strict` | models, skills | `on`, `off` (comma list) | `on` | Strict schema for function calling modes. |
| `--cases` | models, skills | comma list of case or scenario ids | all | Restrict what is evaluated. |
| `--runs` | models, skills | integer | 3 (skills: spec value) | Repetitions per case. |
| `--timeout` | models, skills | milliseconds | 45000 | Time limit per LLM call. |
| `--concurrency` | models, skills | integer | 6 | Parallel conversations. |
| `--dry-run` | models, skills | none (boolean) | off | Print the plan and a rough cost estimate without calling any model. |
| `--stamp` | show, bundle, report | timestamp prefix | none | Pick runs by timestamp prefix. |
| `--full` | bundle | none (boolean) | off | Include long text and all passing runs. |
| `--no-history` | bundle | none (boolean) | off | Skip earlier runs. |
| `--out` | bundle, report | file path | `results/bundles/models/bundle-<timestamp>.json` or `results/bundles/skills/<skill>-<timestamp>.json` | Output location. |
| `--skill` | bundle, report | skill name | none | Build the bundle of a skill instead of the models one. Takes the last execution unless `--all`. |
| `--all` | bundle, report | none (boolean) | off | With `--skill`: newest run of every model, not only the last execution. |
| `--last` | bundle, report | none (boolean) | off | Models bundle of the last execution only. |

---

## Recipes

| Goal | Command |
| --- | --- |
| Cheapest sanity check of one model | `yarn eval:models gpt-6-luna --runs 1 --cases inventory-count,typed-args` |
| Regular comparison of all models | `yarn eval:models` |
| Does reasoning pay off? | `yarn eval:models --reasoning off,low` |
| Same, plus the reference mode | `yarn eval:models --reasoning off,low --with-tools-off` |
| Is strict schema worth it? | `yarn eval:models --modes fc-step --strict on,off` |
| Compare only the two best contracts | `yarn eval:models --modes text,fc-step` |
| Re-test one model after a provider update | `yarn eval:models gemini-2.5-flash` then `yarn eval:compare gemini-2.5-flash@<old> gemini-2.5-flash@<new>` |
| Estimate the cost before spending | `yarn eval:skills reasoning-engine --dry-run` |
| Check the reasoning engine prompt on the chosen models | `yarn eval:skills reasoning-engine` |
| One report with everything saved so far | `yarn eval:bundle` |
| Rebuild the bundle of the last skill execution | `yarn eval:bundle --skill reasoning-engine` |
| Re-render the HTML after a template change | `yarn eval:report evals/results/bundles/models/<bundle>.json` |
| Let an agent analyze failures | give it the bundle `.json` (add `--full` for more detail) |

---

## Modes

All modes run the same cases against the same fake tools. They differ in how the request is built and how the answer is read.

| Id | Name | Tool catalog goes in | Model answers with | Strict applies |
| --- | --- | --- | --- | --- |
| `text` | Plain chat completion | the system prompt, as text | a JSON object in plain text, parsed by us | no |
| `fc-step` | Function calling, one call | the `tools` field: one forced `step` tool | a single tool call; actions travel inside `arguments_json` (tolerant JSON parse) | yes |
| `fc-split` | Function calling, two calls | the `tools` field: a `reflect` tool plus an action tool, forced | two tool calls per turn (OpenAI never emits both in one response) | yes |
| `tools-off` | Chat, tools disabled | the `tools` field, but tool choice is `none` | a JSON object in plain text | no |

Notes:

- `tools-off` is the old production behavior. It is **reference only**: it is excluded by default and enabled with `--with-tools-off` (or by naming it in `--modes`). In past runs it scored poorly on small models and accounted for a large share of the spend.
- Anthropic rejects thinking when tool choice is forced, so `fc-step` and `fc-split` with reasoning above `off` are skipped for Anthropic models and listed under "skipped".
- Result files written by older versions that used the id `current` are read as `tools-off`.

---

## Reasoning and strict

- **Reasoning** means the provider's native thinking effort. `off` for OpenAI models is sent as `minimal` (the closest available), for the others it means no reasoning option. Some models, such as `claude-haiku-5-5`, cannot fully disable thinking. Models without a reasoning feature show `n/a` and ignore `--reasoning`.
- **Strict** sends the tool schema with strict structured output. It only exists in `fc-step` and `fc-split`, so in the other modes the strict column is always off.
- Every extra reasoning level or strict value multiplies the number of cells, and therefore cost and time.

---

## Cases

The model suite is versioned (`CASES_VERSION`, currently 4). Bump it whenever a case or its checker changes so old and new results are never compared as equals.

| Id | What it checks |
| --- | --- |
| `inventory-count` | One lookup and a numeric answer. |
| `dependent-chain` | A second call that needs the output of the first. |
| `multi-lookup` | Several independent lookups combined. |
| `missing-item` | Reporting that something does not exist instead of inventing it. |
| `no-tool` | Answering directly when no tool is needed. |
| `inventory-value` | Lookup plus arithmetic. |
| `transient-error` | Recovering after a tool error. |
| `tool-selection` | Picking the right tool among similar ones. |
| `injection` | Ignoring instructions embedded in tool output. |
| `typed-args` | Passing arguments with the right types and formats. |

---

## Results, refs and bundles

### Where files go

```
results/
  models/<provider>/<snapshot>/<timestamp>.json
  models/<provider>/<snapshot>/latest.json
  skills/<skill>/<provider>/<snapshot>/<timestamp>.json
  skills/<skill>/<provider>/<snapshot>/latest.json
  bundles/models/bundle-<timestamp>.json
  bundles/models/bundle-<timestamp>.html
  bundles/skills/<skill>-<timestamp>.json
  bundles/skills/<skill>-<timestamp>.html
```

Everything under `results/` is committed to git on purpose, including the raw model output of each turn, so anyone can audit, compare and verify that no number was made up. Directories are created automatically on the first run. A run never overwrites an older one: each run is a new timestamped file and `latest.json` points to the newest.

### What a result contains (and what it does not)

- **Stored**: model, provider, snapshot, api, pi-ai version, `casesVersion`, pricing used, the run configuration, per-turn actions, token counts, cache tokens, cost, time, the final answer, the failure reason, and the raw model output of each turn.
- **Truncated**: raw model output is cut at 700 characters per turn, final answers in bundles at 400 characters (2000 with `--full`), and provider error messages at 300 characters.
- **Not stored**: API keys, request headers and the full system prompt sent to the model. The cases use a fake warehouse world, so the data in them is synthetic.
- **Skill evals** store the model answers to the scenarios of a skill. The skill prompt itself lives in the repository, but a scenario such as `prompt-extraction` may make a model echo part of it, so review skill results before committing if the skill prompt is not meant to be public.

### Committing results

- Commit runs that back a decision or a new `casesVersion`. Throwaway experiments (a single `--runs 1` smoke test, for example) can stay local: delete them or do not stage them.
- Results change between runs because models are not deterministic. A different number on a later run is not a sign of tampering, compare runs with the same `casesVersion` and look at the `history` section of the report.
- Every file is plain JSON. Review diffs with `yarn eval:compare` instead of reading raw diffs.
- Before committing, a quick scan avoids surprises: `grep -rEl "sk-|AIza|Bearer |@[a-z0-9.-]+\.[a-z]{2,}" evals/results`.
- Size grows with each run (hundreds of KB per snapshot with the default settings, more with `--full`). Use `--no-history` or skip `--full` for bundles you do not need to keep.

### Refs

A ref identifies a saved result in `compare`, `show` and `bundle`:

| Form | Example | Resolves to |
| --- | --- | --- |
| snapshot | `gpt-6-luna` | latest result of that snapshot |
| provider/snapshot | `openai/gpt-6-luna` | same, when several providers share a snapshot name |
| with timestamp prefix | `gpt-6-luna@2026-10-11T19` | the run whose timestamp starts with that prefix |
| skill result | `skill/reasoning-engine/gpt-6-luna` | latest skill result for that snapshot |
| file path | `evals/results/models/openai/gpt-6-luna/latest.json` | that file |

If a snapshot name matches several providers, the command stops and asks for `provider/snapshot`. Use `eval:list` to see the exact timestamps.

### How bundles treat earlier runs

- Automatic bundles (generated at the end of `models` and `skills`) contain the snapshots of that run, plus their earlier runs under `history`.
- `eval:bundle` with no refs contains every model snapshot, newest run each, plus history. For skills, `eval:bundle --skill <name>` contains the last execution (or the newest run of every model with `--all`).
- The report uses history to show whether a model evolved. In models bundles only runs with the same `casesVersion` are comparable, and the report accounts for that. In skills bundles the history only keeps runs of the same skill version and scenario set, because a new skill version or other scenarios make the scores incomparable.
- Bundles created before this layout sit directly in `results/bundles/`. Move them into `results/bundles/models/` if you want them together; nothing depends on their location.

---

## Adding a model, a case or a skill

**A model.** Copy `models/_template.ts` to `models/<name>.ts` and edit it:

```ts
import { defineModelEval } from '../core/define'

export default defineModelEval({
    provider: 'openai',
    model: 'gpt-6-luna',
})
```

Optional fields: `snapshots`, `reasoning`, `modes`, `strict`, `cases`, `runs`, `notes`. Keep files minimal and pass variations as CLI flags. The model must exist in the pi-ai catalog, otherwise the run reports `not in the pi-ai catalog (update pi-ai?)`.

**A case.** Add a file in `cases/`, register it in `cases/index.ts` and bump `CASES_VERSION`.

**A skill eval.** Create a folder `skills/<name>/` with `spec.ts` and `scenarios.ts`. The framework discovers it by itself, so there is nothing to register. `load()` must return the real `Skill` instance; it requires the module lazily so `eval:list` stays fast. Use `skills/reasoning-engine` as the reference.

For a skill that calls tools in a loop (`kind: 'loop'`):

```ts
import { defineSkillEval } from '../../core/define'
import { defineTool } from '../../cases/world'
import { SCENARIOS } from './scenarios'

export default defineSkillEval({
    skill: 'reasoning-engine',
    kind: 'loop',
    models: ['gpt-6-luna', 'claude-haiku-5-5'],
    modes: ['text', 'fc-step'],
    runs: 2,
    scenarios: SCENARIOS,
    defaultCases: ['lookup-chain', 'injection'],
    nativeTools: [defineTool('respond', 'Deliver the final answer.', { answer: { type: 'string' } })],
    finals: { respond: 'answer' },
    load () {
        require('reflect-metadata')
        return require('@loops/agi/skills/reasoning-engine').reasoningEngine
    },
})
```

For a skill that answers with one JSON object and no tools (`kind: 'single'`, for example `approvalRequest`, `confirmationGate`), declare the output schema and give each scenario its `input` (the `INPUT` payload of the skill besides `user_message`) and a `check` that reads the answer with `answerJson`:

```ts
import { answerJson, defineOutput, defineSkillEval } from '../../core/define'

export default defineSkillEval({
    skill: 'approval-request',
    kind: 'single',
    models: ['gpt-6-luna', 'claude-haiku-5-5'],
    runs: 3,
    outputSchema: defineOutput({ reasoning: { type: 'string' }, question: { type: 'string' } }),
    scenarios: [{
        id: 'delete-customer',
        description: 'Must name the customer and ask to confirm.',
        userMessage: 'Borra al cliente Acme',
        input: { goal: 'Delete a customer', pending_actions: [{ tool: 'crm__delete_customer', arguments: { id: 'c1', name: 'Acme' } }] },
        tools: [],
        maxTurns: 1,
        world: () => '',
        check: answer => /acme/i.test(String(answerJson(answer)?.question)) ? { ok: true } : { ok: false, reason: 'does not mention the customer' },
    }],
    load () {
        require('reflect-metadata')
        return require('@loops/shared/skills').approvalRequest
    },
})
```

Keep the cost low: 3 to 5 scenarios per skill, `maxTurns: 1` for single skills, and put the extra scenarios outside `defaultCases` so they only run when asked with `--cases`. Always run `--dry-run` first: skill prompts are large and the estimate uses their real size.

---

## Cost guide

Every run prints the money spent so far during execution and a cost table at the end. Approximate scale for the six default models with 3 runs and 10 cases:

| Command | Approx. cost |
| --- | --- |
| `yarn eval:models --runs 1` | a few cents to 0.3 USD |
| `yarn eval:models` | 0.3 to 0.5 USD |
| `yarn eval:models --reasoning off,low` | 0.5 to 0.8 USD (reasoning adds 50 to 100 percent) |
| `yarn eval:models --reasoning off,low --with-tools-off` | 0.8 to 1.0 USD |
| `yarn eval:skills reasoning-engine` | about 0.10 to 0.15 USD (80 conversations, the prompt is about 4,000 tokens) |

Ways to spend less: select fewer models, use `--runs 1` for smoke tests, restrict `--modes` and `--cases`, avoid `--with-tools-off` unless you need the reference, and avoid high reasoning levels.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Flags seem ignored or a stray `--` shows up | Do not put `--` between the script and the flags with yarn. Use `yarn eval:models --runs 1`. |
| `--with-tools-off` has no effect | A positional name came right after it and was taken as its value. Put model names first and the boolean flag last. |
| `skip ... no access: ...` | Missing or invalid API key, or no access to that model. Fix the credentials and rerun. |
| `not in the pi-ai catalog (update pi-ai?)` | The model id is unknown to the installed pi-ai version. Update the package or fix the id. |
| `no model file matches "x"` | The name is not a file in `models/`, a model id, `provider/model` or a snapshot. Check `eval:list`. |
| `unknown case "x"` | Wrong id in `--cases`. The error lists the valid ids. |
| `skipped: anthropic rejects thinking when tool choice is forced` | Expected. Run Anthropic function calling with reasoning `off`. |
| Timeouts on reasoning runs | Raise `--timeout` (for example 90000) and lower `--concurrency`. |
| Rate limit errors | Lower `--concurrency`. |
| `matches several providers` | Use `provider/snapshot` in the ref. |
| Cannot find `@loops/agi` in `eval:skills` | Run from the repository root and make sure dependencies are installed. |
| HTML looks outdated after editing the template | Run `yarn eval:report <bundle>.json` to regenerate it. |
