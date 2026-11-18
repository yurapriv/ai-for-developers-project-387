const fields = new Map([
  ['исходное обращение', 'source'],
  ['спецификация', 'spec'],
  ['тикеты', 'tickets'],
  ['согласование', 'approval'],
]);

function reviewFields(body) {
  const values = { source: '', spec: '', tickets: '', approval: '' };
  let active;
  let fence;
  for (const line of body.replaceAll(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)) {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        delimiter?.[1][0] === fence[0] &&
        delimiter[1].length >= fence.length &&
        !delimiter[2].trim()
      ) {
        fence = undefined;
      }
      continue;
    }
    if (delimiter) {
      fence = delimiter[1];
      continue;
    }
    const heading = line.match(/^ {0,3}#{1,6}[ \t]+(.+?)\s*#*\s*$/);
    if (heading) {
      active = fields.get(heading[1].replace(/:$/, '').trim().toLowerCase());
      continue;
    }
    const inline = line.match(/^ {0,3}([^:]+):[ \t]*(.*)$/);
    const field = fields.get(inline?.[1].trim().toLowerCase());
    if (field) {
      values[field] += `${inline[2]}\n`;
      active = inline[2].trim() ? undefined : field;
    } else if (active) {
      values[active] += `${line}\n`;
    }
  }
  return values;
}

export function reviewLinks(body, repo) {
  const values = reviewFields(body);
  function issueNumbers(value) {
    const withoutUrls = value.replaceAll(
      /https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/issues\/([1-9]\d*)\b(?:#[\w-]+)?/gi,
      (_, linkedRepo, number) =>
        linkedRepo.toLowerCase() === repo.toLowerCase() ? ` #${number}` : '',
    );
    return [...new Set([...withoutUrls.matchAll(/(?:^|[\s(\[,])#([1-9]\d*)\b/g)].map((m) => m[1]))];
  }

  const escapedRepo = repo.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const approval = values.approval.match(
    new RegExp(
      `https://github\\.com/${escapedRepo}/issues/[1-9]\\d*#issuecomment-[1-9]\\d*\\b`,
      'i',
    ),
  );

  return {
    source: issueNumbers(values.source),
    spec: issueNumbers(values.spec),
    tickets: issueNumbers(values.tickets),
    approval: approval?.[0] ?? null,
  };
}
