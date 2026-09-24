---
name: ai-cv-agent-loop
description: Coordinate lead, backend, frontend, and QA agents through the AI CV Assessment plan, build, integrate, observe, correct, and verify loop. Use for implementation tasks spanning these roles; skip for simple single-file edits.
---

# AI CV agent loop

Use the project roles in `.codex/agents/`. The lead owns the result and the
shared contract. Backend and frontend own their assigned implementation files.
QA reviews the integrated result independently. If agent delegation is not
available, the lead performs the same stages directly.

Start with the lead role for a multi-area request, or explicitly invoke
`$ai-cv-agent-loop`. The lead should give each specialist a concrete task only
after the affected contract and file ownership are clear. Do not run the loop
for a simple change confined to one area.

For a multi-area run, initialize the local controller in `scripts/loop.mjs`.
Read [references/stage-contract.md](references/stage-contract.md) for commands,
the evidence packet, and durable state. Record each agent handoff with the
controller; advance only when it accepts all required evidence. The controller
enforces sequence and packet shape. The lead still judges whether the evidence
reflects real work and checks.

## Stage gates

| Stage | Owner | Evidence required to advance |
| --- | --- | --- |
| 1. Plan | Lead | Acceptance criteria, file ownership, and API/data/error contract for affected paths. |
| 2. Build | Backend and frontend | Implemented changes, local checks, and any contract concerns sent to lead. |
| 3. Integrate | Lead | Connected full flow exercised against the contract; mismatches resolved. |
| 4. Observe | QA | Independent behavior and security findings, each reproducible or marked unverified. |
| 5. Correct | Backend and frontend, led by lead | Findings fixed and affected checks rerun; unresolved items returned to lead. |
| 6. Verify | Lead, with QA evidence | Acceptance criteria and relevant regression checks pass; remaining limits stated. |

The lead may overlap independent work, but must preserve these gates. A failure
returns the loop to the earliest affected stage. A changed contract returns to
Plan, then Build and all downstream stages. A code fix returns to the affected
Build task, then Integrate, Observe, and Verify. A failed final check returns
to Correct. Repeat until the requested outcome is verified or an actual block
is reported.

The project configuration permits up to three specialist threads alongside
the primary lead. Parallel BUILD work is appropriate only after the contract
and file ownership are established. QA reviews the integrated result afterward.

## Handoff protocol

For each delegated task, the lead sends: outcome, owned files or area, contract
version or exact contract text, acceptance criteria, and checks to run. Do not
assign the same file to two agents at once. Shared files stay with the lead
unless ownership is explicitly transferred.

Each builder returns: changed files, behavior, commands and results, contract
assumptions, and blockers. QA returns: pass/fail by criterion, reproduction
steps for each finding, expected and observed behavior, severity, and checks
that could not be run. The lead reconciles the reports with actual files and
checks before advancing.

## Completion rule

"Ship" in the diagram means the requested deliverable is ready and its status
is reported accurately. Do not claim deployment, publication, or full
verification without evidence and the required authorization. For CV data,
include privacy and sensitive-data exposure in the acceptance criteria and QA
review whenever the task touches those paths.
