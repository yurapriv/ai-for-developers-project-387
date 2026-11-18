import { expect, test } from '@playwright/test';

test('гость указывает тему, владелец видит её, запись без темы обходится без строки темы', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:8080/__e2e/reset');
  await request.post('http://127.0.0.1:8080/meeting-types', {
    data: { name: 'Встреча', description: 'Описание', durationMinutes: 30 },
  });
  await page.goto('/booking');
  await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
  await page.getByLabel('День').selectOption('2027-01-01');
  await page.getByRole('button', { name: '10:00–10:30' }).click();
  await page.getByLabel('Имя').fill('Первый гость');
  await page.getByLabel('Email').fill('first@example.test');
  await page.getByLabel('Тема разговора').fill('Обсудить проект');
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible();
  // The guest confirmation never shows the topic.
  await expect(page.getByText('Обсудить проект')).toHaveCount(0);

  await page.getByRole('button', { name: 'Создать ещё одну запись' }).click();
  await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
  await page.getByLabel('День').selectOption('2027-01-01');
  await page.getByRole('button', { name: '11:00–11:30' }).click();
  await page.getByLabel('Имя').fill('Второй гость');
  await page.getByLabel('Email').fill('second@example.test');
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toBeVisible();

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Обновить список' }).click();
  const withTopic = page.locator('.upcoming-bookings li').filter({ hasText: '10:00–10:30' });
  await expect(withTopic).toContainText('Обсудить проект');
  const withoutTopic = page.locator('.upcoming-bookings li').filter({ hasText: '11:00–11:30' });
  await expect(withoutTopic).toContainText('Второй гость');
  await expect(withoutTopic).not.toContainText('Тема');
});
