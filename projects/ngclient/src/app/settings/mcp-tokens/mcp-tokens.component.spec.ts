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
  const post = vi.fn(() => of({ Data: { Token: { Name: 'Agent' }, AccessToken: 'fixture-token' } }));
  TestBed.configureTestingModule({
    providers: [
      { provide: DuplicatiServer, useValue: { getApiV2McpTokens: () => of({ Data: [] }), postApiV2McpTokens: post } },
      { provide: BackupsState, useValue: { backups: signal([]), getBackups: () => {} } },
      { provide: SysinfoState, useValue: { systemInfo: signal(null) } },
      { provide: ShipDialogService, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(McpTokensComponent);
  fixture.componentInstance.openForm();
  fixture.componentInstance.selectLevel('Restore');
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  for (const [selector, value] of [
    ['#mcpTokenName', ' Agent '],
    ['#mcpTokenRestoreRoots', '/tmp/a\n/tmp/b'],
  ]) {
    const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  fixture.componentInstance.create();
  expect(post).toHaveBeenCalledWith({
    body: expect.objectContaining({ Name: 'Agent', Level: 'Restore', RestoreRoots: ['/tmp/a', '/tmp/b'] }),
  });
});
