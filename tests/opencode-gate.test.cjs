const assert = require('node:assert/strict');
const test = require('node:test');
const { allowOpenCode } = require('../.github/scripts/opencode-gate.cjs');

function event(overrides = {}) {
  return {
    eventName: 'issue_comment',
    repo: { owner: 'owner', repo: 'project' },
    payload: {
      repository: { id: 42, owner: { login: 'owner' }, default_branch: 'main' },
      comment: { user: { login: 'owner', type: 'User' }, body: '/oc explain' },
      issue: { number: 123 },
      ...overrides,
    },
  };
}

function github(headId = 42) {
  return {
    rest: {
      pulls: {
        get: async () => ({
          data: {
            state: 'open',
            head: { repo: { id: headId }, ref: 'feature', sha: 'f'.repeat(40) },
          },
        }),
      },
    },
  };
}

test('accepts owner commands on issues', async () => {
  assert.equal(await allowOpenCode({ context: event(), github: github() }), true);
  assert.equal(
    await allowOpenCode({
      context: event({
        comment: { user: { login: 'owner', type: 'User' }, body: '/opencode explain' },
      }),
      github: github(),
    }),
    true,
  );
});

test('rejects other authors, bots and comments without a command', async () => {
  for (const comment of [
    { user: { login: 'other', type: 'User' }, body: '/oc explain' },
    { user: { login: 'owner', type: 'Bot' }, body: '/oc explain' },
    { user: { login: 'owner', type: 'User' }, body: 'hello' },
    { user: { login: 'owner', type: 'User' }, body: 'https://example.test/oc' },
  ]) {
    assert.equal(await allowOpenCode({ context: event({ comment }), github: github() }), false);
  }
});

test('checks PR issue comments against the actual head repository', async () => {
  const context = event({ issue: { number: 123, pull_request: {} } });
  assert.equal(await allowOpenCode({ context, github: github(42) }), true);
  assert.equal(await allowOpenCode({ context, github: github(99) }), false);
  assert.equal(await allowOpenCode({ context, github: github(null) }), false);
});

test('checks review comments and fails closed when lookup fails', async () => {
  const context = event({ pull_request: { number: 123 } });
  context.eventName = 'pull_request_review_comment';
  assert.equal(await allowOpenCode({ context, github: github(42) }), true);
  assert.equal(await allowOpenCode({ context, github: github(99) }), false);
  const broken = {
    rest: {
      pulls: {
        get: async () => {
          throw new Error('unavailable');
        },
      },
    },
  };
  await assert.rejects(allowOpenCode({ context, github: broken }), /unavailable/);
});
