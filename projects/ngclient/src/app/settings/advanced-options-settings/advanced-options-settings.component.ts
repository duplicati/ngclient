import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ShipAlertComponent, ShipButtonComponent, ShipIconComponent } from '@ship-ui/core';
import { finalize } from 'rxjs';
import { OptionsListComponent } from '../../backup/options/options-list/options-list.component';
import { DuplicatiServer, SettingDto } from '../../core/openapi';
import { ServerSettingsService } from '../server-settings.service';

@Component({
  selector: 'app-advanced-options-settings',
  imports: [ReactiveFormsModule, OptionsListComponent, ShipButtonComponent, ShipIconComponent, ShipAlertComponent],
  templateUrl: './advanced-options-settings.component.html',
  styleUrl: './advanced-options-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AdvancedOptionsSettingsComponent {
  #serverSettingsService = inject(ServerSettingsService);
  #dupServer = inject(DuplicatiServer);
  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  settings = signal<SettingDto[]>([]);
  isSubmitting = signal(false);
  isLoadingOptions = signal(true);
  saved = signal(false);

  lastRecievedServerSettings = signal<{ [key: string]: string }>({});
  serverSettingsEffect = effect(() => {
    const serverSettings = this.#serverSettingsService.serverSettings();

    if (serverSettings === undefined) return;

    this.lastRecievedServerSettings.set(serverSettings);
    this.isLoadingOptions.set(true);

    const serverSettingEntries = Object.entries(serverSettings);
    serverSettingEntries.forEach(([key, value], index) => {
      if (key.startsWith('--')) {
        const name = key.substring(2);

        this.settings.update((x) => {
          if (x.some((option) => option.Name === name)) return x;

          x.push({
            Name: name,
            Value: value,
          } as any);

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
    const lastSettingKeys = Object.keys(lastRecievedServerSettings).filter((key) => key.startsWith('--'));
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
