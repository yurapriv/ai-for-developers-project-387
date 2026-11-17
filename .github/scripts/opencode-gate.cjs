async function allowOpenCode({ context, github }) {
  const { payload, eventName } = context;
  const comment = payload.comment;
  const owner = payload.repository?.owner?.login;

  if (
    !owner ||
    comment?.user?.type !== 'User' ||
    comment.user.login?.toLowerCase() !== owner.toLowerCase() ||
    typeof comment.body !== 'string' ||
    !['/oc', '/opencode'].some((mention) => comment.body.toLowerCase().includes(mention))
  ) {
    return false;
  }

  if (eventName === 'issue_comment' && !payload.issue?.pull_request) {
    return Boolean(payload.issue?.number);
  }

  const number =
    eventName === 'issue_comment'
      ? payload.issue?.number
      : eventName === 'pull_request_review_comment'
        ? payload.pull_request?.number
        : undefined;

  if (!number) return false;

  const { data: pull } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: number,
  });
  return Boolean(pull.head?.repo?.id && pull.head.repo.id === payload.repository.id);
}

module.exports = { allowOpenCode };
