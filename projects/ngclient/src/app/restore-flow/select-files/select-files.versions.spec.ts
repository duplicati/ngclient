import { DecimalPipe } from '@angular/common';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { Subject } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { ServerStateService } from '../../core/services/server-state.service';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';
import SelectFilesComponent, { createRestoreSelectFilesForm } from './select-files.component';

type VersionOption = RestoreFlowState['versionOptions'] extends () => (infer T)[] ? T : never;

describe('restore version list', () => {
  let fixture: ComponentFixture<SelectFilesComponent>;
  const pending: Subject<unknown>[] = [];

  beforeAll(() => {
    // jsdom has no popover API
    (HTMLElement.prototype as any).showPopover ??= function () {};
    (HTMLElement.prototype as any).hidePopover ??= function () {};
  });

  afterEach(() => {
    fixture?.destroy();
    pending.splice(0).forEach((request) => request.complete());
    TestBed.resetTestingModule();
  });

  async function render(versionOptions: VersionOption[]) {
    const form = createRestoreSelectFilesForm();
    const flow = {
      selectFilesForm: form,
      selectFilesFormSignal: signal(form.getRawValue()),
      selectOption: signal<string | null>(null),
      backupId: signal('42'),
      versionOptionsLoading: signal(false),
      waitingForBackup: signal(false),
      versionOptions: signal(versionOptions),
      isFileRestore: signal(true),
      extendedDataType: signal<string | null>(null),
      backup: signal({ Backup: { IsTemporary: false } }),
    };
    const listFolder = vi.fn(() => {
      const request = new Subject<unknown>();
      pending.push(request);
      return request.asObservable();
    });
    TestBed.configureTestingModule({
      imports: [SelectFilesComponent],
      providers: [
        DecimalPipe,
        { provide: RestoreFlowState, useValue: flow },
        { provide: DuplicatiServer, useValue: { postApiV2BackupListFolder: listFolder } },
        { provide: ServerStateService, useValue: {} },
        { provide: ShipDialogService, useValue: {} },
        { provide: SysinfoState, useValue: { hasV2ListOperations: () => true } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    });
    fixture = TestBed.createComponent(SelectFilesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const select = fixture.debugElement.query((d) => d.componentInstance instanceof ShipSelect)
      .componentInstance as ShipSelect;
    select.open();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('.ship-options .custom-option')].map((x) =>
      (x.textContent ?? '').replace(/\s+/g, ' ').trim()
    );
  }

  it('shows the file count and size of each version', async () => {
    const options = await render([
      { Version: 0, Time: '2026-10-01T12:00:00Z', FileCount: 1234, FileSizes: 3 * 1024 * 1024 },
      { Version: 1, Time: '2026-09-24T12:00:00Z', FileCount: 1, FileSizes: 3 * 1024 * 1024 },
      { Version: 2, Time: '2026-09-17T12:00:00Z', FileCount: 0, FileSizes: 0 },
    ]);

    expect(options).toHaveLength(3);
    expect(options[0]).toMatch(/^0: .+ \(3\.15 MB, 1,234 files\)$/);
    expect(options[1]).toMatch(/^1: .+ \(3\.15 MB, 1 file\)$/);
    expect(options[2]).toMatch(/^2: .+ \(0 files\)$/);
  });

  it('shows only the size when the server sends no file count', async () => {
    const options = await render([{ Version: 0, Time: '2026-10-01T12:00:00Z', FileSizes: 3 * 1024 * 1024 }]);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatch(/^0: .+ \(3\.15 MB\)$/);
    expect(options[0]).not.toContain('file');
  });
});
