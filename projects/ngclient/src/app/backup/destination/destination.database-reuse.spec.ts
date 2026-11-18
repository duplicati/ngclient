import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, GetDbPathDto } from '../../core/openapi';
import { ConnectionStringsState } from '../../core/states/connection-strings.state';
import { BackupState } from '../backup.state';
import DestinationComponent from './destination.component';

describe('new destination database reuse', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(response: Observable<GetDbPathDto> = of({ Exists: true, Path: '/existing.sqlite' })) {
    const targetUrls = signal([
      { uiKey: 'one', url: 'file:///backup', connectionStringId: null, urlKey: null, save: false },
    ]);
    const reusedDatabase = signal<{ url: string; path: string } | null>(null);
    const lookup = vi.fn(() => response),
      navigate = vi.fn();
    const isNew = signal(true);
    const isSyncMode = signal(false);
    TestBed.configureTestingModule({
      imports: [DestinationComponent],
      providers: [
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
        { provide: DuplicatiServer, useValue: { postApiV1RemoteoperationDbpath: lookup } },
        {
          provide: BackupState,
          useValue: {
            targetUrls,
            reusedDatabase,
            isNew,
            isSyncMode,
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
    }).overrideComponent(DestinationComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(DestinationComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as DestinationComponent & {
      chooseDatabase(reuse: boolean): void;
      cancelDatabaseChoice(): void;
    };
    return { component, lookup, navigate, targetUrls, reusedDatabase, isNew, isSyncMode };
  }

  it('does not offer a versioned backup database to a Sync job', async () => {
    const { component, isSyncMode, lookup, navigate } = setup();
    isSyncMode.set(true);
    await component.next();
    expect(lookup).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledOnce();
  });

  it.each([true, false])('waits for the user to choose reuse=%s before continuing', async (reuse) => {
    const { component, lookup, navigate, reusedDatabase } = setup();
    await component.next();
    expect(lookup).toHaveBeenCalledWith({ body: { path: 'file:///backup' } });
    expect(navigate).not.toHaveBeenCalled();
    component.chooseDatabase(reuse);
    expect(reusedDatabase()).toEqual(reuse ? { url: 'file:///backup', path: '/existing.sqlite' } : null);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('does not navigate when a lookup fails or a destination changes while waiting', async () => {
    const failed = setup(throwError(() => new Error('lookup failed')));
    await failed.component.next();
    expect(failed.navigate).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const pending = new Subject<GetDbPathDto>();
    const next = setup(pending);
    const advancing = next.component.next();
    next.targetUrls.update((urls) => urls.map((url) => ({ ...url, url: 'file:///other' })));
    pending.next({ Exists: true, Path: '/old.sqlite' });
    pending.complete();
    await advancing;
    expect(next.navigate).not.toHaveBeenCalled();
    expect(next.reusedDatabase()).toBeNull();
  });

  it('continues without a prompt when no database exists and skips lookup for edits', async () => {
    const { component, lookup, navigate, isNew } = setup(of({ Exists: false }));
    await component.next();
    expect(navigate).toHaveBeenCalledOnce();
    isNew.set(false);
    await component.next();
    expect(lookup).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});
