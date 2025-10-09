import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  ShipAlertComponent,
  ShipButtonComponent,
  ShipDividerComponent,
  ShipFormFieldComponent,
  ShipIconComponent,
  ShipProgressBarComponent,
  ShipRadioComponent,
  ShipRangeSliderComponent,
  ShipSelectComponent,
  ShipToggleComponent,
  ShipTooltipDirective,
} from '@ship-ui/core';
import { catchError, finalize, of } from 'rxjs';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { LANGUAGES } from '../core/locales/locales.utility';
import { DuplicatiServer } from '../core/openapi';
import { LOCALSTORAGE } from '../core/services/localstorage.token';
import { SysinfoState } from '../core/states/sysinfo.state';
import { LayoutState } from '../layout/layout.state';
import AdvancedOptionsSettingsComponent from './advanced-options-settings/advanced-options-settings.component';
import { RemoteControlComponent } from './remote-control/remote-control.component';
import { RemoteControlState } from './remote-control/remote-control.state';
import { ServerSettingsService } from './server-settings.service';

import { CreateSignalOptions, WritableSignal } from '@angular/core';
import { SIGNAL, SignalGetter, signalSetFn, signalUpdateFn } from '@angular/core/primitives/signals';
import { createSignal } from 'ngxtension/create-signal';

export function debounceSignal<T>(initialValue: T, time: number, options?: CreateSignalOptions<T>): WritableSignal<T> {
  const signalFn = createSignal(initialValue) as SignalGetter<T> & WritableSignal<T>;
  const node = signalFn[SIGNAL];
  if (options?.equal) {
    node.equal = options.equal;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  signalFn.set = (newValue: T) => {
    clearTimeout(timeoutId);

    timeoutId = setTimeout(() => signalSetFn(node, newValue), time);
  };

  signalFn.update = (updateFn: (value: T) => T) => {
    clearTimeout(timeoutId);

    timeoutId = setTimeout(() => signalUpdateFn(node, updateFn), time);
  };

  return signalFn;
}

type UpdateChannel = '' | 'stable' | 'beta' | 'experimental' | 'canary';

const TIME_OPTIONS = [
  {
    value: 'none',
    label: $localize`None`,
  },
  {
    value: 's',
    label: $localize`Seconds`,
  },
  {
    value: 'm',
    label: $localize`Minutes`,
  },
  {
    value: 'h',
    label: $localize`Hours`,
  },
];

type TimeTypes = (typeof TIME_OPTIONS)[number]['value'];

const USAGE_STATISTICS_OPTIONS = [
  {
    value: 'none',
    label: $localize`System default (information)`,
  },
  {
    value: 'information',
    label: $localize`Usage statistics, warnings, errors, and crashes`,
  },
  {
    value: 'warning',
    label: $localize`Warnings, errors and crashes`,
  },
  {
    value: 'error',
    label: $localize`Errors and crashes`,
  },
  {
    value: 'crash',
    label: $localize`Crashes only`,
  },
  {
    value: 'disabled',
    label: $localize`None / disabled`,
  },
];

type UsageStatisticsType = (typeof USAGE_STATISTICS_OPTIONS)[number];

@Component({
  selector: 'app-settings',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    StatusBarComponent,
    RemoteControlComponent,
    AdvancedOptionsSettingsComponent,
    ShipButtonComponent,
    ShipRadioComponent,
    ShipRangeSliderComponent,
    ShipProgressBarComponent,
    ShipToggleComponent,
    ShipTooltipDirective,
    ShipFormFieldComponent,
    ShipIconComponent,
    ShipDividerComponent,
    ShipAlertComponent,
    ShipSelectComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SettingsComponent {
  #layoutState = inject(LayoutState);
  #sysinfo = inject(SysinfoState);
  #dupServer = inject(DuplicatiServer);
  #serverSettingsService = inject(ServerSettingsService);
  #remoteControlState = inject(RemoteControlState);
  #ls = inject(LOCALSTORAGE);
  #initLang = this.#ls.getItem('locale') ?? 'en-US';

  sysinfo = this.#sysinfo.systemInfo;
  isDarkMode = this.#layoutState.isDarkMode;

  editAs = signal<'list' | 'text'>('list');
  previousLang = this.#initLang;
  langCtrl = signal<string>(this.#initLang);
  usageStatistics = signal<UsageStatisticsType['value']>('');
  updatingUsageStatistics = signal(false);
  remoteControlStatus = this.#remoteControlState.status;
  updatingChannel = signal(false);
  updateChannel = signal<UpdateChannel>('');

  setNewChannel(channel: UpdateChannel) {
    const prevChannel = this.updateChannel();

    this.updateChannel.set(channel);

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'update-channel': channel,
        },
      })
      .pipe(
        finalize(() => this.updatingChannel.set(false)),
        catchError(() => {
          this.updateChannel.set(prevChannel);
          return of(null);
        })
      )
      .subscribe();
  }

  allowRemoteAccess = signal(false); // if true then send 'any' if false then send 'loopback'
  allowedHostnames = signal<string>('');
  loadedAllowedHostnames = signal<string>('');
  updatingRemoteAccess = signal(false);
  updatingAllowedHosts = signal(false);

  updateRemoteAccess() {
    const prevValue = this.allowRemoteAccess();
    const newValue = !prevValue;

    this.allowRemoteAccess.set(newValue);

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'server-listen-interface': newValue ? 'any' : 'loopback',
        },
      })
      .pipe(
        finalize(() => this.updatingRemoteAccess.set(false)),
        catchError(() => {
          this.allowRemoteAccess.set(prevValue);
          return of(null);
        })
      )
      .subscribe();
  }

  updateAllowedHostnames() {
    const loadedAllowedHostnames = this.loadedAllowedHostnames();
    const allowedHostnames = this.allowedHostnames();

    this.updatingAllowedHosts.set(true);

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'server-listen-interface': 'any',
          'allowed-hostnames': allowedHostnames,
        },
      })
      .pipe(
        finalize(() => this.updatingAllowedHosts.set(false)),
        catchError(() => {
          this.allowedHostnames.set(loadedAllowedHostnames);
          return of(null);
        })
      )
      .subscribe();
  }

  updatingDisableTrayIconLogin = signal(false);
  disableTrayIconLogin = signal(false);

  saveDisableTrayIconLogin() {
    const prevValue = this.disableTrayIconLogin();
    const newValue = !prevValue;

    this.updatingDisableTrayIconLogin.set(true);
    this.disableTrayIconLogin.set(newValue);

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'disable-tray-icon-login': newValue ? 'True' : 'False',
        },
      })
      .pipe(
        finalize(() => this.updatingDisableTrayIconLogin.set(false)),
        catchError(() => {
          this.disableTrayIconLogin.set(prevValue);
          return of(null);
        })
      )
      .subscribe();
  }

  showPassphraseForm = signal(false);
  isUpdating = signal(false);
  passphrase = signal('');
  repeatPassphrase = signal('');
  passwordUpdated = signal(false);

  updatePassphrase() {
    if (this.passphrase() !== this.repeatPassphrase()) return;

    this.isUpdating.set(true);

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'server-passphrase': this.passphrase(),
        },
      })
      .pipe(finalize(() => this.isUpdating.set(false)))
      .subscribe({
        next: () => {
          this.showPassphraseForm.set(false);
          this.passwordUpdated.set(true);

          setTimeout(() => {
            this.passwordUpdated.set(false);
          }, 3000);
        },
      });
  }

  openPassphraseForm() {
    this.showPassphraseForm.set(true);
  }

  cancelPasswordChange() {
    this.showPassphraseForm.set(false);
  }

  languageOptions = signal(LANGUAGES);
  usageStatisticsOptions = signal(USAGE_STATISTICS_OPTIONS);

  timeTypeOptions = signal(TIME_OPTIONS);
  timeType = signal<TimeTypes>('none');
  timeValue = debounceSignal<number>(0, 300);
  timeRange = computed(() => {
    const timeType = this.timeType();

    return timeType === 'h' ? [0, 24] : [0, 60];
  });

  timeValueEffect = effect(() => {
    const _ = this.timeValue();
    // Prevent triggering a patch request when the component is initializing
    const loaded = this.#serverSettingsService.serverSettings();
    if (!loaded || (loaded['startup-delay'] === '' && this.timeType() === 'none')) return;

    this.updateStartupDelay();
  });

  updateLocale(newLocale: string) {
    if (!newLocale || newLocale === '' || newLocale === this.previousLang) return;

    this.#ls.setItem('locale', newLocale);
    window.location.reload();
  }

  updateStartupDelay() {
    const timeValue = this.timeValue();
    const timeType = this.timeType();

    let startupDelay = '';

    if (timeType !== 'none' && timeValue !== 0) {
      startupDelay = `${timeValue}${timeType}`;
    }

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'startup-delay': startupDelay,
        },
      })
      .subscribe();
  }

  updateTimeType(newTimeType: string) {
    const prevTimeType = this.timeType();

    if (prevTimeType === 'none') {
      this.timeValue.set(0);
    }

    this.timeType.set(newTimeType);
  }

  updateUsageStatistics(newUsageStatistics: string) {
    const previousUsageStatistics = this.usageStatistics();

    if (!newUsageStatistics || newUsageStatistics === '' || newUsageStatistics === previousUsageStatistics) return;

    this.usageStatistics.set(newUsageStatistics);
    this.updatingUsageStatistics.set(true);

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'usage-reporter-level': this.usageStatistics() === 'none' ? '' : this.usageStatistics(),
        },
      })
      .pipe(
        finalize(() => this.updatingUsageStatistics.set(false)),
        catchError(() => {
          this.usageStatistics.set(previousUsageStatistics);
          return of(null);
        })
      )
      .subscribe();
  }

  serverSettingsEffect = effect(() => {
    const serverSettings = this.#serverSettingsService.serverSettings();

    if (serverSettings === undefined) return;

    const startupDelay = serverSettings['startup-delay'] as string;
    const unit = startupDelay.slice(-1);
    const timeStr = startupDelay.slice(0, -1);
    const timeUnitOptions = ['s', 'm', 'h'];

    this.disableTrayIconLogin.set(serverSettings['disable-tray-icon-login'] === 'False' ? false : true);
    this.updateChannel.set(serverSettings['update-channel'] as UpdateChannel);
    this.allowRemoteAccess.set(serverSettings['server-listen-interface'] === 'any');
    this.allowedHostnames.set(serverSettings['allowed-hostnames']);
    this.loadedAllowedHostnames.set(serverSettings['allowed-hostnames']);
    this.usageStatistics.set(
      serverSettings['usage-reporter-level'] === '' ? 'none' : serverSettings['usage-reporter-level']
    );

    this.timeType.set(startupDelay == '' ? 'none' : timeUnitOptions.includes(unit) ? unit : 'none');
    this.timeValue.set(startupDelay == '' ? 0 : parseInt(timeStr));
  });

  setDarkMode() {
    this.#layoutState.setDarkMode();
  }

  setLightMode() {
    this.#layoutState.setLightMode();
  }
}
