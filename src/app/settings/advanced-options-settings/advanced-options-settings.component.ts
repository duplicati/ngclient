import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { SparkleAlertComponent, SparkleButtonComponent, SparkleIconComponent } from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { BackupState } from '../../backup/backup.state';
import { OptionsListComponent } from '../../backup/options/options-list/options-list.component';
import { DuplicatiServerService } from '../../core/openapi';
import { ServerSettingsService } from '../server-settings.service';

const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

@Component({
  selector: 'app-advanced-options-settings',
  imports: [
    ReactiveFormsModule,
    OptionsListComponent,
    SparkleButtonComponent,
    SparkleIconComponent,
    SparkleAlertComponent,
  ],
  templateUrl: './advanced-options-settings.component.html',
  styleUrl: './advanced-options-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BackupState],
})
export default class AdvancedOptionsSettingsComponent {
  #backupState = inject(BackupState);
  #serverSettingsService = inject(ServerSettingsService);
  #dupServer = inject(DuplicatiServerService);
  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  settings = this.#backupState.settings;
  isSubmitting = signal(false);
  isLoadingOptions = signal(true);
  saved = signal(false);
  sizeOptions = signal(SIZE_OPTIONS);

  lastRecievedServerSettings = signal<{ [key: string]: string }>({});
  serverSettingsEffect = effect(() => {
    const serverSettings = this.#serverSettingsService.serverSettings();

    if (serverSettings === undefined) return;

    this.lastRecievedServerSettings.set(serverSettings);
    this.isLoadingOptions.set(true);

    const serverSettingEntries = Object.entries(serverSettings);
    serverSettingEntries.forEach(([key, value], index) => {
      if (key.startsWith('--')) {
        const name = key.replace('--', '');

        this.settings.update((x) => {
          if (x.some((option) => option.Name === name)) return x;

          x.push({
            Name: name,
            Value: value,
          });

          return x;
        });
      }

      if (index === serverSettingEntries.length - 1) {
        this.isLoadingOptions.set(false);
      }
    });
  });

  submit() {
    this.isSubmitting.set(true);

    const settings = this.settings();
    const lastRecievedServerSettings = this.lastRecievedServerSettings();
    const currentSettingNames = settings.map((s) => s.Name!);
    const lastSettingKeys = Object.keys(lastRecievedServerSettings);
    const removedSettings = lastSettingKeys.filter((key) => !currentSettingNames.includes(key.replace('--', '')));
    const reduced = settings.reduce(
      (acc, curr) => {
        acc[`--${curr.Name!}`] = curr.Value!;
        return acc;
      },
      {} as { [key: string]: string | null }
    );

    removedSettings.forEach((key) => {
      reduced[key] = null;
    });

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: reduced,
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.#serverSettingsService.refreshServerSettings();
          this.saved.set(true);

          setTimeout(() => {
            this.saved.set(false);
          }, 3000);
        },
      });
  }
}
