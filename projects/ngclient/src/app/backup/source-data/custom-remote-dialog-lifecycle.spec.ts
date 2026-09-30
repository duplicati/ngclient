import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { finalize, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CustomRemotePermissionStatus,
  GoogleWorkspaceCounts,
  Office365Counts,
  WebModulesService,
} from '../../core/services/webmodules.service';
import { CustomRemotePermissionsDialog } from './custom-remote-permissions-dialog/custom-remote-permissions-dialog';
import { GoogleWorkspaceCountsDialog } from './googleworkspace-counts-dialog/googleworkspace-counts-dialog';
import { Office365CountsDialog } from './office365-counts-dialog/office365-counts-dialog';

type Dialog = Office365CountsDialog | GoogleWorkspaceCountsDialog | CustomRemotePermissionsDialog;
type Result = Office365Counts | GoogleWorkspaceCounts | CustomRemotePermissionStatus[];

const officeCounts = (value: number): Office365Counts => ({
  users: { total: value, licensed: value, unlicensed: 0, sharedMailboxWithStorage: 0, sharedMailboxWithoutStorage: 0 },
  groups: { total: 0, unified: 0, notUnified: 0 },
  sites: {
    total: 0,
    group: 0,
    classic: 0,
    communication: 0,
    personal: 0,
    other: 0,
    personalLicensedUser: null,
    personalUnlicensedUser: null,
  },
});

const googleCounts = (value: number): GoogleWorkspaceCounts => ({
  users: { total: value, active: value, suspended: 0, archived: 0 },
  groups: { total: 0 },
  sharedDrives: { total: 0 },
  sites: { total: 0 },
});

const permissions = (value: number): CustomRemotePermissionStatus[] => [
  {
    name: `permission-${value}`,
    description: 'Read tenant',
    requiredForBackup: true,
    requiredForRestore: false,
    enabled: true,
  },
];

const dialogs: {
  name: string;
  type: Type<Dialog>;
  module: 'office365' | 'googleworkspace';
  result: (value: number) => Result;
}[] = [
  { name: 'Microsoft 365 counts', type: Office365CountsDialog, module: 'office365', result: officeCounts },
  {
    name: 'Google Workspace counts',
    type: GoogleWorkspaceCountsDialog,
    module: 'googleworkspace',
    result: googleCounts,
  },
  { name: 'Microsoft 365 permissions', type: CustomRemotePermissionsDialog, module: 'office365', result: permissions },
  {
    name: 'Google Workspace permissions',
    type: CustomRemotePermissionsDialog,
    module: 'googleworkspace',
    result: permissions,
  },
];

describe.each(dialogs)('$name request lifecycle', (dialog) => {
  let fixture: ComponentFixture<Dialog>;
  const requests: { response: Subject<Result>; finalized: ReturnType<typeof vi.fn> }[] = [];

  afterEach(() => {
    fixture?.destroy();
    requests.splice(0).forEach(({ response }) => response.complete());
    TestBed.resetTestingModule();
  });

  function setup() {
    const load = vi.fn(() => {
      const response = new Subject<Result>();
      const finalized = vi.fn();
      requests.push({ response, finalized });
      return response.pipe(finalize(finalized));
    });
    TestBed.configureTestingModule({
      imports: [dialog.type],
      providers: [
        {
          provide: WebModulesService,
          useValue: {
            getOffice365Counts: load,
            getGoogleWorkspaceCounts: load,
            getOffice365Permissions: load,
            getGsuitePermissions: load,
          },
        },
      ],
    });
    TestBed.overrideComponent(dialog.type, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent<Dialog>(dialog.type);
    const data = {
      url: `${dialog.module}://first`,
      sourcePrefix: 'source-1',
      backupId: 'backup-42',
      module: dialog.module,
      mode: 'backup',
    };
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    expect(load).toHaveBeenCalledTimes(1);
    return { component: fixture.componentInstance, data, load };
  }

  function value(component: Dialog) {
    return 'permissions' in component ? component.permissions() : component.counts();
  }

  it('keeps a current request active until normal completion', () => {
    const { component } = setup();
    expect(requests[0].finalized).not.toHaveBeenCalled();
    expect(component.status()).toBe('loading');
    const result = dialog.result(1);
    requests[0].response.next(result);
    expect(value(component)).toBe(result);
    expect(component.status()).toBe('success');
    expect(requests[0].finalized).not.toHaveBeenCalled();
    requests[0].response.complete();
    expect(requests[0].finalized).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(requests[0].finalized).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'error'] as const)('releases a pending request on destroy and ignores late %s', (outcome) => {
    const { component } = setup();
    fixture.destroy();
    expect(requests[0].finalized).toHaveBeenCalledTimes(1);
    if (outcome === 'success') requests[0].response.next(dialog.result(1));
    else requests[0].response.error(new Error('Late error'));
    expect(value(component)).toBeNull();
    expect(component.status()).toBe('loading');
    expect(component.error()).toBeNull();
  });

  it('releases the old request on input change while keeping the new request active', () => {
    const { component, data, load } = setup();
    fixture.componentRef.setInput('data', { ...data, url: `${dialog.module}://second` });
    fixture.detectChanges();
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith(`${dialog.module}://second`, 'source-1', 'backup-42');
    expect(requests[0].finalized).toHaveBeenCalledTimes(1);
    expect(requests[1].finalized).not.toHaveBeenCalled();
    requests[0].response.next(dialog.result(1));
    expect(value(component)).toBeNull();
    expect(component.status()).toBe('loading');
    const current = dialog.result(2);
    requests[1].response.next(current);
    requests[1].response.complete();
    expect(value(component)).toBe(current);
    expect(component.status()).toBe('success');
    expect(requests[1].finalized).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'error'] as const)(
    "does not overwrite the current result with an older request's late %s",
    (outcome) => {
      const { component, data } = setup();
      fixture.componentRef.setInput('data', { ...data, sourcePrefix: 'source-2', backupId: 'backup-43' });
      fixture.detectChanges();
      const current = dialog.result(2);
      requests[1].response.next(current);
      requests[1].response.complete();
      if (outcome === 'success') requests[0].response.next(dialog.result(1));
      else requests[0].response.error(new Error('Older request failed'));
      expect(value(component)).toBe(current);
      expect(component.status()).toBe('success');
      expect(component.error()).toBeNull();
      expect(requests[0].finalized).toHaveBeenCalledTimes(1);
    }
  );

  it('releases a pending request when new input is invalid and retains the input error', () => {
    const { component, data, load } = setup();
    fixture.componentRef.setInput('data', { ...data, url: '' });
    fixture.detectChanges();
    expect(load).toHaveBeenCalledTimes(1);
    expect(requests[0].finalized).toHaveBeenCalledTimes(1);
    requests[0].response.next(dialog.result(1));
    expect(value(component)).toBeNull();
    expect(component.status()).toBe('error');
    expect(component.error()).toBe('No URL provided');
  });
});
