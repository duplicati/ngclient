import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipMenu } from '@ship-ui/core/ship-menu';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { Subscription } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '../../../../../environments/environment-token';
import { TestEmailRequestDto, TestEmailResponseDto } from '../../../../core/openapi';
import { SysinfoState } from '../../../../core/states/sysinfo.state';
import { getApiBase, getApiConfigHeaders } from '../../../../core/utils/proxy-config.util';
import { isOptionTrue } from '../option-value-control';
import {
  EMAIL_LEVELS,
  findSmtpPreset,
  SMTP_PRESETS,
  SmtpPreset,
  EMAIL_OPTIONS,
  EmailValues,
  parseLevels,
  RawEmailOptions,
  readEmailOptions,
  sameOptionValue,
  serializeLevels,
  toEmailValues,
} from './email-reports';

export type EmailReportsDialogData = {
  /** The settings being edited; only send-mail-* options are read */
  options: ReadonlyArray<{ Name?: string | null; Value?: unknown }>;
  /** Settings that apply when an option is not set here, such as the global settings for a backup */
  inherited?: ReadonlyArray<{ Name?: string | null; Value?: unknown }> | null;
  /** The id of a saved backup, so the server can fill in a masked password when testing */
  backupId?: string | null;
  /** True for a backup, where the global settings apply to options the backup does not set */
  inheritsGlobalOptions?: boolean;
};

type TestState =
  | { status: 'idle' | 'sending' | 'stopped' }
  | { status: 'success'; log: string[]; withoutServer: boolean }
  | { status: 'failed'; log: string[]; message: string };

/** The server sends the test email itself, see /api/v2/report/test-email */
export const TEST_EMAIL_API_EXTENSION = 'v2:report:test-email';

@Component({
  selector: 'app-email-reports-dialog',
  imports: [FormsModule, ShipAlert, ShipButton, ShipCheckbox, ShipFormField, ShipIcon, ShipMenu, ShipSelect],
  templateUrl: './email-reports-dialog.component.html',
  styleUrl: './email-reports-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailReportsDialogComponent {
  #http = inject(HttpClient);
  #env = inject(ENVIRONMENT_TOKEN);
  #sysInfo = inject(SysinfoState);

  data = input<EmailReportsDialogData>();
  closed = output<EmailValues | undefined>();

  readonly levelOptions = EMAIL_LEVELS;
  readonly smtpPresets = SMTP_PRESETS;
  readonly levelLabels: Record<string, string> = {
    Success: $localize`Success`,
    Warning: $localize`Warning`,
    Error: $localize`Error`,
    Fatal: $localize`Fatal error`,
  };
  readonly inheritedPasswordText = $localize`Inherited from global settings`;
  readonly defaultBodyText = '%RESULT%';

  #ownRaw = computed(() => readEmailOptions(this.data()?.options));
  #inheritedRaw = computed(() => readEmailOptions(this.data()?.inherited));
  own = computed(() => toEmailValues(this.#ownRaw()));
  inherited = computed(() => toEmailValues(this.#inheritedRaw()));
  hasInherited = computed(() => !!this.inherited().to);

  #option = (name: string) => this.#sysInfo.allOptions().find((x) => x.name === name);
  operationOptions = computed(() => this.#option(EMAIL_OPTIONS.operations)?.options ?? ['Backup']);
  formatOptions = computed(() => this.#option(EMAIL_OPTIONS.format)?.options ?? ['Duplicati', 'Json']);
  /** The bundled templates; older servers do not have the option, so the list is empty */
  templateOptions = computed(() => this.#option(EMAIL_OPTIONS.template)?.options ?? []);
  #defaults = computed(() => ({
    operations: this.#option(EMAIL_OPTIONS.operations)?.defaultValue ?? 'Backup',
    format: this.#option(EMAIL_OPTIONS.format)?.defaultValue ?? 'Duplicati',
    template: this.#option(EMAIL_OPTIONS.template)?.defaultValue ?? 'default',
    level: 'All',
    bool: 'false',
  }));

  to = linkedSignal(() => this.own().to ?? '');
  from = linkedSignal(() => this.own().from ?? '');
  url = linkedSignal(() => this.own().url ?? '');
  username = linkedSignal(() => this.own().username ?? '');
  password = linkedSignal(() => this.own().password ?? '');
  subject = linkedSignal(() => this.own().subject ?? '');
  body = linkedSignal(() => this.own().body ?? '');

  levels = linkedSignal(() => parseLevels(this.own().level ?? this.inherited().level));
  operations = linkedSignal(() => this.own().operations ?? this.inherited().operations ?? this.#defaults().operations);
  format = linkedSignal(() => this.own().format ?? this.inherited().format ?? this.#defaults().format);
  template = linkedSignal(() => this.own().template ?? this.inherited().template ?? this.#defaults().template);
  /** The template only applies to the Template format */
  showTemplate = computed(() => this.templateOptions().length > 0 && this.format().trim().toLowerCase() === 'template');
  bodyHtml = linkedSignal(() => isOptionTrue(this.own().bodyHtml ?? this.inherited().bodyHtml ?? 'false'));
  acceptAnyCertificate = linkedSignal(() =>
    isOptionTrue(this.own().acceptAnyCertificate ?? this.inherited().acceptAnyCertificate ?? 'false')
  );

  showPassword = signal(false);
  isPasswordMasked = computed(() => {
    const placeholder = this.#sysInfo.systemInfo()?.PasswordPlaceholder;
    return !!placeholder && this.password() === placeholder;
  });

  levelsError = computed(() => this.levels().length === 0);
  operationsError = computed(() => this.operations().trim() === '');
  isValid = computed(() => !this.levelsError() && !this.operationsError());
  effectiveRecipient = computed(() => this.to().trim() || this.inherited().to || '');
  /**
   * Without a server, the module sends straight to the recipient's mail server. That works
   * for a local mail server, but public providers reject or mark mail from home networks as spam.
   */
  hasNoServer = computed(() => !this.url().trim() && !this.inherited().url);
  smtpPreset = computed(() => findSmtpPreset(this.url() || this.inherited().url));
  /** Some settings are filled in, but no emails will be sent without a recipient */
  missingRecipient = computed(
    () =>
      !this.effectiveRecipient() &&
      [this.from(), this.url(), this.username(), this.password()].some((x) => x.trim() !== '')
  );

  testState = signal<TestState>({ status: 'idle' });
  /** Older servers do not have the endpoint, so the test button is hidden */
  supportsTestEmail = computed(() =>
    (this.#sysInfo.systemInfo()?.APIExtensions ?? []).includes(TEST_EMAIL_API_EXTENSION)
  );
  isTesting = computed(() => this.testState().status === 'sending');
  canTest = computed(
    () => this.supportsTestEmail() && this.isValid() && !!this.effectiveRecipient() && !this.isTesting()
  );
  testLog = computed(() => {
    const state = this.testState();
    return 'log' in state ? state.log : [];
  });
  testError = computed(() => {
    const state = this.testState();
    return state.status === 'failed' ? state.message : null;
  });

  #run?: Subscription;

  /** A result from before the server changed would describe the old server */
  #clearStaleResult = effect(() => {
    this.url();
    untracked(() => {
      if (!this.isTesting() && this.testState().status !== 'idle') this.testState.set({ status: 'idle' });
    });
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.#cancelTest());
  }

  toggleLevel(level: string, checked: boolean) {
    this.levels.update((levels) => (checked ? [...new Set([...levels, level])] : levels.filter((x) => x !== level)));
  }

  /** The values to store; an empty value removes the option so the inherited or default value applies */
  result(): EmailValues {
    const inherited = this.inherited();
    const defaults = this.#defaults();
    const unlessInherited = (value: string, fallback: string | undefined) =>
      sameOptionValue(value, fallback) ? '' : value;

    return {
      to: this.to().trim(),
      from: this.from().trim(),
      url: this.url().trim(),
      username: this.username().trim(),
      password: this.password(),
      subject: this.subject().trim(),
      body: this.body().trim(),
      level: unlessInherited(serializeLevels(this.levels()), inherited.level ?? defaults.level),
      operations: unlessInherited(this.operations(), inherited.operations ?? defaults.operations),
      format: unlessInherited(this.format(), inherited.format ?? defaults.format),
      template: unlessInherited(this.template(), inherited.template ?? defaults.template),
      bodyHtml: unlessInherited(String(this.bodyHtml()), inherited.bodyHtml ?? defaults.bool),
      acceptAnyCertificate: unlessInherited(
        String(this.acceptAnyCertificate()),
        inherited.acceptAnyCertificate ?? defaults.bool
      ),
    };
  }

  /** All send-mail-* values as they would be stored, including the ones this dialog does not edit */
  #resultRaw(): RawEmailOptions {
    const raw = { ...this.#ownRaw() };
    for (const [field, value] of Object.entries(this.result())) {
      const name = EMAIL_OPTIONS[field as keyof typeof EMAIL_OPTIONS];
      if (value === '') delete raw[name];
      else raw[name] = value;
    }
    return raw;
  }

  save() {
    if (!this.isValid()) return;
    this.#cancelTest();
    this.closed.emit(this.result());
  }

  cancel() {
    this.#cancelTest();
    this.closed.emit(undefined);
  }

  applyPreset(preset: SmtpPreset, usernameInput?: HTMLInputElement) {
    this.url.set(preset.url);
    usernameInput?.focus();
  }

  sendTestEmail() {
    if (!this.canTest()) return;
    this.#cancelTest();

    const data = this.data();
    const withoutServer = this.hasNoServer();
    this.testState.set({ status: 'sending' });
    this.#run = this.#postTestEmail({
      Options: this.#resultRaw(),
      BackupId: data?.backupId ?? null,
      // For a backup, the global settings apply where the backup has no value
      IncludeGlobalOptions: !!data?.inheritsGlobalOptions,
    }).subscribe({
      next: (response) => {
        this.#run = undefined;
        const log = response.Data?.Log ?? [];
        this.testState.set(
          response.Success
            ? { status: 'success', log, withoutServer }
            : { status: 'failed', log, message: response.Error ?? $localize`The test email could not be sent.` }
        );
      },
      error: (error) => {
        this.#run = undefined;
        const message =
          error instanceof HttpErrorResponse
            ? ((error.error as { Error?: string } | null)?.Error ?? error.message)
            : (error as { message?: string })?.message;
        this.testState.set({
          status: 'failed',
          log: [],
          message: message ?? $localize`The test email could not be sent.`,
        });
      },
    });
  }

  /** Stops a test that is still sending; the server stops trying to reach the mail servers */
  stopTest() {
    if (!this.isTesting()) return;
    this.#cancelTest();
    this.testState.set({ status: 'stopped' });
  }

  /**
   * Angular's client is used rather than the generated one, as the generated one waits on a promise
   * that cannot be cancelled. Unsubscribing here aborts the request, and the server then cancels the send.
   */
  #postTestEmail(body: TestEmailRequestDto) {
    return this.#http.post<TestEmailResponseDto>(`${getApiBase()}${this.#env.baseUrl}/v2/report/test-email`, body, {
      headers: getApiConfigHeaders(),
    });
  }

  #cancelTest() {
    this.#run?.unsubscribe();
    this.#run = undefined;
    if (this.isTesting()) this.testState.set({ status: 'idle' });
  }
}
