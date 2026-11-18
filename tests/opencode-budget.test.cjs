const assert = require('node:assert/strict');
const test = require('node:test');
const { hasBudget } = require('../.github/scripts/opencode-budget.cjs');

const command = (id, run_attempt = 1, display_title = 'OpenCode PR #25') => ({
  id,
  run_number: id,
  run_attempt,
  display_title,
  event: 'issue_comment',
});

test('the fourth owner command on a PR is rejected, including line comments', () => {
  const runs = [
    command(1),
    { ...command(2), status: 'completed', conclusion: 'cancelled' },
    { ...command(3), event: 'pull_request_review_comment' },
    command(4),
    command(5, 1, 'OpenCode PR #26'),
  ];
  assert.equal(hasBudget(runs, { id: 3, attempt: 1, number: 25 }), true);
  assert.equal(hasBudget(runs, { id: 4, attempt: 1, number: 25 }), false);
  assert.equal(hasBudget(runs, { id: 5, attempt: 1, number: 26 }), true);
});

test('reruns use another attempt, including after timeout', () => {
  const runs = [
    { ...command(1, 2), conclusion: 'timed_out' },
    command(2),
    command(3, 1, 'OpenCode comment'),
    command(4),
  ];
  assert.equal(hasBudget([command(1, 2), command(2)], { id: 1, attempt: 2, number: 25 }), true);
  assert.equal(hasBudget(runs, { id: 1, attempt: 2, number: 25 }), false);
  assert.equal(hasBudget(runs, { id: 4, attempt: 1, number: 25 }), false);
});

test('fails closed if Actions cannot confirm the current attempt', () => {
  assert.throws(() => hasBudget([command(1)], { id: 1, attempt: 2, number: 25 }));
  assert.throws(() =>
    hasBudget([command(1), command(2, undefined, 'unrelated')], { id: 2, attempt: 1, number: 25 }),
  );
});
