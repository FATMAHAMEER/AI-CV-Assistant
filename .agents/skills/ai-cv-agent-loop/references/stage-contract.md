# Stage and handoff contract

The controller keeps each run in `work/runs/<run-id>/state.json` at the project
root. The run ID is a
short unique identifier using letters, numbers, `_`, or `-`. Runtime state is
ignored by Git. It contains metadata and evidence summaries, never CV content.

## Evidence packet

Each owner writes a JSON packet and passes its path to `record`:

```json
{
  "run_id": "cv-loop-001",
  "iteration": 1,
  "stage": "BUILD",
  "owner": "backend",
  "verdict": "pass",
  "summary": "Implemented the agreed upload response and validation errors.",
  "checks": ["backend test command: passed"],
  "artifacts": ["backend/routes/upload.py"],
  "issues": []
}
```

`stage` is one of `PLAN`, `BUILD`, `INTEGRATE`, `OBSERVE`, `CORRECT`, or
`VERIFY`. Owners are `lead` for PLAN, INTEGRATE, and VERIFY; `backend` and
`frontend` for BUILD; `qa` for OBSERVE. CORRECT requires the owner or owners
assigned in QA or integration findings. A failing packet must include one or
more issues, each with `owner`, `summary`, `expected`, `observed`, and
`reproduction`. Issue owners are `backend`, `frontend`, or `lead`.

The lead's VERIFY failure packet must also contain `return_to` set to `PLAN`
for a changed contract or `CORRECT` for an implementation defect. The
controller accepts evidence once per owner per stage and iteration. Revise an
incorrect packet before recording it; do not overwrite recorded evidence.

## Run state

`run_id`, `objective`, `iteration`, `max_iterations`, `stage`, `status`,
`required_owners`, `records`, `history`, and `next_action` are durable fields.
`status` is `active`, `shipped`, or `blocked`. `SHIP` and `BLOCKED` are terminal
stages. `history` records completed transitions and their verdicts.

## Commands

From the project root:

```powershell
node .agents/skills/ai-cv-agent-loop/scripts/loop.mjs init --id cv-loop-001 --objective "Implement CV assessment" --max-iterations 3
node .agents/skills/ai-cv-agent-loop/scripts/loop.mjs show --run cv-loop-001
node .agents/skills/ai-cv-agent-loop/scripts/loop.mjs record --run cv-loop-001 --file path/to/packet.json
node .agents/skills/ai-cv-agent-loop/scripts/loop.mjs advance --run cv-loop-001
node .agents/skills/ai-cv-agent-loop/scripts/loop.mjs validate --run cv-loop-001
```

`advance` rejects missing, stale, mismatched, or privacy-unsafe handoffs. QA
pass goes to VERIFY; QA failure goes to CORRECT. Successful correction returns
to INTEGRATE and independent QA review. A failed VERIFY loops to PLAN or
CORRECT. The run becomes BLOCKED when its iteration limit is reached. SHIP
means locally verified and ready to report, not deployed or published.
