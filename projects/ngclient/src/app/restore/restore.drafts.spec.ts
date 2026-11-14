import { Component, signal } from '@angular/core';
import { DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { DuplicatiServer, SystemInfoDto, TemporaryBackupDto } from '../core/openapi';
import { BackupsState } from '../core/states/backups.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import RestoreComponent from './restore.component';

@Component({ selector: 'app-status-bar', template: '' })
class StatusBarStub {}

const STORAGE_KEY = 'v1:duplicati:restoreDrafts';
const storedIds = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');

describe('Restore page lists unfinished direct restores', () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem(STORAGE_KEY);
  });

  async function setup(ids: string[], temporaryBackups: TemporaryBackupDto[], hasList = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    const listTemporary = vi.fn(() => Promise.resolve(temporaryBackups));
    TestBed.configureTestingModule({
      imports: [RestoreComponent],
      providers: [
        provideRouter([]),
        {
          provide: BackupsState,
          useValue: { backups: signal([]), backupsLoading: signal(false), getBackups: vi.fn() },
        },
        { provide: DuplicatiServer, useValue: { getApiV1BackupsTemporary: listTemporary } },
      ],
    }).overrideComponent(RestoreComponent, {
      remove: { imports: [StatusBarComponent] },
      add: { imports: [StatusBarStub] },
    });
    await TestBed.compileComponents();
    TestBed.inject(SysinfoState).systemInfo.set({
      APIExtensions: hasList ? ['v1:backups:temporary'] : [],
    } as SystemInfoDto);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RestoreComponent);
    fixture.detectChanges();
    const blocks = await fixture.getDeferBlocks();
    await blocks[0].render(DeferBlockState.Complete);
    await fixture.whenStable();
    fixture.detectChanges();
    const cards = () => [...fixture.nativeElement.querySelectorAll('sh-card.restore-draft')] as HTMLElement[];
    return { fixture, listTemporary, navigate, cards };
  }

  it('shows the remembered drafts the server still has, newest first, and forgets the rest', async () => {
    const { listTemporary, cards } = await setup(
      ['older', 'gone', 'newer'],
      [
        { ID: 'older', Name: '', TargetURL: 'file:///archive?auth-password=***************' },
        { ID: 'newer', Name: 'Imported job', TargetURL: 'ssh://host/backup' },
        { ID: 'copy-made-on-submit', Name: 'Imported job', TargetURL: 'ssh://host/backup' },
      ]
    );

    expect(listTemporary).toHaveBeenCalledOnce();
    expect(cards().map((x) => x.querySelector('h3')!.textContent!.trim())).toEqual([
      'Imported job',
      'file:///archive?auth-password=***************',
    ]);
    expect(cards()[0].textContent).toContain('ssh://host/backup');
    expect(storedIds()).toEqual(['older', 'newer']);
  });

  it('continues the restore of the chosen draft', async () => {
    const { cards, navigate } = await setup(['draft-1'], [{ ID: 'draft-1', Name: 'Job', TargetURL: 'file:///x' }]);

    cards()[0].click();

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate.mock.calls[0][0].toString()).toBe('/restore-draft/draft-1');
  });

  it('dismisses a draft without opening it', async () => {
    const { fixture, cards, navigate } = await setup(
      ['draft-1', 'draft-2'],
      [
        { ID: 'draft-1', Name: 'First', TargetURL: 'file:///a' },
        { ID: 'draft-2', Name: 'Second', TargetURL: 'file:///b' },
      ]
    );

    (cards()[0].querySelector('[aria-label="Dismiss"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(cards().map((x) => x.querySelector('h3')!.textContent!.trim())).toEqual(['First']);
    expect(storedIds()).toEqual(['draft-1']);
  });

  it('does not ask a server without the temporary backup list', async () => {
    const { listTemporary, cards } = await setup(['draft-1'], [], false);

    expect(listTemporary).not.toHaveBeenCalled();
    expect(cards()).toHaveLength(0);
    expect(storedIds()).toEqual(['draft-1']);
  });
});
