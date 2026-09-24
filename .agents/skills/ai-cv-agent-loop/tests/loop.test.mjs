import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/loop.mjs');

function harness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-cv-loop-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, AI_CV_LOOP_RUNS_DIR: root };
  const call = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
  const state = id => JSON.parse(fs.readFileSync(path.join(root, id, 'state.json'), 'utf8'));
  const packet = (id, stage, owner, iteration, overrides = {}) => ({
    run_id: id, stage, owner, iteration, verdict: 'pass', summary: `${owner} checked ${stage}`,
    checks: ['relevant check passed'], artifacts: ['changed path'], issues: [], ...overrides,
  });
  const record = (id, value) => {
    const file = path.join(root, `${id}-packet.json`);
    fs.writeFileSync(file, JSON.stringify(value));
    return call('record', '--run', id, '--file', file);
  };
  return { call, state, packet, record };
}

test('full loop corrects QA finding and ships only after re-review', t => {
  const h = harness(t);
  const id = 'full-loop';
  assert.equal(h.call('init', '--id', id, '--objective', 'Implement assessment', '--max-iterations', '3').status, 0);
  assert.notEqual(h.call('advance', '--run', id).status, 0);
  assert.equal(h.record(id, h.packet(id, 'PLAN', 'lead', 1)).status, 0);
  assert.equal(h.call('advance', '--run', id).status, 0);
  assert.equal(h.record(id, h.packet(id, 'BUILD', 'backend', 1)).status, 0);
  assert.notEqual(h.call('advance', '--run', id).status, 0);
  assert.equal(h.record(id, h.packet(id, 'BUILD', 'frontend', 1)).status, 0);
  assert.equal(h.call('advance', '--run', id).status, 0);
  assert.equal(h.record(id, h.packet(id, 'INTEGRATE', 'lead', 1)).status, 0);
  assert.equal(h.call('advance', '--run', id).status, 0);
  const issue = { owner: 'backend', summary: 'Invalid upload accepted', expected: 'Reject invalid upload', observed: 'Upload accepted', reproduction: 'Submit malformed fixture' };
  assert.equal(h.record(id, h.packet(id, 'OBSERVE', 'qa', 1, { verdict: 'fail', issues: [issue] })).status, 0);
  assert.equal(h.call('advance', '--run', id).status, 0);
  assert.equal(h.state(id).stage, 'CORRECT');
  assert.deepEqual(h.state(id).required_owners, ['backend']);
  assert.equal(h.record(id, h.packet(id, 'CORRECT', 'backend', 2)).status, 0);
  assert.equal(h.call('advance', '--run', id).status, 0);
  assert.equal(h.record(id, h.packet(id, 'INTEGRATE', 'lead', 2)).status, 0);
  assert.equal(h.call('advance', '--run', id).status, 0);
  assert.equal(h.record(id, h.packet(id, 'OBSERVE', 'qa', 2)).status, 0);
  assert.equal(h.call('advance', '--run', id).status, 0);
  assert.equal(h.record(id, h.packet(id, 'VERIFY', 'lead', 2)).status, 0);
  assert.equal(h.call('advance', '--run', id).status, 0);
  assert.equal(h.state(id).status, 'shipped');
  assert.equal(h.state(id).stage, 'SHIP');
  assert.equal(h.call('validate', '--run', id).status, 0);
});

test('rejects stale, duplicate, malformed and privacy-unsafe packets', t => {
  const h = harness(t);
  const id = 'rejects';
  assert.equal(h.call('init', '--id', id, '--objective', 'Check gates').status, 0);
  assert.notEqual(h.record(id, h.packet(id, 'PLAN', 'lead', 2)).status, 0);
  assert.notEqual(h.record(id, h.packet(id, 'PLAN', 'lead', 1, { notes: 'unexpected' })).status, 0);
  assert.notEqual(h.record(id, h.packet(id, 'PLAN', 'lead', 1, { summary: 'Contact test@example.com' })).status, 0);
  assert.notEqual(h.record(id, h.packet(id, 'PLAN', 'lead', 1, { verdict: 'fail' })).status, 0);
  assert.equal(h.record(id, h.packet(id, 'PLAN', 'lead', 1)).status, 0);
  assert.notEqual(h.record(id, h.packet(id, 'PLAN', 'lead', 1)).status, 0);
  assert.equal(h.state(id).records.length, 1);
});

test('repeated failure blocks at iteration limit and cannot be advanced', t => {
  const h = harness(t);
  const id = 'blocked';
  assert.equal(h.call('init', '--id', id, '--objective', 'Bounded work', '--max-iterations', '1').status, 0);
  const issue = { owner: 'lead', summary: 'Contract incomplete', expected: 'Defined fields', observed: 'Missing fields', reproduction: 'Review plan' };
  assert.equal(h.record(id, h.packet(id, 'PLAN', 'lead', 1, { verdict: 'fail', issues: [issue] })).status, 0);
  assert.equal(h.call('advance', '--run', id).status, 0);
  assert.equal(h.state(id).stage, 'BLOCKED');
  assert.notEqual(h.call('advance', '--run', id).status, 0);
});

test('failed verification with changed contract returns to PLAN', t => {
  const h = harness(t);
  const id = 'replan';
  assert.equal(h.call('init', '--id', id, '--objective', 'Review contract', '--max-iterations', '2').status, 0);
  for (const [stage, owners] of [
    ['PLAN', ['lead']], ['BUILD', ['backend', 'frontend']],
    ['INTEGRATE', ['lead']], ['OBSERVE', ['qa']],
  ]) {
    for (const owner of owners) assert.equal(h.record(id, h.packet(id, stage, owner, 1)).status, 0);
    assert.equal(h.call('advance', '--run', id).status, 0);
  }
  const issue = { owner: 'lead', summary: 'Contract field missing', expected: 'Field defined', observed: 'Field absent', reproduction: 'Compare API response with criteria' };
  assert.equal(h.record(id, h.packet(id, 'VERIFY', 'lead', 1, { verdict: 'fail', issues: [issue], return_to: 'PLAN' })).status, 0);
  assert.equal(h.call('advance', '--run', id).status, 0);
  assert.equal(h.state(id).stage, 'PLAN');
  assert.equal(h.state(id).iteration, 2);
  assert.notEqual(h.record(id, h.packet(id, 'PLAN', 'lead', 1)).status, 0);
});

test('run ID cannot escape the runs directory', t => {
  const h = harness(t);
  assert.notEqual(h.call('init', '--id', '../outside', '--objective', 'Bad path').status, 0);
  assert.notEqual(h.call('show', '--run', '../../outside').status, 0);
});
