import assert from 'node:assert/strict';
import test from 'node:test';
import {
  demoReport,
  liveReport,
  makePrompt,
  parseDecision,
  publish,
} from '../.github/scripts/lighthouse-audit.mjs';

const url = 'https://calendar-booking-387-l7ns.onrender.com/booking';
const runUrl = 'https://github.com/owner/repo/actions/runs/123';
const owner = 'owner';
const decision = {
  summary: 'Учебная находка: замеров не было.',
  finding: {
    id: 'demo-image-delivery',
    problem: 'Тяжёлое вымышленное изображение задерживает LCP.',
    action: 'Сжать изображение и повторить измерение.',
    duplicateIssue: null,
  },
};

function lhr(lcp) {
  return {
    requestedUrl: url,
    finalDisplayedUrl: url,
    configSettings: { formFactor: 'mobile' },
    categories: { performance: { score: 0.82 } },
    audits: {
      'largest-contentful-paint': { numericValue: lcp },
      'cumulative-layout-shift': { numericValue: 0.01 },
      'total-blocking-time': { numericValue: 95 },
      'document-latency-insight': {
        score: 0,
        details: { items: { latency: false }, debugData: { serverResponseTime: 900 } },
        title: 'Document request latency',
      },
      'image-delivery-insight': {
        score: 0,
        details: { items: [{ url: `${url}/hero.png?private=secret`, wastedBytes: 500_000 }] },
      },
    },
  };
}

function stubGitHub(issues = []) {
  const writes = [];
  return {
    writes,
    list: async () => issues,
    async create(record) {
      const number = issues.length + 20;
      const issue = {
        ...record,
        number,
        html_url: `https://github.com/owner/repo/issues/${number}`,
        state: 'open',
        user: { login: 'github-actions[bot]' },
      };
      issues.push(issue);
      writes.push(['create', issue]);
      return issue;
    },
    async update(number, { body }) {
      const issue = issues.find((item) => item.number === number);
      issue.body = body;
      writes.push(['update', issue]);
      return issue;
    },
  };
}

test('uses the median of three successful mobile measurements and projects diagnostic evidence', () => {
  const report = liveReport(url, [lhr(2400), lhr(4000), lhr(2900)]);
  assert.equal(report.metrics[0].median, 2900);
  assert.deepEqual(
    report.candidates.map(({ id }) => id),
    ['document-latency-insight', 'image-delivery-insight'],
  );
  assert.equal(report.candidates[0].diagnostic.serverResponseTime, 900);
  assert.equal(report.candidates[1].diagnostic.items[0].resource, `${url}/hero.png`);
  assert.doesNotMatch(JSON.stringify(report), /private|secret/u);
  assert.deepEqual(liveReport(url, [lhr(2100), lhr(2500), lhr(4000)]).candidates, []);
});

test('rejects partial, desktop, errored or redirected reports instead of treating them as clean', () => {
  for (const reports of [
    [lhr(900)],
    [lhr(900), lhr(900), { ...lhr(900), configSettings: { formFactor: 'desktop' } }],
    [lhr(900), lhr(900), { ...lhr(900), runtimeError: { code: 'NO_FCP' } }],
    [lhr(900), lhr(900), { ...lhr(900), finalDisplayedUrl: 'https://example.com/error' }],
  ]) {
    assert.throws(() => liveReport(url, reports), /successful mobile Lighthouse reports/u);
  }
});

test('accepts only a valid OpenCode decision tied to the report and rejects tool use or errors', () => {
  const report = demoReport(url);
  const output = (value) => JSON.stringify({ type: 'text', part: { text: JSON.stringify(value) } });
  assert.deepEqual(parseDecision(output(decision), report), decision);
  assert.throws(() =>
    parseDecision(
      output({ ...decision, finding: { ...decision.finding, id: 'invented' } }),
      report,
    ),
  );
  assert.throws(() => parseDecision(output({ ...decision, finding: null }), report));
  assert.throws(
    () => parseDecision('{"type":"error","error":{"status":429}}', report),
    /HTTP 429/u,
  );
  assert.throws(
    () => parseDecision(`{"type":"tool_use"}\n${output(decision)}`, report),
    /attempted to use a tool/u,
  );
});

test('creates one labeled-as-educational issue and skips a repeat even after the issue is closed', async () => {
  const github = stubGitHub();
  const report = demoReport(url);
  const first = await publish(report, decision, github, runUrl, owner);
  assert.match(first, /Создано отдельное issue/u);
  const issue = github.writes[0][1];
  assert.match(issue.title, /^\[Учебное\]/u);
  assert.match(issue.body, /не подтверждённый дефект/u);
  assert.match(issue.body, /4200/u);
  assert.ok(issue.body.includes(runUrl));
  issue.state = 'closed';
  assert.match(
    makePrompt(report, [issue]),
    /"knownMatches":\[\{"id":"demo-image-delivery","issue":20\}\]/u,
  );
  const repeat = await publish(
    report,
    { ...decision, summary: 'Повтор с тем же результатом.' },
    github,
    `${runUrl}4`,
    owner,
  );
  assert.match(repeat, /Дубль.*#20/u);
  assert.equal(github.writes.length, 1);
});

test('honors a distinct closed issue identified by the agent but does not merge live with demo', async () => {
  const report = liveReport(url, [lhr(3200), lhr(3200), lhr(3200)]);
  const finding = { ...decision.finding, id: 'image-delivery-insight', duplicateIssue: 6 };
  const issue = {
    number: 6,
    state: 'closed',
    title: 'Большое изображение в каталоге',
    html_url: 'https://github.com/owner/repo/issues/6',
  };
  const github = stubGitHub([issue]);
  const response = { summary: 'Есть совпадение.', finding };
  assert.match(await publish(report, response, github, runUrl, owner), /Дубль.*#6/u);
  assert.equal(github.writes.length, 0);
  issue.title = '[Учебное] Пример';
  await assert.rejects(publish(report, response, github, runUrl, owner), /across audit modes/u);
  assert.equal(github.writes.length, 0);
});

test('a clean live run updates the owner status without creating an issue or a comment', async () => {
  const report = liveReport(url, [lhr(900), lhr(950), lhr(1000)]);
  const clean = { summary: 'Новых находок нет.', finding: null };
  const body = '<!-- lighthouse-audit:latest-live -->\n\nОжидается результат.';
  const spoofed = { number: 5, body, user: { login: 'other-user' } };
  const status = {
    number: 7,
    body,
    html_url: 'https://github.com/owner/repo/issues/7',
    user: { login: owner },
  };
  const github = stubGitHub([spoofed, status]);
  assert.match(await publish(report, clean, github, runUrl, owner), /статус сохранён.*#7/u);
  await publish(report, clean, github, runUrl, owner);
  assert.deepEqual(
    github.writes.map(([method, issue]) => [method, issue.number]),
    [['update', 7]],
  );
  assert.ok(status.body.includes(runUrl));
  assert.equal(spoofed.body, body);
  await assert.rejects(
    publish(report, clean, stubGitHub([]), runUrl, owner),
    /Missing owner-created/u,
  );
});
