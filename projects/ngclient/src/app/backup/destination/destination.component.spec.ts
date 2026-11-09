import { CUSTOM_ELEMENTS_SCHEMA, Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionStringsState } from '../../core/states/connection-strings.state';
import { BackupState, BackupTargetUrl } from '../backup.state';
import { TestState } from '../source-data/target-url-dialog/test-url/test-url';
import DestinationComponent from './destination.component';

@Component({
  selector: 'app-single-destination',
  template: '',
})
class SingleDestinationStub {
  targetUrl = input.required<string | null>();
  targetUrlChange = output<string | null>();
  useBackupState = input(false);
}

describe('DestinationComponent destination identity', () => {
  let fixture: ComponentFixture<DestinationComponent>;
  let component: DestinationComponent;
  let targetUrls: ReturnType<typeof signal<BackupTargetUrl[]>>;

  const localTarget: BackupTargetUrl = {
    uiKey: 'local-target',
    url: 'file://C:/backup',
    connectionStringId: null,
    urlKey: null,
    save: false,
  };
  const webdavTarget: BackupTargetUrl = {
    uiKey: 'webdav-target',
    url: 'webdav://example.com/backup',
    connectionStringId: null,
    urlKey: 'secondary',
    save: false,
  };

  beforeEach(() => {
    targetUrls = signal([localTarget, webdavTarget]);

    const backupState = {
      targetUrls,
      isConnectionStringSaved: signal(false),
      isNew: signal(false),
      backupId: signal('backup-id'),
      removeTargetUrl: vi.fn((index: number) => {
        targetUrls.update((targets) => targets.filter((_, targetIndex) => targetIndex !== index));
      }),
      updateTargetUrl: vi.fn((index: number, url: string, connectionStringId: number | null, urlKey: string | null) => {
        targetUrls.update((targets) =>
          targets.map((target, targetIndex) =>
            targetIndex === index ? { ...target, url, connectionStringId, urlKey } : target
          )
        );
      }),
      updateTargetSynchronization: vi.fn((index: number, changes: Partial<BackupTargetUrl>) => {
        targetUrls.update((targets) => targets.map((target, i) => (i === index ? { ...target, ...changes } : target)));
      }),
    };

    TestBed.configureTestingModule({
      imports: [DestinationComponent],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
        { provide: BackupState, useValue: backupState },
        {
          provide: ConnectionStringsState,
          useValue: {
            destinations: signal([]),
            resourceDestinations: { isLoading: signal(false) },
          },
        },
      ],
    });

    TestBed.overrideComponent(DestinationComponent, {
      set: {
        imports: [SingleDestinationStub, FormsModule, ShipSelect],
        schemas: [CUSTOM_ELEMENTS_SCHEMA],
      },
    });

    fixture = TestBed.createComponent(DestinationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('keeps the WebDAV editor instance when the preceding local destination is removed', () => {
    const editorsBefore = fixture.debugElement.queryAll(By.directive(SingleDestinationStub));
    const webdavEditor = editorsBefore[1].componentInstance as SingleDestinationStub;
    const localTestState = { action: 'success' } as TestState;
    component.testStates.set([localTestState, null]);

    component.removeDestination(0);
    fixture.detectChanges();

    const editorsAfter = fixture.debugElement.queryAll(By.directive(SingleDestinationStub));
    expect(editorsAfter).toHaveLength(1);
    expect(editorsAfter[0].componentInstance).toBe(webdavEditor);
    expect(webdavEditor.targetUrl()).toBe('webdav://example.com/backup');
    expect(component.testStates()).toEqual([null]);
  });

  it('keeps the editor instance when its URL changes', () => {
    const webdavEditor = fixture.debugElement.queryAll(By.directive(SingleDestinationStub))[1]
      .componentInstance as SingleDestinationStub;

    component.updateTargetUrl(1, 'webdav://example.com/updated');
    fixture.detectChanges();

    const updatedEditor = fixture.debugElement.queryAll(By.directive(SingleDestinationStub))[1]
      .componentInstance as SingleDestinationStub;
    expect(updatedEditor).toBe(webdavEditor);
    expect(updatedEditor.targetUrl()).toBe('webdav://example.com/updated');
    expect(targetUrls()[1].uiKey).toBe('webdav-target');
  });

  it('shows synchronization controls only for secondary destinations', () => {
    expect(fixture.nativeElement.querySelectorAll('.secondary-sync')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.secondary-sync').textContent).toContain('Synchronization mode');
    component.removeDestination(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.secondary-sync')).toHaveLength(0);
  });

  it('edits synchronization independently of URL and preserves unknown options and inactive parameters', () => {
    targetUrls.update((targets) =>
      targets.map((target, i) =>
        i === 1 ? { ...target, options: { Count: 3, future: true }, interval: '2D' } : target
      )
    );
    component.updateSynchronizationMode(1, 'counting');
    expect(component.synchronizationCount(targetUrls()[1])).toBe(3);
    component.updateSynchronizationCount(1, 5);
    component.updateSynchronizationMode(1, 'interval');
    component.updateSynchronizationInterval(1, '12h');
    expect(targetUrls()[1]).toMatchObject({
      url: webdavTarget.url,
      uiKey: webdavTarget.uiKey,
      mode: 'interval',
      interval: '12h',
      options: { count: 5, future: true },
    });
    expect(targetUrls()[1].options).not.toHaveProperty('Count');
    expect(webdavTarget.options).toBeUndefined();
  });

  it('supplies usable defaults when changing a new secondary mode', () => {
    component.updateSynchronizationMode(1, 'interval');
    expect(targetUrls()[1].interval).toBe('1D');
    component.updateSynchronizationMode(1, 'counting');
    expect(component.synchronizationCount(targetUrls()[1])).toBe(2);
    expect(component.hasInvalidSynchronization()).toBe(false);
  });

  it('keeps an unrecognized saved mode visible instead of replacing it', async () => {
    const target = { ...webdavTarget, mode: 'future-mode' };
    targetUrls.set([localTarget, target]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.synchronizationModes(target)).toContainEqual(expect.objectContaining({ value: 'future-mode' }));
    expect(targetUrls()[1].mode).toBe('future-mode');
    const select = fixture.debugElement.query(By.directive(ShipSelect)).componentInstance as ShipSelect;
    expect(select.selectedOptions()).toEqual([expect.objectContaining({ value: 'future-mode' })]);
  });

  it('does not continue while synchronization parameters are invalid', async () => {
    component.updateSynchronizationMode(1, 'counting');
    component.updateSynchronizationCount(1, 0);
    expect(component.hasInvalidSynchronization()).toBe(true);
    await component.next();
    expect(TestBed.inject(Router).navigate).not.toHaveBeenCalled();
  });
});
