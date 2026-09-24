# AI CV Assessment agent workflow

For implementation that spans backend, frontend, or QA, use the project
`ai-cv-agent-loop` skill in `.agents/skills/ai-cv-agent-loop/SKILL.md`.
The lead role in `.codex/agents/lead.toml` owns the request, shared contract,
integration, and final verification. Delegate bounded implementation to
`backend` and `frontend`, and independent review to `qa`, when those agents
are available. Keep file ownership and handoffs explicit.
For a multi-area run, use the skill's local controller and stage contract to
record handoffs and verify transitions. The controller does not launch agents;
Codex handles delegation.

For a small task confined to one area, work directly in that area and run its
relevant checks. Do not create plans, handoff artifacts, or agent runs merely
to satisfy the six-stage diagram.

The project currently contains the agent harness, not the application. Inspect
the repository before assuming an app stack, API contract, or app test command.
