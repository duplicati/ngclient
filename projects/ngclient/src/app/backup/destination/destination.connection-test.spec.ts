import { Subject } from 'rxjs';
import Destinations from '../../destinations/destinations';
import { BackupsState } from '../../core/states/backups.state';
import { TestDestinationResult } from '../../core/services/test-destination.service';
import ImportDestinationComponent from '../import-destination/destination/destination.component';
import { ImportDestinationState } from '../import-destination/import-destination.state';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { TestDestinationService } from '../../core/services/test-destination.service';
import { ConnectionStringsState } from '../../core/states/connection-strings.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupState } from '../backup.state';
import { TestUrl } from '../source-data/target-url-dialog/test-url/test-url';
import DestinationComponent from './destination.component';

describe('new backup destination connection testing', () => {
  afterEach(() => TestBed.resetTestingModule());

  it.each(['success', 'cancel', 'failure', 'url-change'] as const)(
    'shares the Create folder request with Continue and handles %s',
    async (ending) => {
      const requests: { body: { AutoCreate?: boolean } }[] = [];
      let finishCreate!: (result: { Success: boolean }) => void;
      const post = vi.fn((request: { body: { AutoCreate?: boolean } }) => {
        requests.push(request);
        if (!request.body.AutoCreate) return Promise.reject({ error: { body: { StatusCode: 'missing-folder' } } });
        return new Promise<{ Success: boolean }>((resolve) => {
          finishCreate = resolve;
        });
      });
      const open = vi.fn((_component: unknown, _options: { closed: (confirmed: boolean) => void }) => {});
      const navigate = vi.fn().mockResolvedValue(true);
      const targetUrls = signal([
        { uiKey: 'one', url: 'file://C:/missing', connectionStringId: null, urlKey: null, save: false },
      ]);
      TestBed.configureTestingModule({
        imports: [DestinationComponent],
        providers: [
          TestDestinationService,
          { provide: Router, useValue: { navigate } },
          { provide: ActivatedRoute, useValue: { parent: {} } },
          { provide: ShipDialogService, useValue: { open } },
          { provide: DuplicatiServer, useValue: { postApiV2DestinationTest: post } },
          { provide: SysinfoState, useValue: { hasV2TestOperations: () => true } },
          {
            provide: BackupState,
            useValue: {
              targetUrls,
              isNew: signal(true),
              backupId: signal('new'),
              isConnectionStringSaved: signal(false),
              shouldAutoSave: () => false,
            },
          },
          {
            provide: ConnectionStringsState,
            useValue: { destinations: signal([]), resourceDestinations: { isLoading: signal(false) } },
          },
        ],
      });
      TestBed.overrideComponent(DestinationComponent, {
        set: {
          imports: [TestUrl],
          template: `
        <app-test-url #testUrl [targetUrl]="targetUrlModel()" [testSignal]="testStates()[0] || null"
          (testSignalChange)="updateTestState(0, $event)" [backupId]="'new'" [sourcePrefix]="null"
          [suppressErrorDialogs]="false" [askToCreate]="true" [readOnlyTest]="false"
          [testExpectation]="'destinationEmpty'" [moduleType]="'Backend'" />
        <button (click)="next()">Continue</button>
      `,
        },
      });
      const fixture = TestBed.createComponent(DestinationComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const child = component.testUrlComponents()[0];
      const manual = child.testDestination(false)!;
      await fixture.whenStable();
      expect(open).toHaveBeenCalledTimes(1);
      if (ending !== 'cancel') open.mock.calls[0][1].closed(true);
      const continuing = component.next();
      const repeated = component.next();
      expect(requests.map((x) => x.body.AutoCreate)).toEqual(ending === 'cancel' ? [false] : [false, true]);
      expect(navigate).not.toHaveBeenCalled();
      if (ending === 'cancel') open.mock.calls[0][1].closed(false);
      else if (ending === 'url-change') {
        targetUrls.update((urls) => urls.map((x) => ({ ...x, url: 'file://C:/other' })));
        fixture.detectChanges();
        finishCreate({ Success: true });
      } else {
        finishCreate({ Success: ending === 'success' });
        await fixture.whenStable();
        if (ending === 'failure') open.mock.calls[1][1].closed(true);
      }
      await Promise.all([manual, continuing, repeated]);
      expect(requests.map((x) => x.body.AutoCreate)).toEqual(ending === 'cancel' ? [false] : [false, true]);
      if (ending === 'success') expect(navigate).toHaveBeenCalledExactlyOnceWith(['schedule'], { relativeTo: {} });
      else expect(navigate).not.toHaveBeenCalled();
      expect(child.testSignal()).not.toBe('testing');
    }
  );
});

describe('other destination connection test entry points', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does not prompt or navigate from import while its test is running', () => {
    const open = vi.fn();
    const navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [ImportDestinationComponent],
      providers: [
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
        { provide: ShipDialogService, useValue: { open } },
        {
          provide: ImportDestinationState,
          useValue: {
            destinationTestSignal: signal('testing'),
            destinationTargetUrl: signal('file://C:/backup'),
          },
        },
      ],
    });
    TestBed.overrideComponent(ImportDestinationComponent, { set: { template: '', imports: [], providers: [] } });
    const fixture = TestBed.createComponent(ImportDestinationComponent);
    fixture.componentInstance.next();
    expect(open).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shares a saved destination test when its test button is invoked twice', async () => {
    const request = new Subject<TestDestinationResult>();
    const testDestination = vi.fn(() => request.asObservable());
    TestBed.configureTestingModule({
      imports: [Destinations],
      providers: [
        { provide: BackupsState, useValue: { backups: signal([]), getBackups: vi.fn() } },
        {
          provide: ConnectionStringsState,
          useValue: {
            isSaving: signal(false),
            destinations: signal([]),
            resourceDestinations: { isLoading: signal(false) },
          },
        },
        { provide: ShipDialogService, useValue: { open: vi.fn() } },
        { provide: TestDestinationService, useValue: { testDestination } },
      ],
    });
    TestBed.overrideComponent(Destinations, {
      set: {
        imports: [TestUrl],
        template: `<app-test-url [targetUrl]="editBaseUrl()" [(testSignal)]="testSignal" [backupId]="null" [sourcePrefix]="null" [suppressErrorDialogs]="true" [askToCreate]="false" [readOnlyTest]="false" [testExpectation]="'any'" [moduleType]="'Backend'" />`,
      },
    });
    const fixture = TestBed.createComponent(Destinations);
    fixture.componentInstance.editBaseUrl.set('file://C:/backup');
    fixture.detectChanges();
    const first = fixture.componentInstance.testDestination();
    const second = fixture.componentInstance.testDestination();
    expect(testDestination).toHaveBeenCalledTimes(1);
    request.next({ action: 'success', targetUrl: 'file://C:/backup', testAgain: false, destinationIndex: 0 });
    request.complete();
    await Promise.all([first, second]);
    expect(fixture.componentInstance.testSignal()).toMatchObject({ action: 'success' });
  });
});
