async function allowTriage({ context, github }) {
  const { payload, eventName } = context;
  const owner = payload.repository?.owner?.login;
  const author = payload.issue?.user;
  const sender = payload.sender;
  const number = payload.issue?.number;
  const isOwner = (user) =>
    user?.type === 'User' && user.login?.toLowerCase() === owner?.toLowerCase();

  if (
    eventName !== 'issues' ||
    payload.action !== 'opened' ||
    !owner ||
    !number ||
    payload.issue?.pull_request ||
    !isOwner(author) ||
    !isOwner(sender)
  ) {
    return false;
  }

  const { data: issue } = await github.rest.issues.get({
    ...context.repo,
    issue_number: number,
  });
  return (
    issue.state === 'open' &&
    !issue.pull_request &&
    isOwner(issue.user) &&
    Array.isArray(issue.labels) &&
    !issue.labels.some(
      (label) => (typeof label === 'string' ? label : label.name) === 'ready-for-agent',
    )
  );
}

module.exports = { allowTriage };
