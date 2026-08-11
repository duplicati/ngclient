import { CUSTOM_ELEMENTS_SCHEMA, Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
        imports: [SingleDestinationStub],
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
});
