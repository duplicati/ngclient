import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENVIRONMENT_TOKEN } from '../../../../../environments/environment-token';
import { SysinfoState } from '../../../../core/states/sysinfo.state';
import { EmailReportsDialogComponent, EmailReportsDialogData } from './email-reports-dialog.component';
import { SMTP_PRESETS } from './email-reports';

const TEST_EMAIL_URL = '/api/v2/report/test-email';

describe('EmailReportsDialogComponent', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  function setup(data: EmailReportsDialogData, apiExtensions: string[] = ['v2:report:test-email']) {
    TestBed.configureTestingModule({
      imports: [EmailReportsDialogComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENVIRONMENT_TOKEN, useValue: { baseUrl: '/api' } },
        {
          provide: SysinfoState,
          useValue: {
            allOptions: signal([
              { name: 'send-mail-operations', type: 'Flags', options: ['Backup', 'Restore'], defaultValue: 'Backup' },
              {
                name: 'send-mail-result-output-format',
                type: 'Enumeration',
                options: ['Duplicati', 'Json'],
                defaultValue: 'Duplicati',
              },
            ]),
            systemInfo: signal({ PasswordPlaceholder: '***************', APIExtensions: apiExtensions }),
          },
        },
      ],
    });
    TestBed.overrideComponent(EmailReportsDialogComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(EmailReportsDialogComponent);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, http: TestBed.inject(HttpTestingController) };
  }

  it('loads existing values and only stores values that differ from defaults', () => {
    const { component } = setup({
      options: [
        { Name: '--send-mail-to', Value: 'me@example.com' },
        { Name: '--send-mail-level', Value: 'Warning,Error' },
      ],
    });
    expect(component.to()).toBe('me@example.com');
    expect(component.levels()).toEqual(['Warning', 'Error']);

    component.toggleLevel('Success', true);
    component.toggleLevel('Fatal', true);
    const result = component.result();
    expect(result.to).toBe('me@example.com');
    expect(result.level).toBe('');
    expect(result.operations).toBe('');
    expect(result.acceptAnyCertificate).toBe('');
  });

  it('keeps an explicit value when it overrides an inherited one', () => {
    const { component } = setup({
      options: [],
      inherited: [
        { Name: '--send-mail-to', Value: 'global@example.com' },
        { Name: '--send-mail-level', Value: 'Error' },
      ],
    });
    expect(component.hasInherited()).toBe(true);
    expect(component.levels()).toEqual(['Error']);
    component.toggleLevel('Warning', true);
    expect(component.result().level).toBe('Warning,Error');
    expect(component.result().to).toBe('');
  });

  describe('result template', () => {
    function setupWithTemplates(data: EmailReportsDialogData) {
      const result = setup(data);
      const sysinfo = TestBed.inject(SysinfoState) as unknown as { allOptions: ReturnType<typeof signal<unknown[]>> };
      sysinfo.allOptions.update((options) => [
        ...options,
        {
          name: 'send-mail-result-template',
          type: 'Enumeration',
          options: ['default', 'email', 'html', 'slack', 'summary'],
          defaultValue: 'default',
        },
      ]);
      return result;
    }

    it('is offered for the Template format only', () => {
      const { component } = setupWithTemplates({ options: [] });
      expect(component.templateOptions()).toEqual(['default', 'email', 'html', 'slack', 'summary']);
      expect(component.showTemplate()).toBe(false);

      component.format.set('Template');
      expect(component.showTemplate()).toBe(true);
      expect(component.template()).toBe('default');
    });

    it('is not offered by a server without the option', () => {
      const { component } = setup({ options: [{ Name: 'send-mail-result-output-format', Value: 'Template' }] });
      expect(component.showTemplate()).toBe(false);
      expect(component.result().template).toBe('');
    });

    it('stores a template that differs from the default', () => {
      const { component } = setupWithTemplates({
        options: [
          { Name: 'send-mail-result-output-format', Value: 'Template' },
          { Name: 'send-mail-result-template', Value: 'summary' },
        ],
      });
      expect(component.template()).toBe('summary');
      expect(component.result().template).toBe('summary');

      component.template.set('default');
      expect(component.result().template).toBe('');
    });

    it('does not store a template that is inherited', () => {
      const { component } = setupWithTemplates({
        options: [],
        inherited: [
          { Name: '--send-mail-result-output-format', Value: 'Template' },
          { Name: '--send-mail-result-template', Value: 'summary' },
        ],
      });
      expect(component.showTemplate()).toBe(true);
      expect(component.template()).toBe('summary');
      expect(component.result().template).toBe('');

      component.template.set('email');
      expect(component.result().template).toBe('email');
    });
  });

  it('requires at least one level', () => {
    const { component } = setup({ options: [{ Name: 'send-mail-level', Value: 'Error' }] });
    component.toggleLevel('Error', false);
    expect(component.isValid()).toBe(false);
    const emitted = vi.fn();
    component.closed.subscribe(emitted);
    component.save();
    expect(emitted).not.toHaveBeenCalled();
  });

  it('sends a test email with the edited values and reports success', () => {
    const { component, http } = setup({
      options: [
        { Name: 'send-mail-to', Value: 'me@example.com' },
        { Name: 'send-mail-password', Value: '***************' },
        { Name: 'send-mail-extra-parameters', Value: 'kept' },
      ],
      inherited: [{ Name: '--send-mail-url', Value: 'smtp://global.example.com' }],
      inheritsGlobalOptions: true,
      backupId: '12',
    });
    component.username.set('me');
    component.sendTestEmail();

    const request = http.expectOne(TEST_EMAIL_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      Options: {
        'send-mail-to': 'me@example.com',
        'send-mail-password': '***************',
        'send-mail-extra-parameters': 'kept',
        'send-mail-username': 'me',
      },
      BackupId: '12',
      IncludeGlobalOptions: true,
    });
    expect(component.isTesting()).toBe(true);
    request.flush({
      Success: true,
      Error: null,
      StatusCode: 'OK',
      Data: { Log: ['Email sent successfully using server: smtps://mail.example.com'] },
    });
    expect(component.testState().status).toBe('success');
    expect(component.testLog()).toEqual(['Email sent successfully using server: smtps://mail.example.com']);
  });

  it('shows the server error when sending fails', () => {
    const { component, http } = setup({ options: [{ Name: 'send-mail-to', Value: 'me@example.com' }] });
    component.sendTestEmail();
    http
      .expectOne(TEST_EMAIL_URL)
      .flush({ Success: false, Error: 'Authentication failed', StatusCode: 'send-failed', Data: { Log: [] } });
    expect(component.testState().status).toBe('failed');
    expect(component.testError()).toBe('Authentication failed');
  });

  it('shows the error from a failed request', () => {
    const { component, http } = setup({ options: [{ Name: 'send-mail-to', Value: 'me@example.com' }] });
    component.sendTestEmail();
    http.expectOne(TEST_EMAIL_URL).flush({ Error: 'Server exploded' }, { status: 500, statusText: 'Error' });
    expect(component.testError()).toBe('Server exploded');
  });

  it('cannot test without a recipient', () => {
    const { component, http } = setup({ options: [] });
    expect(component.canTest()).toBe(false);
    component.sendTestEmail();
    http.expectNone(TEST_EMAIL_URL);
  });

  it('cannot test on a server without the test email API', () => {
    const { component, http } = setup({ options: [{ Name: 'send-mail-to', Value: 'me@example.com' }] }, []);
    expect(component.supportsTestEmail()).toBe(false);
    component.sendTestEmail();
    http.expectNone(TEST_EMAIL_URL);
  });

  it('aborts the request when the user stops the test', () => {
    const { component, http } = setup({ options: [{ Name: 'send-mail-to', Value: 'me@example.com' }] });
    component.sendTestEmail();
    const request = http.expectOne(TEST_EMAIL_URL);
    component.stopTest();
    expect(request.cancelled).toBe(true);
    expect(component.testState().status).toBe('stopped');
    expect(component.canTest()).toBe(true);
  });

  it('aborts the request when the dialog closes', () => {
    const { component, http } = setup({ options: [{ Name: 'send-mail-to', Value: 'me@example.com' }] });
    component.sendTestEmail();
    const request = http.expectOne(TEST_EMAIL_URL);
    component.cancel();
    expect(request.cancelled).toBe(true);
  });

  it('aborts the request when the dialog is destroyed', () => {
    const { fixture, component, http } = setup({ options: [{ Name: 'send-mail-to', Value: 'me@example.com' }] });
    component.sendTestEmail();
    const request = http.expectOne(TEST_EMAIL_URL);
    fixture.destroy();
    expect(request.cancelled).toBe(true);
  });
  it('notices when no mail server is set, here or globally', () => {
    const own = setup({ options: [{ Name: 'send-mail-to', Value: 'me@example.com' }] }).component;
    expect(own.hasNoServer()).toBe(true);
    own.url.set('smtps://mail.example.com');
    expect(own.hasNoServer()).toBe(false);
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();

    const inherited = setup({
      options: [],
      inherited: [{ Name: '--send-mail-url', Value: 'smtps://smtp.gmail.com:465' }],
    }).component;
    expect(inherited.hasNoServer()).toBe(false);
    expect(inherited.smtpPreset()?.name).toBe('Gmail');
  });

  it('fills in the server of a provider and moves on to the username', () => {
    const { component } = setup({ options: [] });
    const username = document.createElement('input');
    document.body.appendChild(username);
    component.applyPreset(SMTP_PRESETS[0], username);
    expect(component.url()).toBe(SMTP_PRESETS[0].url);
    expect(component.smtpPreset()).toBe(SMTP_PRESETS[0]);
    expect(document.activeElement).toBe(username);
    username.remove();
  });

  it('notes that a test without a mail server may land in spam', () => {
    const { component, http } = setup({ options: [{ Name: 'send-mail-to', Value: 'me@example.com' }] });
    component.sendTestEmail();
    http.expectOne(TEST_EMAIL_URL).flush({ Success: true, Error: null, StatusCode: 'OK', Data: { Log: [] } });
    expect(component.testState()).toEqual({ status: 'success', log: [], withoutServer: true });

    // Picking a server makes the result out of date
    component.applyPreset(SMTP_PRESETS[0]);
    TestBed.tick();
    expect(component.testState().status).toBe('idle');
  });
});
