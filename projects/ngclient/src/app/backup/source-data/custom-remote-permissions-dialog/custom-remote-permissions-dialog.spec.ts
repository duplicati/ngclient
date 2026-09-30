import { NgTemplateOutlet } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomRemotePermissionStatus, WebModulesService } from '../../../core/services/webmodules.service';
import { CustomRemotePermissionsDialog, CustomRemotePermissionsDialogData } from './custom-remote-permissions-dialog';

const defaultData: CustomRemotePermissionsDialogData = {
  url: 'office365://tenant',
  sourcePrefix: 'source-1',
  backupId: 'backup-42',
  module: 'office365',
  mode: 'backup',
};

const permissions: CustomRemotePermissionStatus[] = [
  {
    name: 'backup-only',
    description: 'Read backup data',
    requiredForBackup: true,
    requiredForRestore: false,
    enabled: true,
  },
  {
    name: 'restore-only',
    description: 'Write restored data',
    requiredForBackup: false,
    requiredForRestore: true,
    enabled: false,
  },
  { name: 'both', description: 'Access tenant', requiredForBackup: true, requiredForRestore: true, enabled: false },
  {
    name: 'optional',
    description: 'Optional information',
    requiredForBackup: false,
    requiredForRestore: false,
    enabled: true,
  },
];

describe('CustomRemotePermissionsDialog', () => {
  let fixture: ComponentFixture<CustomRemotePermissionsDialog>;
  let response: Subject<CustomRemotePermissionStatus[]>;

  afterEach(() => {
    response?.complete();
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  function setup(data: Partial<CustomRemotePermissionsDialogData> | null = defaultData) {
    response = new Subject<CustomRemotePermissionStatus[]>();
    const service = {
      getOffice365Permissions: vi.fn(() => response.asObservable()),
      getGsuitePermissions: vi.fn(() => response.asObservable()),
    } satisfies Pick<WebModulesService, 'getOffice365Permissions' | 'getGsuitePermissions'>;
    TestBed.configureTestingModule({
      imports: [CustomRemotePermissionsDialog],
      providers: [{ provide: WebModulesService, useValue: service }],
    });
    // Render the application template, including its reusable permission table.
    TestBed.overrideComponent(CustomRemotePermissionsDialog, {
      set: { imports: [NgTemplateOutlet], schemas: [CUSTOM_ELEMENTS_SCHEMA] },
    });
    fixture = TestBed.createComponent(CustomRemotePermissionsDialog);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    return { component: fixture.componentInstance, service, element: fixture.nativeElement as HTMLElement };
  }

  function showPermissions(result: CustomRemotePermissionStatus[]) {
    response.next(result);
    response.complete();
    fixture.detectChanges();
  }

  function rowNames(table: Element) {
    return Array.from(table.querySelectorAll('tbody .name')).map((name) => name.textContent!.trim());
  }

  describe.each([
    {
      module: 'office365',
      method: 'getOffice365Permissions',
      other: 'getGsuitePermissions',
      title: 'Microsoft 365 permissions',
    },
    {
      module: 'googleworkspace',
      method: 'getGsuitePermissions',
      other: 'getOffice365Permissions',
      title: 'Google Workspace permissions',
    },
  ] as const)('$module provider', ({ module, method, other, title }) => {
    it.each(['backup-42', null])('passes backup ID %s and displays loading until the response', (backupId) => {
      const data = { ...defaultData, module, url: `${module}://tenant`, backupId };
      const { component, service, element } = setup(data);
      expect(service[method]).toHaveBeenCalledExactlyOnceWith(data.url, data.sourcePrefix, backupId);
      expect(service[other]).not.toHaveBeenCalled();
      expect(element.querySelector('h3')?.textContent).toBe(title);
      expect(component.status()).toBe('loading');
      expect(component.visiblePermissions()).toBeNull();
      expect(component.additionalPermissions()).toBeNull();
      expect(element.querySelector('.loading')?.textContent).toContain('Loading permissions');
      expect(element.querySelector('table')).toBeNull();
      expect(element.querySelector('.error')).toBeNull();
      showPermissions([]);
      expect(component.status()).toBe('success');
      expect(element.querySelector('.loading')).toBeNull();
    });
  });

  it.each([
    { mode: 'backup', expected: ['backup-only', 'both'] },
    { mode: 'restore', expected: ['restore-only', 'both'] },
  ] as const)('shows only required $mode permissions, then additional permissions', ({ mode, expected }) => {
    const { component, element } = setup({ ...defaultData, mode });
    const before = structuredClone(permissions);
    showPermissions(permissions);
    expect(component.status()).toBe('success');
    expect(component.visiblePermissions()?.map((permission) => permission.name)).toEqual(expected);
    expect(component.additionalPermissions()?.map((permission) => permission.name)).toEqual(['optional']);
    const tables = element.querySelectorAll('table.permissions');
    expect(tables).toHaveLength(2);
    expect(rowNames(tables[0])).toEqual(expected);
    expect(rowNames(tables[1])).toEqual(['optional']);
    expect(element.querySelector('h4')?.textContent).toBe('Additional permissions');
    expect(element.querySelector('.loading')).toBeNull();
    expect(element.querySelector('.error')).toBeNull();
    expect(permissions).toEqual(before);
  });

  it('renders permission descriptions and distinguishes enabled and disabled permissions', () => {
    const { element } = setup();
    showPermissions(permissions);
    const rows = Array.from(element.querySelectorAll('tbody tr'));
    for (const name of ['backup-only', 'both', 'optional']) {
      const permission = permissions.find((permission) => permission.name === name)!;
      const row = rows.find((row) => row.querySelector('.name')?.textContent === name)!;
      expect(row.querySelector('.description')?.textContent).toBe(permission.description);
      const icon = row.querySelector('sh-icon')!;
      expect(icon.classList.contains('enabled')).toBe(permission.enabled);
      expect(icon.classList.contains('disabled')).toBe(!permission.enabled);
      expect(icon.textContent?.trim()).toBe(permission.enabled ? 'check-circle' : 'x-circle');
    }
  });

  it.each(['backup', 'restore'] as const)('shows the empty state for %s without an additional section', (mode) => {
    const { component, element } = setup({ ...defaultData, mode });
    showPermissions([]);
    expect(component.visiblePermissions()).toEqual([]);
    expect(component.additionalPermissions()).toEqual([]);
    expect(element.querySelectorAll('table')).toHaveLength(1);
    expect(element.querySelector('.empty')?.textContent).toContain('No permissions are required for this operation.');
    expect(element.querySelector('h4')).toBeNull();
  });

  it('keeps additional permissions visible when none are required for the operation', () => {
    const { element } = setup();
    showPermissions([permissions[1], permissions[3]]);
    const tables = element.querySelectorAll('table');
    expect(tables).toHaveLength(2);
    expect(tables[0].querySelector('.empty')).not.toBeNull();
    expect(rowNames(tables[1])).toEqual(['optional']);
    expect(element.textContent).not.toContain('restore-only');
  });

  it('omits the additional section when every returned permission is required', () => {
    const { element } = setup();
    showPermissions([permissions[0], permissions[2]]);
    expect(element.querySelectorAll('table')).toHaveLength(1);
    expect(element.querySelector('h4')).toBeNull();
    expect(rowNames(element.querySelector('table')!)).toEqual(['backup-only', 'both']);
  });

  it.each([
    { name: 'data', data: null },
    { name: 'URL', data: { ...defaultData, url: '' } },
    { name: 'source prefix', data: { ...defaultData, sourcePrefix: '' } },
    {
      name: 'module',
      data: { url: defaultData.url, sourcePrefix: defaultData.sourcePrefix, backupId: null, mode: 'backup' as const },
    },
  ])('shows an input error without requesting permissions when $name is missing', ({ data }) => {
    const { component, service, element } = setup(data);
    expect(component.status()).toBe('error');
    expect(element.querySelector('.error')?.textContent).toContain('No URL provided');
    expect(element.querySelector('.loading')).toBeNull();
    expect(element.querySelector('table')).toBeNull();
    expect(service.getOffice365Permissions).not.toHaveBeenCalled();
    expect(service.getGsuitePermissions).not.toHaveBeenCalled();
  });

  it.each([
    { error: new Error('Access denied'), expected: 'Access denied' },
    { error: {}, expected: 'Failed to load permissions' },
  ])('shows the request error: $expected', ({ error, expected }) => {
    const { component, element } = setup();
    response.error(error);
    fixture.detectChanges();
    expect(component.status()).toBe('error');
    expect(component.permissions()).toBeNull();
    expect(element.querySelector('.error')?.textContent).toContain(expected);
    expect(element.querySelector('.loading')).toBeNull();
    expect(element.querySelector('table')).toBeNull();
  });

  it('renders an HTML-like error message as text', () => {
    const { element } = setup();
    const message = '<img src="missing" onerror="alert(1)">Access denied';
    response.error(new Error(message));
    fixture.detectChanges();
    expect(element.querySelector('.error')?.textContent).toContain(message);
    expect(element.querySelector('img')).toBeNull();
  });

  it.each(['loading', 'success', 'error'] as const)(
    'emits closed only after clicking Close in the %s state',
    (status) => {
      const { component, element } = setup();
      if (status === 'success') showPermissions(permissions);
      if (status === 'error') {
        response.error(new Error('Access denied'));
        fixture.detectChanges();
      }
      const closed = vi.fn();
      component.closed.subscribe(closed);
      const button = element.querySelector<HTMLButtonElement>('footer button')!;
      expect(button.type).toBe('button');
      expect(closed).not.toHaveBeenCalled();
      button.click();
      expect(closed).toHaveBeenCalledTimes(1);
    }
  );
});
