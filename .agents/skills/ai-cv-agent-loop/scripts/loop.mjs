#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectDir = path.resolve(skillDir, '../../..');
const runsDir = process.env.AI_CV_LOOP_RUNS_DIR ? path.resolve(process.env.AI_CV_LOOP_RUNS_DIR) : path.join(projectDir, 'work', 'runs');
const stages = new Set(['PLAN', 'BUILD', 'INTEGRATE', 'OBSERVE', 'CORRECT', 'VERIFY']);
const issueOwners = new Set(['lead', 'backend', 'frontend']);
const ownerByStage = { PLAN: ['lead'], BUILD: ['backend', 'frontend'], INTEGRATE: ['lead'], OBSERVE: ['qa'], VERIFY: ['lead'] };

function fail(message) { throw new Error(message); }
function nonempty(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a nonempty string`);
  return value.trim();
}
function runPath(id) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id || '')) fail('run ID must be 1-64 letters, numbers, _ or -');
  return path.join(runsDir, id, 'state.json');
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`Cannot read JSON ${file}: ${error.message}`); }
}
function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'w' });
  fs.renameSync(temporary, file);
}
function readState(id) {
  const file = runPath(id);
  const state = readJson(file);
  validateState(state, id);
  return { file, state };
}
function validateState(state, id) {
  if (!state || typeof state !== 'object' || state.run_id !== id) fail('Invalid run state or run ID mismatch');
  nonempty(state.objective, 'objective');
  if (!Number.isInteger(state.iteration) || state.iteration < 1 || !Number.isInteger(state.max_iterations) || state.max_iterations < 1) fail('Invalid iteration state');
  if (!['active', 'shipped', 'blocked'].includes(state.status)) fail('Invalid status');
  if (state.status === 'active' && !stages.has(state.stage)) fail('Invalid active stage');
  if (state.status === 'shipped' && state.stage !== 'SHIP') fail('Invalid shipped state');
  if (state.status === 'blocked' && state.stage !== 'BLOCKED') fail('Invalid blocked state');
  if (!Array.isArray(state.required_owners) || !Array.isArray(state.records) || !Array.isArray(state.history)) fail('Invalid run collections');
  if (state.status === 'active' && state.stage !== 'CORRECT' && JSON.stringify(state.required_owners) !== JSON.stringify(ownerByStage[state.stage])) fail('Invalid required owners');
  if (state.status === 'active' && state.stage === 'CORRECT' && (state.required_owners.length === 0 || state.required_owners.some(o => !issueOwners.has(o)))) fail('Invalid correction owners');
  if (new Set(state.required_owners).size !== state.required_owners.length) fail('Duplicate required owner');
}
function sensitive(value) {
  const raw = JSON.stringify(value);
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(raw)
    || /(?:sk-[A-Za-z0-9_-]{12,}|(?:api[_ -]?key|password|secret)\s*[:=]\s*\S+)/i.test(raw)
    || /"(?:cv_text|resume_text|personal_data|raw_cv|raw_resume|token|password|api_key)"\s*:/i.test(raw);
}
function stringList(value, label) {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !v.trim())) fail(`${label} must be a list of nonempty strings`);
}
function validatePacket(packet, state) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) fail('Packet must be an object');
  const allowed = new Set(['run_id', 'iteration', 'stage', 'owner', 'verdict', 'summary', 'checks', 'artifacts', 'issues', 'return_to']);
  if (Object.keys(packet).some(k => !allowed.has(k))) fail('Packet contains unsupported fields');
  if (sensitive(packet)) fail('Packet may contain personal data or credentials; use redacted summaries');
  if (packet.run_id !== state.run_id || packet.iteration !== state.iteration || packet.stage !== state.stage) fail('Stale or mismatched packet');
  if (!state.required_owners.includes(packet.owner)) fail('Owner is not required for this stage');
  if (!['pass', 'fail'].includes(packet.verdict)) fail('Verdict must be pass or fail');
  nonempty(packet.summary, 'summary');
  stringList(packet.checks, 'checks');
  stringList(packet.artifacts, 'artifacts');
  if (!Array.isArray(packet.issues)) fail('issues must be a list');
  for (const issue of packet.issues) {
    if (!issue || typeof issue !== 'object' || Object.keys(issue).some(k => !['owner', 'summary', 'expected', 'observed', 'reproduction'].includes(k))) fail('Invalid issue fields');
    if (!issueOwners.has(issue.owner)) fail('Invalid issue owner');
    for (const key of ['summary', 'expected', 'observed', 'reproduction']) nonempty(issue[key], `issue.${key}`);
  }
  if (packet.verdict === 'fail' && packet.issues.length === 0) fail('Fail verdict requires a reproducible issue');
  if (packet.verdict === 'pass' && packet.issues.length !== 0) fail('Pass verdict cannot include unresolved issues');
  if (state.stage === 'VERIFY' && packet.verdict === 'fail' && !['PLAN', 'CORRECT'].includes(packet.return_to)) fail('Failed VERIFY requires return_to PLAN or CORRECT');
  if (packet.return_to !== undefined && !(state.stage === 'VERIFY' && packet.verdict === 'fail')) fail('return_to is only valid for failed VERIFY');
  if (state.records.some(r => r.stage === state.stage && r.iteration === state.iteration && r.owner === packet.owner)) fail('Duplicate owner packet');
}
function currentRecords(state) { return state.records.filter(r => r.stage === state.stage && r.iteration === state.iteration); }
function setStage(state, stage, owners) {
  state.stage = stage;
  state.required_owners = owners ?? ownerByStage[stage] ?? [];
  state.next_action = stage === 'SHIP' ? 'Report locally verified result; deploy only if authorized.' : stage === 'BLOCKED' ? 'Report unresolved findings and request a new run or changed limit.' : `Collect ${state.required_owners.join(' and ')} evidence for ${stage}.`;
}
function advance(state) {
  if (state.status !== 'active') fail('Terminal run cannot advance');
  const records = currentRecords(state);
  const missing = state.required_owners.filter(owner => !records.some(r => r.owner === owner));
  if (missing.length) fail(`Missing ${state.stage} evidence from: ${missing.join(', ')}`);
  const stage = state.stage;
  const failed = records.filter(r => r.verdict === 'fail');
  state.history.push({ iteration: state.iteration, stage, verdict: failed.length ? 'fail' : 'pass', owners: records.map(r => r.owner) });
  if (stage === 'PLAN') {
    if (failed.length) retry(state, 'PLAN');
    else setStage(state, 'BUILD');
  } else if (stage === 'BUILD') {
    if (failed.length) retry(state, 'BUILD');
    else setStage(state, 'INTEGRATE');
  } else if (stage === 'INTEGRATE') {
    if (failed.length) correction(state, failed);
    else setStage(state, 'OBSERVE');
  } else if (stage === 'OBSERVE') {
    if (failed.length) correction(state, failed);
    else setStage(state, 'VERIFY');
  } else if (stage === 'CORRECT') {
    if (failed.length) correction(state, failed);
    else setStage(state, 'INTEGRATE');
  } else if (stage === 'VERIFY') {
    if (!failed.length) { state.status = 'shipped'; setStage(state, 'SHIP'); }
    else {
      const target = failed[0].return_to;
      if (target === 'PLAN') retry(state, 'PLAN');
      else correction(state, failed);
    }
  }
  return state;
}
function retry(state, stage, owners) {
  if (state.iteration >= state.max_iterations) { state.status = 'blocked'; setStage(state, 'BLOCKED'); return; }
  state.iteration += 1;
  setStage(state, stage, owners);
}
function correction(state, failed) {
  const owners = [...new Set(failed.flatMap(r => r.issues.map(i => i.owner)))];
  retry(state, 'CORRECT', owners);
}
function argsMap(args) {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith('--') || !args[i + 1]) fail('Use --key value options');
    values[args[i].slice(2)] = args[i + 1];
  }
  return values;
}
function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = argsMap(args);
  if (command === 'init') {
    const id = options.id;
    const file = runPath(id);
    if (fs.existsSync(file)) fail(`Run ${id} already exists`);
    const max = Number(options['max-iterations'] ?? 3);
    if (!Number.isInteger(max) || max < 1 || max > 20) fail('max-iterations must be 1-20');
    const state = { run_id: id, objective: nonempty(options.objective, 'objective'), iteration: 1, max_iterations: max, stage: 'PLAN', status: 'active', required_owners: ['lead'], records: [], history: [], next_action: 'Collect lead evidence for PLAN.' };
    save(file, state);
    console.log(file);
    return;
  }
  if (!['show', 'record', 'advance', 'validate'].includes(command)) fail('Commands: init, show, record, advance, validate');
  const { file, state } = readState(options.run);
  if (command === 'record') {
    if (state.status !== 'active') fail('Terminal run cannot accept records');
    const packet = readJson(nonempty(options.file, 'file'));
    validatePacket(packet, state);
    state.records.push(packet);
    save(file, state);
    console.log(`Recorded ${packet.stage} evidence from ${packet.owner}`);
  } else if (command === 'advance') {
    const next = structuredClone(state);
    advance(next);
    save(file, next);
    console.log(`${next.stage} (${next.status}, iteration ${next.iteration})`);
  } else if (command === 'validate') {
    for (const record of state.records) {
      if (!stages.has(record.stage) || !Number.isInteger(record.iteration) || !['pass', 'fail'].includes(record.verdict)) fail('Invalid historical record');
      if (sensitive(record)) fail('Sensitive data in run state');
    }
    console.log(`Valid: ${state.stage} (${state.status})`);
  } else console.log(JSON.stringify(state, null, 2));
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
