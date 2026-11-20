import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteDestinationType } from '../../../core/openapi';
import { CustomRemotePermissionsDialog } from '../custom-remote-permissions-dialog/custom-remote-permissions-dialog';
import { GoogleWorkspaceCountsDialog } from '../googleworkspace-counts-dialog/googleworkspace-counts-dialog';
import { Office365CountsDialog } from '../office365-counts-dialog/office365-counts-dialog';
import { PostgresqlCountsDialog } from '../postgresql-counts-dialog/postgresql-counts-dialog';
import { TargetUrlDialog } from './target-url-dialog';

describe('TargetUrlDialog workspace tools', () => {
  let fixture: ComponentFixture<TargetUrlDialog>;
  const open = vi.fn();

  function render(targetUrlModel: string, sourcePrefix: string | null, moduleType: RemoteDestinationType = 'SourceProvider') {
    TestBed.configureTestingModule({
      imports: [TargetUrlDialog],
      providers: [{ provide: ShipDialogService, useValue: { open } }],
    });
    TestBed.overrideComponent(TargetUrlDialog, { set: { imports: [], schemas: [CUSTOM_ELEMENTS_SCHEMA] } });
    fixture = TestBed.createComponent(TargetUrlDialog);
    fixture.componentRef.setInput('data', {
      targetUrlModel,
      backupId: '7',
      sourcePrefix,
      moduleType,
      askToCreate: false,
      expectedResult: 'destinationNotEmpty',
      suppressErrorDialogs: true,
    });
    fixture.detectChanges();
  }

  const footerButtons = () =>
    [...fixture.nativeElement.querySelectorAll('footer .footer-tools button')] as HTMLButtonElement[];

  function finishTest() {
    fixture.componentInstance.testSignal.set({
      action: 'success',
      targetUrl: fixture.componentInstance.targetUrlModel()!,
      testAgain: false,
      destinationIndex: 0,
    });
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it('opens counts and permissions for the Microsoft 365 URL being edited from the footer', () => {
    render('office365://tenant?x=1', '/dupl-office365-abc');
    finishTest();
    const [counts, permissions] = footerButtons();
    expect(footerButtons().map((b) => b.textContent)).toEqual([
      expect.stringContaining('Show item counts'),
      expect.stringContaining('Check permissions'),
    ]);

    counts.click();
    expect(open).toHaveBeenLastCalledWith(
      Office365CountsDialog,
      expect.objectContaining({
        data: { url: 'office365://tenant?x=1', sourcePrefix: '/dupl-office365-abc', backupId: '7' },
      })
    );

    permissions.click();
    expect(open).toHaveBeenLastCalledWith(
      CustomRemotePermissionsDialog,
      expect.objectContaining({
        data: expect.objectContaining({ url: 'office365://tenant?x=1', module: 'office365', mode: 'backup' }),
      })
    );
  });

  it('uses the Google Workspace counts dialog for Google Workspace sources', () => {
    render('googleworkspace://domain', '/dupl-googleworkspace-abc');
    finishTest();
    footerButtons()[0].click();
    expect(open).toHaveBeenLastCalledWith(GoogleWorkspaceCountsDialog, expect.anything());
  });

  it('opens the database counts and checks for a PostgreSQL source', () => {
    render('postgresql://?postgresql-host=db', '/dupl-postgresql-abc');
    finishTest();
    const [counts, permissions] = footerButtons();

    counts.click();
    expect(open).toHaveBeenLastCalledWith(PostgresqlCountsDialog, expect.anything());

    permissions.click();
    expect(open).toHaveBeenLastCalledWith(
      CustomRemotePermissionsDialog,
      expect.objectContaining({ data: expect.objectContaining({ module: 'postgresql', mode: 'backup' }) })
    );
  });

  it('keeps the tools disabled until the URL has been tested, like the submit button', () => {
    render('office365://tenant', '/dupl-office365-abc');
    expect(footerButtons().map((b) => b.disabled)).toEqual([true, true]);

    fixture.componentInstance.testSignal.set('testing');
    fixture.detectChanges();
    expect(footerButtons().map((b) => b.disabled)).toEqual([true, true]);

    finishTest();
    expect(footerButtons().map((b) => b.disabled)).toEqual([false, false]);
  });

  it('offers the tools for a new source that has no prefix yet', () => {
    render('office365://tenant', null);
    finishTest();
    footerButtons()[1].click();
    expect(open).toHaveBeenLastCalledWith(
      CustomRemotePermissionsDialog,
      expect.objectContaining({ data: expect.objectContaining({ url: 'office365://tenant', sourcePrefix: '' }) })
    );
  });

  it('hides the tools for other sources and restore targets', () => {
    render('s3://bucket', '/dupl-s3-abc');
    expect(footerButtons()).toHaveLength(0);
    TestBed.resetTestingModule();

    render('office365://tenant', '/dupl-office365-abc', 'RestoreDestinationProvider');
    expect(footerButtons()).toHaveLength(0);
  });
});
