async function getOpenCodeTarget({ context, github }) {
  const { payload, eventName } = context;
  const comment = payload.comment;
  const owner = payload.repository?.owner?.login;

  if (
    !owner ||
    comment?.user?.type !== 'User' ||
    comment.user.login?.toLowerCase() !== owner.toLowerCase() ||
    typeof comment.body !== 'string' ||
    !/^\/(?:oc|opencode)(?: |$)/i.test(comment.body)
  ) {
    return null;
  }

  if (eventName === 'issue_comment' && !payload.issue?.pull_request) {
    return payload.issue?.number ? { issue: payload.issue.number } : null;
  }

  const number =
    eventName === 'issue_comment'
      ? payload.issue?.number
      : eventName === 'pull_request_review_comment'
        ? payload.pull_request?.number
        : undefined;

  if (!number) return null;

  const { data: pull } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: number,
  });
  if (
    pull.state !== 'open' ||
    pull.head?.repo?.id !== payload.repository.id ||
    pull.head?.ref === payload.repository.default_branch ||
    !/^[a-f0-9]{40}$/.test(pull.head?.sha)
  ) {
    return null;
  }
  return { number, sha: pull.head.sha };
}

async function allowOpenCode(input) {
  return Boolean(await getOpenCodeTarget(input));
}

module.exports = { allowOpenCode, getOpenCodeTarget };
