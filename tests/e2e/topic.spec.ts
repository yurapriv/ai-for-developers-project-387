import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

async function resetWithType(request: APIRequestContext) {
  await request.post('http://127.0.0.1:8080/__e2e/reset');
  await request.post('http://127.0.0.1:8080/meeting-types', {
    data: { name: 'Встреча', description: 'Описание', durationMinutes: 30 },
  });
}

async function openSlot(page: Page, slot: string) {
  await page.goto('/booking');
  await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
  await page.getByLabel('День').selectOption('2027-01-01');
  await page.getByRole('button', { name: slot }).click();
}

test('гость указывает тему разговора, владелец видит её, запись без темы обходится без строки темы', async ({
  page,
  request,
}) => {
  await resetWithType(request);
  await openSlot(page, '10:00–10:30');
  await page.getByLabel('Имя').fill('Первый гость');
  await page.getByLabel('Email').fill('first@example.test');
  await page.getByLabel('Тема разговора').fill('Обсудить проект');
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible();
  // The guest confirmation never shows the topic.
  await expect(page.getByText('Обсудить проект')).toHaveCount(0);

  await page.getByRole('button', { name: 'Создать ещё одну запись' }).click();
  await openSlot(page, '11:00–11:30');
  await page.getByLabel('Имя').fill('Второй гость');
  await page.getByLabel('Email').fill('second@example.test');
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible();

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Обновить список' }).click();
  const withTopic = page.getByRole('listitem').filter({ hasText: '10:00–10:30' });
  await expect(withTopic).toContainText('Тема разговора: Обсудить проект');
  const withoutTopic = page.getByRole('listitem').filter({ hasText: '11:00–11:30' });
  await expect(withoutTopic).toContainText('Второй гость');
  await expect(withoutTopic).not.toContainText('Тема разговора');
});

test('недопустимая тема разговора показывает ошибку и не создаёт запись', async ({
  page,
  request,
}) => {
  await resetWithType(request);
  await openSlot(page, '10:00–10:30');
  await page.getByLabel('Имя').fill('Гость');
  await page.getByLabel('Email').fill('guest@example.test');
  const topic = page.getByLabel('Тема разговора');
  await topic.fill('я'.repeat(201));
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(topic).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toHaveCount(0);
  const bookings = await request.get('http://127.0.0.1:8080/bookings');
  expect(await bookings.json()).toHaveLength(0);
});
