import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/authenticated';

type Schedule = { Time: string; Repeat: string; AllowedDays: string[] };
const customSchedule = (time: string): Schedule => ({
  Time: time,
  Repeat: '2W',
  AllowedDays: ['Monday', 'Friday'],
});

async function openSchedule(page: Page, initial: Schedule) {
  let schedule: Schedule | null = initial;
  const saves: (Schedule | null)[] = [];
  await page.route('**/api/v2/connection-strings', (route) => route.fulfill({ json: { Success: true, Data: [] } }));
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({ json: { AccessToken: 'fixture-access-token', RefreshNonce: 'fixture-refresh-nonce' } })
  );
  await page.route('**/api/v1/backup/42', (route) => {
    if (route.request().method() === 'PUT') {
      schedule = route.request().postDataJSON().Schedule;
      saves.push(schedule);
      return route.fulfill({ json: {} });
    }
    return route.fulfill({
      json: {
        Backup: {
          ID: '42',
          Name: 'Scheduled documents',
          Description: '',
          Sources: ['/source/'],
          TargetURL: 'file:///backup',
          Settings: [{ Name: '--no-encryption', Value: 'true' }],
          Filters: [],
          Metadata: {},
          OperationType: 'Backup',
        },
        Schedule: schedule && {
          ...schedule,
          // The server accepts full weekday names but returns its short names.
          AllowedDays: schedule.AllowedDays.map((day) => day.slice(0, 3).toLowerCase()),
        },
      },
    });
  });
  await page.evaluate(() => {
    history.pushState(null, '', '/backup/42/schedule');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('app-schedule')).toBeVisible();
  return saves;
}

async function selectPreset(page: Page, name: string) {
  await page.locator('app-schedule sh-select').first().click();
  await page.locator('li.option').filter({ hasText: name }).getByText(name, { exact: true }).click();
}

async function saveSchedule(page: Page) {
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Backup settings saved.', { exact: true })).toBeVisible();
}

for (const { zone, time } of [
  { zone: 'America/New_York', time: '2026-09-06T12:20:00.000Z' },
  { zone: 'Asia/Tokyo', time: '2026-09-05T23:20:00.000Z' },
  { zone: 'UTC', time: '2026-09-06T08:20:00.000Z' },
]) {
  test.describe(zone, () => {
    test.use({ timezoneId: zone });
    test('loaded schedules keep their local calendar day and UTC instant after saving and reloading', async ({
      authenticatedPage: page,
    }) => {
      const initial = customSchedule(time);
      const saves = await openSchedule(page, initial);
      const schedule = page.locator('app-schedule');
      await expect(schedule.locator('sh-datepicker-input .masked-value')).toHaveText('Sep 6, 2026');
      await expect(schedule.locator('#time')).toHaveValue('08:20');
      await expect(schedule.locator('.schedule-summary')).toContainText('2026-09-06 at 08:20');
      await expect(schedule.locator('.schedule-summary')).toContainText('Monday and Friday');
      await saveSchedule(page);
      expect(saves).toEqual([initial]);

      await page.reload();
      await expect(schedule.locator('sh-datepicker-input .masked-value')).toHaveText('Sep 6, 2026');
      await expect(schedule.locator('#time')).toHaveValue('08:20');
      await expect(schedule.locator('#repeatValue')).toHaveValue('2');
      await expect(schedule.locator('sh-select').nth(1).locator('input')).toHaveValue('W');
      await expect(schedule.locator('sh-toggle').filter({ hasText: 'Monday' }).locator('input')).toBeChecked();
      await expect(schedule.locator('sh-toggle').filter({ hasText: 'Friday' }).locator('input')).toBeChecked();
      await expect(schedule.locator('sh-toggle').filter({ hasText: 'Tuesday' }).locator('input')).not.toBeChecked();
    });
  });
}

test.describe('Tokyo preset start dates', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });
  for (const { name, now, date, repeat, days } of [
    { name: 'Weekly monday 13:00', now: '2026-10-12T01:00:00Z', date: '2026-10-12', repeat: '1W', days: ['Monday'] },
    { name: 'Weekly monday 13:00', now: '2026-10-12T06:00:00Z', date: '2026-10-19', repeat: '1W', days: ['Monday'] },
    {
      name: 'Daily 13:00',
      now: '2026-10-20T06:00:00Z',
      date: '2026-10-21',
      repeat: '1D',
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    },
  ]) {
    test(`${name} picked at ${now} saves its next future start`, async ({ authenticatedPage: page }) => {
      await page.clock.setFixedTime(now);
      const saves = await openSchedule(page, customSchedule('2026-09-06T12:20:00.000Z'));
      await selectPreset(page, name);
      await selectPreset(page, 'Custom');
      const summary = page.locator('app-schedule .schedule-summary');
      await expect(summary).toContainText(`${date} at 13:00:00`);
      await expect(page.locator('app-schedule #time')).toHaveValue('13:00:00');
      await saveSchedule(page);
      expect(saves).toEqual([{ Time: `${date}T04:00:00.000Z`, Repeat: repeat, AllowedDays: days }]);

      await page.reload();
      await selectPreset(page, 'Custom');
      await expect(summary).toContainText(`${date} at 13:00`);
      await expect(page.locator('app-schedule #time')).toHaveValue('13:00');
    });
  }
});

test.describe('custom schedule editing', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('calendar, time, interval and allowed-day edits are serialized and survive a reload', async ({
    authenticatedPage: page,
  }) => {
    const saves = await openSchedule(page, customSchedule('2026-09-06T12:20:00.000Z'));
    const schedule = page.locator('app-schedule');
    await schedule.locator('sh-datepicker-input .masked-value').click();
    await page.getByRole('button', { name: 'Monday, September 7, 2026', exact: true }).click();
    await schedule.locator('#time').fill('10:45');
    await schedule.locator('#repeatValue').fill('3');
    await schedule.locator('sh-select').nth(1).click();
    await page.locator('li.option').getByText('Hours', { exact: true }).click();
    for (const day of ['Monday', 'Wednesday', 'Friday']) {
      await schedule.locator('sh-toggle').filter({ hasText: day }).click();
    }
    await expect(schedule.locator('sh-datepicker-input .masked-value')).toHaveText('Sep 7, 2026');
    await expect(schedule.locator('.schedule-summary')).toContainText('at 10:45');
    await expect(schedule.locator('.schedule-summary')).toContainText('Every 3 hours');
    await expect(schedule.locator('.schedule-summary')).toContainText('Wednesday');
    await saveSchedule(page);
    expect(saves).toEqual([{ Time: '2026-09-07T14:45:00.000Z', Repeat: '3h', AllowedDays: ['Wednesday'] }]);

    await page.reload();
    await expect(schedule.locator('sh-datepicker-input .masked-value')).toHaveText('Sep 7, 2026');
    await expect(schedule.locator('#time')).toHaveValue('10:45');
    await expect(schedule.locator('#repeatValue')).toHaveValue('3');
    await expect(schedule.locator('sh-select').nth(1).locator('input')).toHaveValue('h');
    await expect(schedule.locator('sh-toggle').filter({ hasText: 'Wednesday' }).locator('input')).toBeChecked();
    await expect(schedule.locator('sh-toggle').filter({ hasText: 'Monday' }).locator('input')).not.toBeChecked();
    await expect(schedule.locator('sh-toggle').filter({ hasText: 'Friday' }).locator('input')).not.toBeChecked();
  });

  test('turning off automatic runs saves a null schedule and remains off after reloading', async ({
    authenticatedPage: page,
  }) => {
    const saves = await openSchedule(page, customSchedule('2026-09-06T12:20:00.000Z'));
    const schedule = page.locator('app-schedule');
    await schedule.locator('sh-toggle').filter({ hasText: 'Automatically run backups' }).click();
    await expect(schedule.locator('#time')).toHaveCount(0);
    await expect(schedule.locator('.schedule-summary')).toContainText('Backups will not run automatically.');
    await saveSchedule(page);
    expect(saves).toEqual([null]);

    await page.reload();
    await expect(schedule.locator('sh-select').first().locator('input')).toHaveValue('disabled');
    await selectPreset(page, 'Custom');
    await expect(
      schedule.locator('sh-toggle').filter({ hasText: 'Automatically run backups' }).locator('input')
    ).not.toBeChecked();
    await expect(schedule.locator('#time')).toHaveCount(0);
    await expect(schedule.locator('.schedule-summary')).toContainText('Backups will not run automatically.');
  });
});
