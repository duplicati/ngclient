import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import {
  catchError,
  defer,
  EMPTY,
  finalize,
  forkJoin,
  map,
  Observable,
  of,
  switchMap,
  takeWhile,
  throwError,
} from 'rxjs';
import { ConfirmDialogComponent } from '../core/components/confirm-dialog/confirm-dialog.component';
import { randomUUID } from '../core/functions/crypto';
import {
  ArgumentType,
  BackupDto,
  DuplicatiServer,
  ICommandLineArgument,
  ScheduleDto,
  SettingDto,
  SettingInputDto,
  TargetUrlDto,
} from '../core/openapi';
import { TimespanLiteralsService } from '../core/services/timespan-literals.service';
import { AsyncOperation } from '../core/signals/async-operation';
import { parseRecursiveObjectOfSignals } from '../core/signals/parse-recursive-signals-object';
import { ConnectionStringsState } from '../core/states/connection-strings.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { FormView, getConfigurationByUrl } from './destination/destination.config-utilities';
import { createGeneralForm, NONE_OPTION } from './models/general-form';
import { RetentionType } from './models/backup-options';
import {
  BackupTargetUrl,
  mapBackupToGeneralForm,
  mapBackupToSourceDataForm,
  mapBackupToOptionsForm,
  mapBackupFormToSettings,
  mapBackupFormToDto,
} from './models/backup-form-mappers';
import {
  getNextRunDate,
  evaluateTimeString,
  SCHEDULE_DEFAULT_OPTIONS,
  SCHEDULE_FIELD_DEFAULTS,
  scheduleOptionToSchedule,
} from './models/schedule-form';
import { createSourceDataForm } from './models/source-data-form';
import type { TestState } from './source-data/target-url-dialog/test-url/test-url';

export type { BackupTargetUrl } from './models/backup-form-mappers';

const DEFAULT_SAVE_CONNECTIONSTRING = false;

type BackupSaveContext = {
  backupId: string | null;
  isDraft: boolean;
  targets: BackupTargetUrl[];
};

const createBackupTargetUrl = (
  url: string,
  connectionStringId: number | null,
  urlKey: string | null,
  save: boolean
): BackupTargetUrl => ({
  uiKey: randomUUID(),
  url,
  connectionStringId,
  urlKey,
  save,
});

@Injectable({
  providedIn: 'root',
})
export class BackupState {
  #router = inject(Router);
  #sysinfo = inject(SysinfoState);
  #dialog = inject(ShipDialogService);
  #dupServer = inject(DuplicatiServer);
  #serverSettings = inject(ServerSettingsService);
  #timespanLiteralService = inject(TimespanLiteralsService);
  #connectionStringsState = inject(ConnectionStringsState);

  generalForm = createGeneralForm();
  sourceDataForm = createSourceDataForm();
  scheduleFields = SCHEDULE_FIELD_DEFAULTS();
  scheduleType = signal<string>('daily');
  settings = signal<SettingInputDto[]>([]);
  optionsFields = {
    backupRetention: signal<RetentionType>('all'),
    backupRetentionTime: signal(''),
    backupRetentionVersions: signal<number | null>(0),
    backupRetentionCustom: signal(''),
  };

  targetUrls = signal<BackupTargetUrl[]>([]);
  targetUrlModel = computed(() => this.targetUrls()[0]?.url ?? null);
  connectionStringId = computed(() => this.targetUrls()[0]?.connectionStringId ?? null);

  targetUrlTestSignal = signal<TestState>(null);
  backupMetadata = signal<Record<string, string> | null>(null);

  isDraft = signal(false);
  backupId = signal<'new' | 'string' | null>(null);
  backupName = computed(() => this.generalFormSignal()?.name ?? '');
  #saveOperation = new AsyncOperation<unknown>();
  #saveContext: BackupSaveContext | null = null;
  saveState = this.#saveOperation.state;
  isSubmitting = this.#saveOperation.pending;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#saveContext = null;
      this.#saveOperation.destroy();
    });
  }

  #cancelStaleSave = effect(() => {
    this.backupId();
    this.isDraft();
    this.targetUrls();
    untracked(() => {
      if (this.#saveContext && !this.#isCurrentSave(this.#saveContext)) this.cancelSubmit();
    });
  });
  finishedLoading = signal(false);
  backupDefaults = signal<Record<string, string> | null>(null);
  applicationOptions = signal<SettingDto[] | null>(null);
  isNew = computed(() => this.backupId() === 'new');
  shouldAutoSave = computed(() => !this.isDraft() && !this.isNew());
  osType = computed(() => this.#sysinfo.systemInfo()?.OSType);
  isSyncMode = computed(() => this.generalForm.controls.operationType.value === 'Sync');

  isConnectionStringSaved = computed(() => {
    const targetUrl = this.targetUrlModel();
    if (!targetUrl) return false;
    return this.#connectionStringsState.destinations().some((d) => d.BaseUrl === targetUrl);
  });

  selectedOptions = signal<FormView[]>([]);

  sourceDataFormSignal = toSignal(this.sourceDataForm.valueChanges);
  generalFormSignal = toSignal(this.generalForm.valueChanges);
  encryptionFieldSignal = toSignal(this.generalForm.controls.encryption.valueChanges);
  operationTypeFieldSignal = toSignal(this.generalForm.controls.operationType.valueChanges);

  advancedOptions = computed(() => {
    return this.#sysinfo.systemInfo()?.Options?.map(this.#mapCommandLineArgumentsToFormViews) ?? [];
  });

  #testSignal = signal<TestState>(null);
  #lastTargetUrl: string | null = null;

  testSignal = this.#testSignal.asReadonly();

  #clearTestSignalEffect = effect(() => {
    const newUrl = this.targetUrlModel();
    const testSignalValue = this.#testSignal();
    const lastTargetUrl = this.#lastTargetUrl;
    this.#lastTargetUrl = newUrl;

    if (testSignalValue === 'testing' || lastTargetUrl === null || lastTargetUrl === newUrl) return;
    this.#testSignal.set(null);
  });

  #clearConnectionStringIdEffect = effect(() => {
    const targetUrl = this.targetUrlModel();
    const existingId = this.connectionStringId();

    if (existingId) {
      const destinations = this.#connectionStringsState.destinations();
      if (destinations.length === 0) return;

      const match = destinations.find((d) => d.ID === existingId);
      if (!match || match.BaseUrl !== targetUrl) {
        // This effect might need rethinking or we just handle it via the update methods now
        // avoiding side-effects on the signal array for now to prevent infinite loops if not careful
      }
    }
  });

  setTestState(state: TestState) {
    this.#testSignal.set(state);
  }

  #mapCommandLineArgumentsToFormViews(x: ICommandLineArgument) {
    return {
      name: x.Name as string,
      type: x.Type as ArgumentType,
      shortDescription: x.ShortDescription ?? undefined,
      longDescription: x.LongDescription ?? undefined,
      options: x.ValidValues,
    } as FormView;
  }
  encryptionOptions = computed(() => {
    const encryptionOptions = this.#sysinfo.systemInfo()?.EncryptionModules ?? [];
    return [NONE_OPTION, ...encryptionOptions];
  });

  nonSelectedOptions = computed(() => {
    return this.advancedOptions()
      .sort((a, b) => (a?.name && b?.name ? a?.name.localeCompare(b?.name) : 0))
      .filter((x) => this.selectedOptions()?.findIndex((y) => y.name === x.name) === -1);
  });

  #isCurrentSave(context: BackupSaveContext) {
    const targets = this.targetUrls();
    return (
      context === this.#saveContext &&
      context.backupId === this.backupId() &&
      context.isDraft === this.isDraft() &&
      targets.length === context.targets.length &&
      targets.every((target, index) => {
        const saved = context.targets[index];
        return (
          target.uiKey === saved.uiKey &&
          target.url === saved.url &&
          target.connectionStringId === saved.connectionStringId &&
          target.urlKey === saved.urlKey &&
          target.save === saved.save
        );
      })
    );
  }

  cancelSubmit() {
    this.#saveContext = null;
    this.#saveOperation.cancel();
  }

  submit(withoutExit = false) {
    this.#saveOperation.run(
      () => {
        // Capture what was submitted before any connection-string requests finish.
        const backup = this.#mapFormsToBackup();
        const context: BackupSaveContext = {
          backupId: this.backupId(),
          isDraft: this.isDraft(),
          targets: this.targetUrls().map((target) => ({ ...target })),
        };
        this.#saveContext = context;
        if (context.isDraft) backup.Backup.Metadata = this.backupMetadata() ? { ...this.backupMetadata() } : null;

        return this.#saveConnectionStringIfNeeded(context.targets).pipe(
          switchMap((csIds) => {
            if (!this.#isCurrentSave(context)) return EMPTY;
            const targets = context.targets;
            if (csIds.length) backup.Backup.ConnectionStringID = csIds[0] ?? undefined;
            const additional = targets.slice(1).map((target, index) => ({
              TargetUrl: target.url,
              ConnectionStringID: csIds[index + 1] ?? undefined,
              UrlKey: target.urlKey,
            }));
            if (additional.length) backup.Backup.AdditionalTargetURLs = additional;

            // Retain IDs for retry if saving the backup fails, without applying an old
            // destination's result to a replacement or a different editor.
            context.targets = targets.map((target, index) => ({
              ...target,
              connectionStringId: csIds[index] ?? target.connectionStringId,
            }));
            if (
              context.targets.some((target, index) => target.connectionStringId !== targets[index].connectionStringId)
            ) {
              this.targetUrls.set(context.targets);
              this.#connectionStringsState.reload();
            }

            return defer(() =>
              context.backupId === 'new' || !context.backupId || context.isDraft
                ? this.#dupServer.postApiV1Backups({ body: backup })
                : this.#dupServer.putApiV1BackupById({ path: { id: context.backupId }, body: backup })
            );
          }),
          catchError((error) => (this.#isCurrentSave(context) ? throwError(() => error) : EMPTY)),
          takeWhile(() => this.#isCurrentSave(context)),
          finalize(() => {
            if (this.#saveContext === context) this.#saveContext = null;
          })
        );
      },
      () => {
        if (!withoutExit) this.exit(false);
      }
    );
  }

  validateBeforeSubmit() {
    this.generalForm.markAllAsTouched();
    this.sourceDataForm.markAllAsTouched();

    const backup = this.#mapFormsToBackup();

    const isNameValid = (backup.Backup.Name ?? '').trim() !== '';
    const isSyncMode = this.generalForm.controls.operationType.value === 'Sync';
    const isUsingEncryption =
      !isSyncMode &&
      this.generalForm.controls.encryption.value !== '' &&
      this.generalForm.controls.encryption.value !== '-';
    const isPasswordValid =
      isUsingEncryption === false ||
      (this.generalForm.controls.password.value === this.generalForm.controls.repeatPassword.value &&
        this.generalForm.controls.password.value !== '');

    if (!isNameValid || !isPasswordValid /*|| this.generalForm.invalid*/) {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Validation Error`,
          message: this.isNew()
            ? $localize`Please fix the errors indicated before creating the backup.`
            : $localize`Please fix the errors indicated before saving.`,
          confirmText: $localize`OK`,
        },
      });
      return 'general';
    }

    const targetUrls = this.targetUrls();
    // Validate that at least one target URL exists and is not empty
    const hasValidDestination = targetUrls.length > 0 && targetUrls.some((t) => t.url.trim() !== '');

    if (!hasValidDestination) {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Destination required`,
          message: this.isNew()
            ? $localize`You must setup a destination before creating the backup.`
            : $localize`Please setup a destination before saving.`,
          confirmText: $localize`OK`,
        },
      });
      return 'destination';
    }

    var isSourceValid = (backup.Backup.Sources ?? []).filter((x) => x.trim() !== '').length > 0;
    if (!isSourceValid || !this.sourceDataForm.valid) {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Source data required`,
          message: this.isNew()
            ? $localize`You must setup source data before creating the backup.`
            : $localize`Please add at least one source path before saving.`,
          confirmText: $localize`OK`,
        },
      });
      return 'source';
    }

    return '';
  }

  exit(confirm: boolean) {
    if (!confirm) {
      this.cancelSubmit();
      this.#resetAllForms();
      this.#router.navigate(['/']);
      return;
    }

    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Confirm exit?`,
        message: $localize`Are you sure you want to exit?`,
        confirmText: $localize`Yes`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) return;

        this.cancelSubmit();
        this.#resetAllForms();
        this.#router.navigate(['/']);
      },
    });
  }

  mapSourceDataToForm(backup: BackupDto) {
    this.sourceDataForm.patchValue(mapBackupToSourceDataForm(backup));
  }

  mapDestinationToForm(backup: BackupDto) {
    const anyBackup = backup;
    const url = backup.TargetURL ?? '';
    const csId = (backup.ConnectionStringID === -1 ? null : backup.ConnectionStringID) ?? null;

    const firstDestination = url ? [createBackupTargetUrl(url, csId, null, !!csId)] : [];

    const additionalDestinations =
      (anyBackup.AdditionalTargetURLs as TargetUrlDto[])?.map((t) =>
        createBackupTargetUrl(t.TargetUrl!, t.ConnectionStringID ?? null, t.UrlKey ?? null, !!t.ConnectionStringID)
      ) ?? [];

    this.targetUrls.set([...firstDestination, ...additionalDestinations]);
  }

  mapGeneralToForm(backup: BackupDto) {
    this.generalForm.patchValue(mapBackupToGeneralForm(backup));
  }

  mapScheduleToForm(schedule: ScheduleDto | null) {
    if (!schedule) {
      this.scheduleType.set('disabled');
      this.scheduleFields.autoRun.set(false);

      return;
    }

    const res = this.#timespanLiteralService.fromString(schedule.Repeat) ?? null;
    const nextTime = evaluateTimeString(schedule.Time);

    this.scheduleFields.autoRun.set(true);

    // A time without a date (the server's new backup default) starts at its next occurrence
    this.scheduleFields.nextTime.date.set(nextTime.date ?? getNextRunDate(nextTime.time));
    this.scheduleFields.nextTime.time.set(nextTime.time);
    this.scheduleFields.runAgain.repeatUnit.set(res?.unit ?? 'D');
    this.scheduleFields.runAgain.repeatValue.set(res?.value ?? 1);
    this.scheduleFields.runAgain.allowedDays.mon.set(schedule.AllowedDays?.includes('mon') ?? false);
    this.scheduleFields.runAgain.allowedDays.tue.set(schedule.AllowedDays?.includes('tue') ?? false);
    this.scheduleFields.runAgain.allowedDays.wed.set(schedule.AllowedDays?.includes('wed') ?? false);
    this.scheduleFields.runAgain.allowedDays.thu.set(schedule.AllowedDays?.includes('thu') ?? false);
    this.scheduleFields.runAgain.allowedDays.fri.set(schedule.AllowedDays?.includes('fri') ?? false);
    this.scheduleFields.runAgain.allowedDays.sat.set(schedule.AllowedDays?.includes('sat') ?? false);
    this.scheduleFields.runAgain.allowedDays.sun.set(schedule.AllowedDays?.includes('sun') ?? false);

    // The date is only the first run and depends on when the form was filled, so leave it out of the match
    const withoutDate = (x: { nextTime: object }) =>
      JSON.stringify({ ...x, nextTime: { ...x.nextTime, date: undefined } });
    const test = parseRecursiveObjectOfSignals(this.scheduleFields);
    const matchPredefined = SCHEDULE_DEFAULT_OPTIONS.find((x) => withoutDate(x.data) === withoutDate(test));

    if (matchPredefined) {
      this.scheduleType.set(matchPredefined.value);
    } else {
      this.scheduleType.set('custom');
    }
  }

  mapOptionsToForms(backup: BackupDto, includeGlobalOptions: boolean = false) {
    const result = mapBackupToOptionsForm(
      backup,
      includeGlobalOptions ? this.#serverSettings.serverSettings() : undefined,
      includeGlobalOptions,
      this.isNew()
    );
    this.settings.set(result.settings);
    result.encryptionValues.forEach((value) => this.generalForm.controls.encryption.setValue(value));
    const fields = result.fields;
    if (fields.backupRetentionTime !== undefined)
      this.optionsFields.backupRetentionTime.set(fields.backupRetentionTime);
    if (fields.backupRetentionVersions !== undefined)
      this.optionsFields.backupRetentionVersions.set(fields.backupRetentionVersions);
    if (fields.backupRetentionCustom !== undefined)
      this.optionsFields.backupRetentionCustom.set(fields.backupRetentionCustom);
    this.optionsFields.backupRetention.set(fields.backupRetention);
  }

  storeMetadata(backup: BackupDto, isDraft: boolean) {
    this.backupMetadata.set(isDraft ? (backup.Metadata ?? null) : null);
  }

  getScheduleFormValue() {
    const schedule = parseRecursiveObjectOfSignals(this.scheduleFields);
    const parsedSchedule = scheduleOptionToSchedule(schedule);

    return parsedSchedule;
  }

  #mapFormsToBackup() {
    return mapBackupFormToDto({
      general: this.generalForm.value,
      sourceData: this.sourceDataForm.value,
      schedule: this.getScheduleFormValue(),
      targetUrls: this.targetUrls(),
      settings: this.mapFormsToSettings(),
    });
  }

  mapFormsToSettings(settingsIgnoreList: string[] = []) {
    return mapBackupFormToSettings(
      this.generalForm.value,
      {
        backupRetention: this.optionsFields.backupRetention(),
        backupRetentionTime: this.optionsFields.backupRetentionTime(),
        backupRetentionVersions: this.optionsFields.backupRetentionVersions(),
        backupRetentionCustom: this.optionsFields.backupRetentionCustom(),
      },
      this.settings(),
      this.isSyncMode(),
      settingsIgnoreList
    );
  }

  #saveConnectionStringIfNeeded(targetUrls: BackupTargetUrl[]): Observable<(number | null)[]> {
    if (targetUrls.length === 0) return of([]);

    const obs = targetUrls.map((t) => {
      if (t.connectionStringId) return of(t.connectionStringId);

      if (!t.save) return of(null);

      // Create new
      const targetUrl = t.url;
      const config = getConfigurationByUrl(targetUrl);
      const typeName = config?.displayName ?? 'Destination';

      // We can't easily know "existing count" for naming without reloading or checking state repeatedly.
      // A simple approach is unique name or timestamp, or just let DB handle it?
      // For now, using a generic name approach similar to before but maybe improved.
      // Actually, relying on state might be racy if we do parallel.
      // Let's do them sequentially or just accept potential naming collisions (Backend likely handles unique names or we append random?)
      // Let's stick to the existing logic but knowing it might be "Destination #N".

      const existingDestinations = this.#connectionStringsState.destinations();
      const existingCount = existingDestinations.filter((d) => d.Name?.startsWith(typeName)).length;
      // Note: this count won't increment effectively for parallel requests unless we predict it.
      // For now, let's assume sequential or just one new one usually.
      // If multiple new, they might get same name.
      // A better way: UUID or timestamp.
      const name = `${typeName} ${new Date().toISOString()}`; // Temporary uniqueness

      const requestBody = {
        Name: name,
        Description: null,
        BaseUrl: targetUrl,
      };

      return defer(() => this.#connectionStringsState.save('new', requestBody)).pipe(
        map((res) => res.Data?.ID ?? null)
      );
    });

    return forkJoin(obs);
  }

  setTargetUrl(
    targetUrl: string | null,
    resetLastTargetUrl = false,
    connectionStringId: number | null = null,
    targetUrlKey: string | null = null
  ) {
    if (resetLastTargetUrl) this.#lastTargetUrl = null;

    if (targetUrl === null) {
      this.targetUrls.set([]);
      return;
    }

    this.targetUrls.update((urls) => {
      const newUrls = [...urls];
      if (newUrls.length === 0) {
        newUrls.push(
          createBackupTargetUrl(
            targetUrl,
            connectionStringId,
            targetUrlKey,
            connectionStringId ? true : DEFAULT_SAVE_CONNECTIONSTRING
          )
        );
      } else {
        newUrls[0] = {
          ...newUrls[0],
          url: targetUrl,
          urlKey: targetUrlKey,
          connectionStringId,
          save: connectionStringId ? true : DEFAULT_SAVE_CONNECTIONSTRING,
        };
      }
      return newUrls;
    });
  }

  // Helpers for array manipulation
  addTargetUrl(url: string, connectionStringId: number | null, urlKey: string | null) {
    this.targetUrls.update((urls) => [
      ...urls,
      createBackupTargetUrl(url, connectionStringId, urlKey, connectionStringId ? true : DEFAULT_SAVE_CONNECTIONSTRING),
    ]);
  }

  updateTargetUrl(index: number, url: string, connectionStringId: number | null, urlKey: string | null) {
    this.targetUrls.update((urls) => {
      if (index < 0 || index >= urls.length) return urls;
      const newUrls = [...urls];
      const existingSave = newUrls[index].save;
      // If connectionStringId is provided (meaning we probably saved it or loaded it), save should be true?
      // If it's null, we respect existing save flag?
      // Attempting to preserve user intent.
      newUrls[index] = {
        ...newUrls[index],
        url,
        connectionStringId,
        urlKey,
        save: connectionStringId ? true : existingSave,
      };
      return newUrls;
    });
  }

  toggleSaveConnectionString(index: number) {
    this.targetUrls.update((urls) => {
      if (index < 0 || index >= urls.length) return urls;
      const newUrls = [...urls];
      newUrls[index] = { ...newUrls[index], save: !newUrls[index].save };
      return newUrls;
    });
  }

  removeTargetUrl(index: number) {
    this.targetUrls.update((urls) => urls.filter((_, i) => i !== index));
  }

  #resetAllForms() {
    this.generalForm.reset({ operationType: 'Backup' });
    this.sourceDataForm.reset();
    this.scheduleFields = SCHEDULE_FIELD_DEFAULTS();
    // this.optionsFields.remoteVolumeSize.set('50MB');
    this.optionsFields.backupRetention.set('all');
    this.settings.set([]);
    this.targetUrls.set([]);
  }
}
