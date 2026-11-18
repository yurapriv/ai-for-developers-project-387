const COMMAND_EVENTS = new Set(['issue_comment', 'pull_request_review_comment']);
const MAX_ATTEMPTS = 3;
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

function hasBudget(runs, { id, attempt, number }) {
  const matching = runs.filter(
    (run) => COMMAND_EVENTS.has(run.event) && run.display_title === `OpenCode PR #${number}`,
  );
  const current = matching.find((run) => run.id === id);
  if (
    current?.run_attempt !== attempt ||
    matching.some(
      (run) =>
        !Number.isSafeInteger(run.run_attempt) ||
        run.run_attempt < 1 ||
        !Number.isSafeInteger(run.run_number) ||
        run.run_number < 1,
    ) ||
    new Set(matching.map((run) => run.id)).size !== matching.length
  ) {
    throw new Error('Incomplete or inconsistent PR command history');
  }

  // Initial requests reserve slots in run-number order, not job start order.
  // A rerun also reserves capacity for all other requests already in history.
  let used = attempt - 1;
  for (const run of matching) {
    if (run === current) continue;
    used += run.run_attempt - 1;
    if (attempt > 1 || run.run_number < current.run_number) used += 1;
  }
  return used < MAX_ATTEMPTS;
}

async function checkBudget({ github, repo, id, attempt, number }) {
  const runs = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data } = await github.rest.actions.listWorkflowRuns({
      ...repo,
      workflow_id: 'opencode.yml',
      per_page: PAGE_SIZE,
      page,
    });
    runs.push(...data.workflow_runs);
    if (runs.length === data.total_count) {
      if (new Set(runs.map((run) => run.id)).size !== runs.length) {
        throw new Error('History changed during pagination');
      }
      return hasBudget(runs, { id, attempt, number });
    }
    if (runs.length > data.total_count || data.workflow_runs.length !== PAGE_SIZE) break;
  }
  throw new Error('Unable to read full workflow history');
}

module.exports = { hasBudget, checkBudget };
