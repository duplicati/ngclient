import { mkdir, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from './fixture';

const cases = [
  { name: 'spring-before', server: 'America/New_York', browser: 'America/New_York', time: '2027-03-13T13:20:00Z' },
  { name: 'spring-after', server: 'America/New_York', browser: 'Asia/Tokyo', time: '2027-03-14T12:20:00Z' },
  { name: 'fall-before', server: 'America/New_York', browser: 'Asia/Tokyo', time: '2027-11-06T12:20:00Z' },
  { name: 'fall-after', server: 'America/New_York', browser: 'America/New_York', time: '2027-11-07T13:20:00Z' },
  { name: 'utc-before', server: 'UTC', browser: 'America/New_York', time: '2027-03-13T08:20:00Z' },
  { name: 'utc-after', server: 'UTC', browser: 'America/New_York', time: '2027-03-14T08:20:00Z' },
];

for (const scenario of cases) {
  test.describe(scenario.name, () => {
    test.use({ timezoneId: scenario.browser });
    test('preserves the local editor day, UTC instant and actual LastRun through save and reload', async ({
      page,
      liveServer,
    }, testInfo) => {
      test.setTimeout(150_000);
      const { api, directory, password } = liveServer;
      const json = async (method: 'get' | 'post', url: string, data?: unknown) => {
        const response = await api[method](url, data === undefined ? {} : { data });
        expect(response.ok(), await response.text()).toBe(true);
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      };
      const info = await json('get', '/api/v1/systeminfo');
      const ids = (info.TimeZones as Array<{ ID: string }>).map((x) => x.ID);
      const serverZone =
        scenario.server === 'UTC'
          ? 'UTC'
          : ids.includes('America/New_York')
            ? 'America/New_York'
            : 'Eastern Standard Time';
      expect(ids).toContain(serverZone);
      const settings = await json('get', '/api/v1/serversettings');
      expect((await api.patch('/api/v1/serversettings', { data: { 'server-timezone': serverZone } })).ok()).toBe(true);
      expect((await json('get', '/api/v1/serversettings'))['server-timezone']).toBe(serverZone);
      const source = join(directory, scenario.name + '-source'),
        remote = join(directory, scenario.name + '-remote');
      await mkdir(source);
      await mkdir(remote);
      await writeFile(join(source, 'sample.txt'), 'An actual scheduled run establishes LastRun before editing.');
      await json('post', '/api/v1/serverstate/resume');
      const name = 'Schedule timezone ' + scenario.name;
      const { ID: id } = await json('post', '/api/v1/backups', {
        Backup: {
          Name: name,
          TargetURL: pathToFileURL(remote).href,
          Sources: [source + sep],
          Settings: [
            { Name: '--no-encryption', Value: 'true' },
            { Name: '--snapshot-policy', Value: 'off' },
          ],
          Filters: [],
          Tags: [],
          Metadata: {},
        },
        Schedule: {
          Time: new Date(Date.now() + 5000).toISOString(),
          Repeat: '1D',
          AllowedDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        },
      });
      expect(id).toBeTruthy();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        // Establish a real scheduler-written LastRun rather than asserting an unchanged zero.
        await expect
          .poll(
            async () => {
              const job = await json('get', `/api/v1/backup/${id}`);
              return (
                !!job.Backup.Metadata.LastBackupFinished && Date.parse(job.Schedule.LastRun) > Date.UTC(2020, 0, 1)
              );
            },
            { timeout: 90_000 }
          )
          .toBe(true);
        const job = await json('get', `/api/v1/backup/${id}`);
        const lastRun = job.Schedule.LastRun;
        const started = job.Backup.Metadata.LastBackupStarted;
        job.Schedule.Time = scenario.time;
        expect((await api.put(`/api/v1/backup/${id}`, { data: job })).ok()).toBe(true);
        const instant = new Date(scenario.time).toISOString();
        await expect
          .poll(
            async () => {
              const state = await json('get', '/api/v1/serverstate');
              const proposal = state.ProposedSchedule?.find(
                (x: { Item1: string }) => String(x.Item1) === String(id)
              )?.Item2;
              return proposal ? new Date(proposal).toISOString() : null;
            },
            { timeout: 20_000 }
          )
          .toBe(instant);
        await page.addInitScript(() =>
          localStorage.setItem('v1:duplicati:backupListShowActualTimes', JSON.stringify('actual'))
        );
        await page.goto('/login');
        await page.getByPlaceholder('Enter your password').fill(password);
        await page.getByRole('button', { name: 'Login', exact: true }).click();
        await expect(page).toHaveURL('/');
        const expectedDate = new Intl.DateTimeFormat('en-US', {
          timeZone: scenario.browser,
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }).format(new Date(instant));
        const expectedTime = new Intl.DateTimeFormat('en-GB', {
          timeZone: scenario.browser,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(new Date(instant));
        await page.goto(`/backup/${id}/schedule`);
        await expect(page.locator('app-schedule #time')).toHaveValue(expectedTime);
        await expect(page.locator('app-schedule sh-datepicker-input .masked-value')).toHaveText(expectedDate);
        const save = async () => {
          const pending = page.waitForResponse(
            (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/v1/backup/${id}`
          );
          await page.getByRole('button', { name: 'Save changes', exact: true }).click();
          const response = await pending;
          expect(response.ok()).toBe(true);
          expect(new Date(response.request().postDataJSON().Schedule.Time).toISOString()).toBe(instant);
          const stored = await json('get', `/api/v1/backup/${id}`);
          expect(new Date(stored.Schedule.Time).toISOString()).toBe(instant);
          expect(stored.Schedule.LastRun).toBe(lastRun);
          expect(stored.Backup.Metadata.LastBackupStarted).toBe(started);
        };
        await save();
        await page.reload();
        await expect(page.locator('app-schedule #time')).toHaveValue(expectedTime);
        await expect(page.locator('app-schedule sh-datepicker-input .masked-value')).toHaveText(expectedDate);
        await page.getByRole('link', { name: 'Options', exact: true }).click();
        await save();
        await page.getByRole('link', { name: 'General', exact: true }).click();
        await page.getByPlaceholder('Your backup description').fill('Edited without backdating the schedule');
        await save();
        await page.goto('/');
        const parts = Object.fromEntries(
          new Intl.DateTimeFormat('en-US', {
            timeZone: scenario.browser,
            year: '2-digit',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
            .formatToParts(new Date(instant))
            .map((x) => [x.type, x.value])
        );
        const expectedHome = `${parts.month}/${parts.day}/${parts.year}, ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
        const row = page.locator('.backups .backup').filter({ hasText: name });
        const next = row
          .locator('p')
          .filter({ has: page.getByText('Next scheduled run:', { exact: true }) })
          .locator('.time-value');
        await expect(next).toHaveText(expectedHome);
        expect(errors).toEqual([]);
        const evidence = testInfo.outputPath('schedule-results.json');
        await writeFile(
          evidence,
          JSON.stringify(
            {
              scenario,
              serverZone,
              serverSystemZone: info.ServerTimeZone,
              expectedDate,
              expectedTime,
              expectedHome,
              storedTime: instant,
              schedulerWrittenLastRun: lastRun,
              lastBackupStarted: started,
              runtime: info.CLRVersion,
              errors,
            },
            null,
            2
          )
        );
        await testInfo.attach('schedule-results', { path: evidence, contentType: 'application/json' });
      } finally {
        expect(
          (
            await api.delete(`/api/v1/backup/${id}`, {
              params: { 'delete-local-db': 'false', 'delete-remote-files': 'false' },
            })
          ).ok()
        ).toBe(true);
        expect(
          (
            await api.patch('/api/v1/serversettings', {
              data: { 'server-timezone': settings['server-timezone'] ?? '' },
            })
          ).ok()
        ).toBe(true);
      }
    });
  });
}
