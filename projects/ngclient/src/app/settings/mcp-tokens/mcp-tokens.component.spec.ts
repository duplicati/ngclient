import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { McpTokensComponent } from './mcp-tokens.component';

it('submits the token name and restore paths entered in the form', async () => {
  HTMLElement.prototype.showPopover ??= vi.fn();
  HTMLElement.prototype.hidePopover ??= vi.fn();
  const post = vi.fn(() => of({ Data: { Token: { Name: 'Agent' }, AccessToken: 'fixture-token' } }));
  TestBed.configureTestingModule({
    providers: [
      { provide: DuplicatiServer, useValue: { getApiV2McpTokens: () => of({ Data: [] }), postApiV2McpTokens: post } },
      {
        provide: BackupsState,
        useValue: { backups: signal([{ Backup: { ID: '42', Name: 'Documents' } }]), getBackups: () => {} },
      },
      { provide: SysinfoState, useValue: { systemInfo: signal(null) } },
      { provide: ShipDialogService, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(McpTokensComponent);
  fixture.componentInstance.openForm();
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const [level, lifetime] = root.querySelectorAll<HTMLElement>('sh-select');
  for (const [select, label, value] of [
    [level, 'Backup:', 'Backup'],
    [level, 'Restore:', 'Restore'],
    [lifetime, '1 day', '1D'],
  ] as const) {
    select.querySelector<HTMLElement>('sh-form-field')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    Array.from(select.querySelectorAll<HTMLElement>('li.option'))
      .find((option) => option.textContent.trim().startsWith(label))!
      .click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select.querySelector('input')?.value).toBe(value);
  }
  for (const [selector, value] of [
    ['#mcpTokenName', ' Agent '],
    ['#mcpTokenRestoreRoots', '/tmp/a\n/tmp/b'],
  ]) {
    const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  root.querySelector<HTMLInputElement>('#mcp-all-backups')!.click();
  fixture.detectChanges();
  root.querySelector<HTMLInputElement>('.backup-list input:not(.internal-input)')!.click();
  fixture.componentInstance.create();
  expect(post).toHaveBeenCalledWith({
    body: expect.objectContaining({
      Name: 'Agent',
      Level: 'Restore',
      ExpiresIn: '1D',
      BackupIds: ['42'],
      RestoreRoots: ['/tmp/a', '/tmp/b'],
    }),
  });

  HTMLElement.prototype.showPopover ??= vi.fn();
  HTMLElement.prototype.hidePopover ??= vi.fn();
  fixture.componentInstance.copied.set(true);
  fixture.detectChanges();
  await fixture.whenStable();
  const agent = root.querySelector<HTMLElement>('.created-token sh-select')!;
  agent.querySelector<HTMLElement>('sh-form-field')!.click();
  fixture.detectChanges();
  await fixture.whenStable();
  Array.from(agent.querySelectorAll<HTMLElement>('li.option'))
    .find((option) => option.textContent.trim() === 'Codex CLI')!
    .click();
  fixture.detectChanges();
  await fixture.whenStable();
  expect(agent.querySelector('input')?.value).toBe('codex');
  expect(root.querySelector('.created-token code')?.textContent).toContain('[mcp_servers.duplicati]');
  expect(fixture.componentInstance.copied()).toBe(false);
});
