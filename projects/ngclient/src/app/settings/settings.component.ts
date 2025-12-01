import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  ShipAlert,
  ShipButton,
  ShipDialogService,
  ShipDivider,
  ShipFormField,
  ShipIcon,
  ShipProgressBar,
  ShipRadio,
  ShipRangeSlider,
  ShipSelect,
  ShipToggle,
  ShipTooltip,
} from '@ship-ui/core';
import { finalize } from 'rxjs';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { LANGUAGES } from '../core/locales/locales.utility';
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
import { ConfirmDialogComponent } from '../core/components/confirm-dialog/confirm-dialog.component';
import { RelayconfigState } from '../core/states/relayconfig.state';

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
    label: $localize`System default ($value)`,
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
    ShipButton,
    ShipRadio,
    ShipRangeSlider,
    ShipProgressBar,
    ShipToggle,
    ShipTooltip,
    ShipFormField,
    ShipIcon,
    ShipDivider,
    ShipAlert,
    ShipSelect,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SettingsComponent {
  #dialog = inject(ShipDialogService);
  #layoutState = inject(LayoutState);
  #sysinfo = inject(SysinfoState);
  #serverSettingsService = inject(ServerSettingsService);
  #remoteControlState = inject(RemoteControlState);
  #relayConfigState = inject(RelayconfigState);
  #ls = inject(LOCALSTORAGE);
  #initLang = this.#ls.getItem('locale') ?? 'en-US';

  sysinfo = this.#sysinfo.systemInfo;
  isDarkMode = this.#layoutState.isDarkMode;

  editAs = signal<'list' | 'text'>('list');
  previousLang = this.#initLang;
  langCtrl = signal<string>(this.#initLang);
  powerModeCtrl = signal<string>('');
  usageStatistics = signal<UsageStatisticsType['value']>('');
  updatingUsageStatistics = signal(false);
  remoteControlStatus = this.#remoteControlState.status;
  remoteControlState = this.#remoteControlState.state;
  updatingChannel = signal(false);
  updateChannel = signal<UpdateChannel>('');
  isUsingRelay = this.#relayConfigState.relayIsEnabled;
  defaultClient = signal(this.#getDefaultClient());
  usageStatisticsDisabled = computed(() => {
    const value = this.#sysinfo.systemInfo()?.DefaultUsageReportLevel ?? '';
    return value.toLowerCase() === 'disabled';
  });

  #setReporterDefaultEffect = effect(() => {
    const value = this.#sysinfo.systemInfo()?.DefaultUsageReportLevel ?? '';
    const opts = USAGE_STATISTICS_OPTIONS;
    opts[0].label = $localize`System default (${value})`;
    this.usageStatisticsOptions.set(opts);
  });

  remoteControlTooltip =
    signal<string>($localize`Disabling console control will disable remote access to this machine from the console, but will keep the
            registration intact and allow pushing settings from the console.`);

  connectionStatusIndicatorTooltip = signal<string>(
    $localize`Hides the connection status indicator in the status bar. Useful if you are not using the remote console.`
  );

  setNewChannel(channel: UpdateChannel) {
    const prevChannel = this.updateChannel();

    this.updateChannel.set(channel);

    this.#serverSettingsService
      .setUpdateChannel(channel)
      .pipe(finalize(() => this.updatingChannel.set(false)))
      .subscribe();
  }

  allowRemoteAccess = signal(false); // if true then send 'any' if false then send 'loopback'
  allowedHostnames = signal<string>('');
  loadedAllowedHostnames = signal<string>('');
  updatingRemoteAccess = signal(false);
  updatingAllowedHosts = signal(false);
  updatingConsoleControl = signal(false);
  consoleControlDisabled = signal(false);
  hideConsoleConnectionStatus = this.#serverSettingsService.isConsoleConnectionStatusHidden;

  updateRemoteAccess() {
    const prevValue = this.allowRemoteAccess();
    const newValue = !prevValue;

    this.allowRemoteAccess.set(newValue);

    this.#serverSettingsService
      .setRemoteAccessInterface(newValue ? 'any' : 'loopback')
      .pipe(finalize(() => this.updatingRemoteAccess.set(false)))
      .subscribe();
  }

  updateAllowedHostnames() {
    const allowedHostnames = this.allowedHostnames();

    this.updatingAllowedHosts.set(true);

    this.#serverSettingsService
      .setRemoteAccessAllowedHostnames(allowedHostnames)
      .pipe(finalize(() => this.updatingAllowedHosts.set(false)))
      .subscribe();
  }

  toggleConsoleControl() {
    const prevValue = this.consoleControlDisabled();
    const newValue = !prevValue;
    this.updatingConsoleControl.set(true);

    this.#serverSettingsService
      .setDisableConsoleControl(newValue)
      .pipe(finalize(() => this.updatingConsoleControl.set(false)))
      .subscribe();
  }

  updatingDisableTrayIconLogin = signal(false);
  disableTrayIconLogin = signal(false);

  saveDisableTrayIconLogin() {
    const prevValue = this.disableTrayIconLogin();
    const newValue = !prevValue;

    this.updatingDisableTrayIconLogin.set(true);
    this.#serverSettingsService
      .setDisableTrayIconLogin(newValue)
      .pipe(finalize(() => this.updatingDisableTrayIconLogin.set(false)))
      .subscribe();
  }

  updatingHideConsoleConnectionStatus = signal(false);

  saveHideConsoleConnectionStatus() {
    const prevValue = this.hideConsoleConnectionStatus();
    const newValue = !prevValue;

    this.updatingHideConsoleConnectionStatus.set(true);

    this.#serverSettingsService
      .setHideConsoleConnectionStatus(newValue)
      .pipe(finalize(() => this.updatingHideConsoleConnectionStatus.set(false)))
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

    this.#serverSettingsService
      .setRemoteAccessPassword(this.passphrase())
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

  powerModeOptions = computed(() => {
    const sysinfo = this.#sysinfo.systemInfo();
    // If the only providers are default and none, don't show the options
    if (
      !sysinfo?.PowerModeProviders ||
      sysinfo.PowerModeProviders.filter((x) => x !== '' && x !== 'None').length == 0
    ) {
      return [];
    }
    return sysinfo!.PowerModeProviders!.map((x) => ({
      value: x == '' ? 'default' : x,
      label: x === '' ? $localize`Default` : x,
    }));
  });

  usageStatisticsOptions = signal(USAGE_STATISTICS_OPTIONS);

  timeTypeOptions = signal(TIME_OPTIONS);
  timeType = signal<TimeTypes>('none');
  timeValue = debounceSignal<number>(0, 300);
  timeRange = computed(() => {
    const timeType = this.timeType();

    return timeType === 'h' ? [1, 24] : [1, 60];
  });

  startupDelayString = computed(() => {
    const timeValue = this.timeValue();
    const timeType = this.timeType();

    if (timeType === 'none' || timeValue === 0) return '';

    return `${timeValue}${timeType}`;
  });

  startupDelayEffect = effect(() => {
    const delay = this.startupDelayString();
    const loaded = this.#serverSettingsService.serverSettings();
    if (!loaded) return;

    const currentDelay = loaded['startup-delay'] as string;
    if (delay === currentDelay) return;

    this.#serverSettingsService.setStartupDelay(delay).subscribe();
  });

  updateLocale(newLocale: string) {
    if (!newLocale || newLocale === '' || newLocale === this.previousLang) return;

    this.#ls.setItem('locale', newLocale);
    window.location.reload();
  }

  updateTimeType(newTimeType: string) {
    const prevTimeType = this.timeType();

    if (prevTimeType === 'none') {
      this.timeValue.set(1);
    }

    this.timeType.set(newTimeType);
  }

  updateUsageStatistics(newUsageStatistics: string) {
    const previousUsageStatistics = this.usageStatistics();

    if (!newUsageStatistics || newUsageStatistics === '' || newUsageStatistics === previousUsageStatistics) return;

    this.usageStatistics.set(newUsageStatistics);
    this.updatingUsageStatistics.set(true);

    this.#serverSettingsService.setUsageReporterLevel(newUsageStatistics).subscribe();
  }

  updatePowerMode(newPowerMode: string) {
    const previousPowerMode = this.powerModeCtrl();
    if (previousPowerMode === newPowerMode) return;
    if (newPowerMode === 'default') newPowerMode = '';

    this.#serverSettingsService.setPowerModeProvider(newPowerMode).subscribe();
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
    this.consoleControlDisabled.set(serverSettings['disable-console-control'] === 'True' ? true : false);
    this.usageStatistics.set(
      serverSettings['usage-reporter-level'] === '' ? 'none' : serverSettings['usage-reporter-level']
    );

    this.timeType.set(startupDelay == '' ? 'none' : timeUnitOptions.includes(unit) ? unit : 'none');
    this.timeValue.set(startupDelay == '' ? 0 : parseInt(timeStr));
    const powerModeValue =
      serverSettings['power-mode-provider'] === '' || serverSettings['power-mode-provider'] == null
        ? 'default'
        : serverSettings['power-mode-provider'];
    this.powerModeCtrl.set(powerModeValue);
  });

  setDarkMode() {
    this.#layoutState.setDarkMode();
  }

  setLightMode() {
    this.#layoutState.setLightMode();
  }

  changeDefaultClientTo(client: 'ngclient' | 'ngax') {
    if (this.defaultClient() === client) return;

    if (client === 'ngax') {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Use legacy UI by default`,
          message: $localize`Are you sure you want to use the legacy user interface by default? This is not recommended unless you have a specific reason.`,
          confirmText: $localize`Use legacy UI by default`,
          cancelText: $localize`Cancel`,
        },
        closed: (res) => {
          if (!res) return;
          window.location.href = '/ngax';
          this.#setClientDefault(client);
        },
      });
    } else {
      this.#setClientDefault(client);
    }
  }

  openLegacyUI() {
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Open legacy UI`,
        message: $localize`Are you sure you want to open the legacy user interface? This is not recommended unless you have a specific reason.`,
        confirmText: $localize`Open legacy UI`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) return;
        window.open('/ngax', '_blank');
      },
    });
  }

  #setClientDefault(client: 'ngclient' | 'ngax') {
    var d = new Date();
    d.setTime(d.getTime() + 90 * 24 * 60 * 60 * 1000);

    document.cookie = 'default-client=' + client + '; expires=' + d.toUTCString() + '; path=/';
    this.defaultClient.set(client);
  }

  #getDefaultClient(): 'ngclient' | 'ngax' {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.startsWith('default-client=')) {
        return cookie.substring('default-client='.length) as 'ngclient' | 'ngax';
      }
    }
    return 'ngclient';
  }
}
