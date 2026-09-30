import { CUSTOM_ELEMENTS_SCHEMA, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleWorkspaceCounts, Office365Counts, WebModulesService } from '../../core/services/webmodules.service';
import { GoogleWorkspaceCountsDialog } from './googleworkspace-counts-dialog/googleworkspace-counts-dialog';
import { Office365CountsDialog } from './office365-counts-dialog/office365-counts-dialog';

type Counts = Office365Counts | GoogleWorkspaceCounts;
type CountsDialog = Office365CountsDialog | GoogleWorkspaceCountsDialog;
type DialogData = { url: string; sourcePrefix: string; backupId: string | null };

const officeCounts: Office365Counts = {
  users: { total: 17, licensed: 8, unlicensed: 4, sharedMailboxWithStorage: 3, sharedMailboxWithoutStorage: 2 },
  groups: { total: 13, unified: 7, notUnified: 6 },
  sites: {
    total: 29,
    group: 9,
    classic: 5,
    communication: 4,
    personal: 8,
    other: 3,
    personalLicensedUser: 6,
    personalUnlicensedUser: 2,
  },
};

const googleCounts: GoogleWorkspaceCounts = {
  users: { total: 15, active: 9, suspended: 4, archived: 2 },
  groups: { total: 7 },
  sharedDrives: { total: 6 },
  sites: { total: 3 },
};

const dialogs: {
  name: string;
  type: Type<CountsDialog>;
  method: 'getOffice365Counts' | 'getGoogleWorkspaceCounts';
  url: string;
  counts: Counts;
  zeroCounts: Counts;
  rows: Record<string, Record<string, string>>;
}[] = [
  {
    name: 'Microsoft 365',
    type: Office365CountsDialog,
    method: 'getOffice365Counts',
    url: 'office365://tenant',
    counts: officeCounts,
    zeroCounts: {
      users: { total: 0, licensed: 0, unlicensed: 0, sharedMailboxWithStorage: 0, sharedMailboxWithoutStorage: 0 },
      groups: { total: 0, unified: 0, notUnified: 0 },
      sites: {
        total: 0,
        group: 0,
        classic: 0,
        communication: 0,
        personal: 0,
        other: 0,
        personalLicensedUser: 0,
        personalUnlicensedUser: 0,
      },
    },
    rows: {
      Users: {
        Licensed: '8',
        Unlicensed: '4',
        'Shared mailbox (with storage)': '3',
        'Shared mailbox (without storage)': '2',
        Total: '17',
      },
      Groups: { Unified: '7', 'Not unified': '6', Total: '13' },
      Sites: {
        Group: '9',
        Classic: '5',
        Communication: '4',
        Personal: '8',
        '— Licensed users': '6',
        '— Unlicensed users': '2',
        Other: '3',
        Total: '29',
      },
    },
  },
  {
    name: 'Google Workspace',
    type: GoogleWorkspaceCountsDialog,
    method: 'getGoogleWorkspaceCounts',
    url: 'googleworkspace://tenant',
    counts: googleCounts,
    zeroCounts: {
      users: { total: 0, active: 0, suspended: 0, archived: 0 },
      groups: { total: 0 },
      sharedDrives: { total: 0 },
      sites: { total: 0 },
    },
    rows: {
      Users: { Active: '9', Suspended: '4', Archived: '2', Total: '15' },
      Groups: { Total: '7' },
      'Shared drives': { Total: '6' },
      Sites: { Total: '3' },
    },
  },
];

describe.each(dialogs)('$name counts dialog', (dialog) => {
  let fixture: ComponentFixture<CountsDialog>;
  let response: Subject<Counts>;

  afterEach(() => {
    response?.complete();
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  function setup(data: DialogData | null = { url: dialog.url, sourcePrefix: 'source-1', backupId: 'backup-42' }) {
    response = new Subject<Counts>();
    const server = {
      getOffice365Counts: vi.fn(() => response.asObservable()),
      getGoogleWorkspaceCounts: vi.fn(() => response.asObservable()),
    };
    TestBed.configureTestingModule({
      imports: [dialog.type],
      providers: [{ provide: WebModulesService, useValue: server }],
    });
    // Keep the real template, while excluding Ship UI's icon/button implementation.
    TestBed.overrideComponent(dialog.type, { set: { imports: [], schemas: [CUSTOM_ELEMENTS_SCHEMA] } });
    fixture = TestBed.createComponent<CountsDialog>(dialog.type);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    return { component: fixture.componentInstance, server, element: fixture.nativeElement as HTMLElement };
  }

  function renderedRows() {
    const groups = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.counts .group'));
    return Object.fromEntries(
      groups.map((group) => [
        group.querySelector('h4')!.textContent!.trim(),
        Object.fromEntries(
          Array.from(group.querySelectorAll('dl > div')).map((row) => [
            row.querySelector('dt')!.textContent!.replace(/\s+/g, ' ').trim(),
            row.querySelector('dd')!.textContent!.trim(),
          ])
        ),
      ])
    );
  }

  it.each(['backup-42', null])('passes backup ID %s and waits for the selected provider', (backupId) => {
    const { component, server, element } = setup({ url: dialog.url, sourcePrefix: 'source-1', backupId });
    expect(server[dialog.method]).toHaveBeenCalledExactlyOnceWith(dialog.url, 'source-1', backupId);
    const otherMethod = dialog.method === 'getOffice365Counts' ? 'getGoogleWorkspaceCounts' : 'getOffice365Counts';
    expect(server[otherMethod]).not.toHaveBeenCalled();
    expect(component.status()).toBe('loading');
    expect(component.counts()).toBeNull();
    expect(element.querySelector('.loading')?.textContent).toContain('Loading counts');
    expect(element.querySelector('.counts')).toBeNull();
    expect(element.querySelector('.error')).toBeNull();
  });

  it('renders each returned count under its matching category', () => {
    const { component, element } = setup();
    response.next(dialog.counts);
    response.complete();
    fixture.detectChanges();
    expect(component.status()).toBe('success');
    expect(component.counts()).toBe(dialog.counts);
    expect(renderedRows()).toEqual(dialog.rows);
    expect(element.querySelector('.loading')).toBeNull();
    expect(element.querySelector('.error')).toBeNull();
  });

  it('renders zero counts instead of hiding empty categories', () => {
    const { component } = setup();
    response.next(dialog.zeroCounts);
    response.complete();
    fixture.detectChanges();
    expect(component.status()).toBe('success');
    const rows = renderedRows();
    expect(Object.keys(rows)).toEqual(Object.keys(dialog.rows));
    for (const [category, values] of Object.entries(rows)) {
      expect(Object.keys(values)).toEqual(Object.keys(dialog.rows[category]));
      expect(Object.values(values).every((value) => value === '0')).toBe(true);
    }
  });

  it.each([
    { name: 'missing data', data: null },
    { name: 'missing URL', data: { url: '', sourcePrefix: 'source-1', backupId: null } },
    { name: 'missing source prefix', data: { url: dialog.url, sourcePrefix: '', backupId: null } },
  ])('shows an input error without requesting counts for $name', ({ data }) => {
    const { component, server, element } = setup(data);
    expect(component.status()).toBe('error');
    expect(element.querySelector('.error')?.textContent).toContain('No URL provided');
    expect(element.querySelector('.loading')).toBeNull();
    expect(element.querySelector('.counts')).toBeNull();
    expect(server.getOffice365Counts).not.toHaveBeenCalled();
    expect(server.getGoogleWorkspaceCounts).not.toHaveBeenCalled();
  });

  it.each([
    { error: new Error('Access denied'), expected: 'Access denied' },
    { error: {}, expected: 'Failed to load counts' },
  ])('shows a request failure: $expected', ({ error, expected }) => {
    const { component, element } = setup();
    response.error(error);
    fixture.detectChanges();
    expect(component.status()).toBe('error');
    expect(component.counts()).toBeNull();
    expect(element.querySelector('.error')?.textContent).toContain(expected);
    expect(element.querySelector('.loading')).toBeNull();
    expect(element.querySelector('.counts')).toBeNull();
  });

  it('renders error text literally without creating injected elements', () => {
    const { element } = setup();
    const message = '<img src="missing" onerror="alert(1)">Access denied';
    response.error(new Error(message));
    fixture.detectChanges();
    expect(element.querySelector('.error')?.textContent).toContain(message);
    expect(element.querySelector('img')).toBeNull();
  });

  it('emits closed only when the Close button is clicked', () => {
    const { component, element } = setup();
    const closed = vi.fn();
    component.closed.subscribe(closed);
    const button = element.querySelector<HTMLButtonElement>('footer button')!;
    expect(button.type).toBe('button');
    expect(closed).not.toHaveBeenCalled();
    button.click();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

describe('Microsoft 365 personal-site breakdown', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('hides the optional breakdown for legacy site counts', () => {
    const response = new Subject<Office365Counts>();
    TestBed.configureTestingModule({
      imports: [Office365CountsDialog],
      providers: [{ provide: WebModulesService, useValue: { getOffice365Counts: () => response.asObservable() } }],
    });
    TestBed.overrideComponent(Office365CountsDialog, { set: { imports: [], schemas: [CUSTOM_ELEMENTS_SCHEMA] } });
    const fixture = TestBed.createComponent(Office365CountsDialog);
    fixture.componentRef.setInput('data', { url: 'office365://tenant', sourcePrefix: 'source-1', backupId: null });
    fixture.detectChanges();
    response.next({
      ...officeCounts,
      sites: { ...officeCounts.sites, personalLicensedUser: null, personalUnlicensedUser: null },
    });
    response.complete();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.sub')).toHaveLength(0);
    const sites = Array.from(element.querySelectorAll('.group')).find(
      (group) => group.querySelector('h4')?.textContent === 'Sites'
    )!;
    const personal = Array.from(sites.querySelectorAll('dl > div')).find(
      (row) => row.querySelector('dt')?.textContent?.trim() === 'Personal'
    )!;
    expect(personal.querySelector('dd')?.textContent?.trim()).toBe('8');
    fixture.destroy();
  });
});
