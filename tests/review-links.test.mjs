import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewLinks } from '../.github/scripts/review-links.mjs';

const repo = 'owner/calendar';
const base = `https://github.com/${repo}/issues`;
const approval = `${base}/3#issuecomment-42`;
const expected = { source: ['3'], spec: ['4'], tickets: ['5', '6'], approval };

test('reads linked evidence from the PR template fields', () => {
  const body = `Исходное обращение: ${base}/3
Спецификация: #4
Тикеты: #5, #6
Согласование: ${approval}`;

  assert.deepEqual(reviewLinks(body, repo), expected);
});

test('reads linked evidence under headings in the PR written by implement-spec', () => {
  const body = `### Исходное обращение

${base}/3

### Спецификация

[Согласованная спецификация](${base}/4)

### Тикеты

- ${base}/5 — базовый срез
- #6 — валидация

### Согласование

${approval}

### Что сделано

Замечание из #7 не входит в тикеты.`;

  assert.deepEqual(reviewLinks(body, repo), expected);
});

test('ignores example references, comments and links to other repositories', () => {
  const body = `### Спецификация
https://github.com/elsewhere/calendar/issues/8

\`\`\`md
Тикеты: #90
Согласование: ${base}/3#issuecomment-91
\`\`\`

<!--
Исходное обращение: #92
-->

Тикеты: #5, ${base}/5, ${base}/6
Согласование: https://github.com/elsewhere/calendar/issues/3#issuecomment-99`;

  assert.deepEqual(reviewLinks(body, repo), {
    source: [],
    spec: [],
    tickets: ['5', '6'],
    approval: null,
  });
});
