const assert = require('node:assert/strict');
const test = require('node:test');
const { allowTriage } = require('../.github/scripts/triage-gate.cjs');

const owner = { login: 'owner', type: 'User' };

function event(overrides = {}) {
  return {
    eventName: 'issues',
    repo: { owner: 'owner', repo: 'project' },
    payload: {
      action: 'opened',
      repository: { owner: { login: 'owner' } },
      sender: owner,
      issue: { number: 123, user: owner },
      ...overrides,
    },
  };
}

function github(issue = {}) {
  return {
    rest: {
      issues: {
        get: async ({ issue_number }) => {
          assert.equal(issue_number, 123);
          return { data: { state: 'open', user: owner, labels: [], ...issue } };
        },
      },
    },
  };
}

test('accepts a fresh open issue from the owner', async () => {
  assert.equal(await allowTriage({ context: event(), github: github() }), true);
});

test('rejects other authors, bots, senders, events and pull requests', async () => {
  const contexts = [
    event({ issue: { number: 123, user: { login: 'other', type: 'User' } } }),
    event({ issue: { number: 123, user: { login: 'owner', type: 'Bot' } } }),
    event({ sender: { login: 'other', type: 'User' } }),
    event({ sender: { login: 'owner', type: 'Bot' } }),
    event({ action: 'edited' }),
    event({ issue: { number: 123, user: owner, pull_request: {} } }),
    event({ issue: { user: owner } }),
    event({ repository: {} }),
    { ...event(), eventName: 'issue_comment' },
  ];
  for (const context of contexts) {
    assert.equal(await allowTriage({ context, github: github() }), false);
  }
});

test('checks current issue state and labels instead of the opening snapshot', async () => {
  const context = event({ issue: { number: 123, user: owner, labels: [] } });
  for (const issue of [
    { labels: [{ name: 'ready-for-agent' }] },
    { labels: ['ready-for-agent'] },
    { state: 'closed' },
    { user: { login: 'github-actions[bot]', type: 'Bot' } },
    { pull_request: {} },
    { labels: null },
  ]) {
    assert.equal(await allowTriage({ context, github: github(issue) }), false);
  }
});

test('fails closed when the current issue cannot be fetched', async () => {
  const broken = {
    rest: {
      issues: {
        get: async () => {
          throw new Error('unavailable');
        },
      },
    },
  };
  await assert.rejects(allowTriage({ context: event(), github: broken }), /unavailable/);
});
