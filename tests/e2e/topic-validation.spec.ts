import { expect, test } from '@playwright/test';

test('недопустимая тема показывает ошибку и не создаёт запись', async ({ page, request }) => {
  await request.post('http://127.0.0.1:8080/__e2e/reset');
  await request.post('http://127.0.0.1:8080/meeting-types', {
    data: { name: 'Встреча', description: 'Описание', durationMinutes: 30 },
  });
  await page.goto('/booking');
  await page.getByRole('button', { name: 'Выбрать', exact: true }).click();
  await page.getByLabel('День').selectOption('2027-01-01');
  await page.getByRole('button', { name: '10:00–10:30' }).click();
  await page.getByLabel('Имя').fill('Гость');
  await page.getByLabel('Email').fill('guest@example.test');
  await page.getByLabel('Тема разговора').fill('я'.repeat(201));
  await page.getByRole('button', { name: 'Записаться' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '200' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Запись подтверждена' })).toHaveCount(0);
  const bookings = await request.get('http://127.0.0.1:8080/bookings');
  expect(await bookings.json()).toHaveLength(0);
});
