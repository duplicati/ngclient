import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  SparkleAlertComponent,
  SparkleButtonComponent,
  SparkleDividerComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleOptionComponent,
  SparkleProgressBarComponent,
  SparkleRadioComponent,
  SparkleSelectComponent,
  SparkleToggleComponent,
  SparkleTooltipComponent,
} from '@sparkle-ui/core';
import { derivedFrom } from 'ngxtension/derived-from';
import { catchError, finalize, map, of, pipe, startWith } from 'rxjs';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { LANGUAGES } from '../core/locales/locales.utility';
import { DuplicatiServerService } from '../core/openapi';
import { LOCALSTORAGE } from '../core/services/localstorage.token';
import { SysinfoState } from '../core/states/sysinfo.state';
import { LayoutState } from '../layout/layout.state';
import AdvancedOptionsSettingsComponent from './advanced-options-settings/advanced-options-settings.component';
import { RemoteControlComponent } from './remote-control/remote-control.component';
import { RemoteControlState } from './remote-control/remote-control.state';
import { ServerSettingsService } from './server-settings.service';

const fb = new FormBuilder();

type UpdateChannel = '' | 'stable' | 'beta' | 'experimental' | 'canary';

const TIME_OPTIONS = [
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
] as const;

type TimeTypes = (typeof TIME_OPTIONS)[number]['value'];

const USAGE_STATISTICS_OPTIONS = [
  {
    value: '',
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
    value: 'none',
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
    SparkleOptionComponent,
    SparkleButtonComponent,
    SparkleRadioComponent,
    SparkleSelectComponent,
    SparkleProgressBarComponent,
    SparkleToggleComponent,
    SparkleTooltipComponent,
    SparkleFormFieldComponent,
    SparkleIconComponent,
    SparkleDividerComponent,
    SparkleAlertComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SettingsComponent {
  #layoutState = inject(LayoutState);
  #sysinfo = inject(SysinfoState);
  #dupServer = inject(DuplicatiServerService);
  #serverSettingsService = inject(ServerSettingsService);
  #remoteControlState = inject(RemoteControlState);
  #ls = inject(LOCALSTORAGE);
  #initLang = this.#ls.getItem('locale') ?? 'en-US';

  sysinfo = this.#sysinfo.systemInfo;
  isDarkMode = this.#layoutState.isDarkMode;

  editAs = signal<'list' | 'text'>('list');
  langCtrl = signal<string>(this.#initLang);

  remoteControlStatus = this.#remoteControlState.status;

  settingsForm = fb.group({
    pauseSettings: fb.group({
      time: fb.control<number>(0),
      timeType: fb.control<TimeTypes>('s'),
    }),
    usageStatistics: fb.control<UsageStatisticsType['value']>(''),
  });

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
        this.#serverSettingsService.withRefresh(),
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

    if (!newValue) {
      this.#dupServer
        .patchApiV1Serversettings({
          requestBody: {
            'server-listen-interface': newValue ? 'any' : 'loopback',
          },
        })
        .pipe(
          this.#serverSettingsService.withRefresh(),
          finalize(() => this.updatingRemoteAccess.set(false)),
          catchError(() => {
            this.allowRemoteAccess.set(prevValue);
            return of(null);
          })
        )
        .subscribe();
    }
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
        this.#serverSettingsService.withRefresh(),
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
        this.#serverSettingsService.withRefresh(),
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
      .pipe(
        this.#serverSettingsService.withRefresh(),
        finalize(() => this.isUpdating.set(false))
      )
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

  get pauseSettings() {
    return this.settingsForm.controls.pauseSettings;
  }

  languageOptions = computed(() => {
    const searchValue = this.langCtrl();

    return searchValue ? LANGUAGES.filter((x) => x.label.toLowerCase().includes(searchValue.toLowerCase())) : LANGUAGES;
  });

  usageStatisticsOptions = signal(USAGE_STATISTICS_OPTIONS);

  timeTypeOptions = signal(TIME_OPTIONS);
  timeOptions = derivedFrom(
    [
      this.pauseSettings.controls.timeType.valueChanges.pipe(startWith('s')),
      this.pauseSettings.controls.time.valueChanges.pipe(startWith(null)),
    ],
    pipe(
      map(([timeType, time]) => {
        const timeOptions = this.#createTimeOptions(timeType as TimeTypes);

        return time !== null ? timeOptions.filter((x) => x.toString().includes(time.toString())) : timeOptions;
      }),
      startWith([])
    )
  );

  #createTimeOptions(type: TimeTypes) {
    const typeLen = type === 'h' ? 25 : 61;

    return new Array(typeLen).fill(0).map((_, i) => i);
  }

  saveLocale(x: string) {
    this.#ls.setItem('locale', x);
    window.location.reload();
  }

  submit() {
    // var patchdata = {
    //     'server-passphrase': $scope.changeServerPassword ? $scope.remotePassword : '',
    //     'allowed-hostnames': $scope.remoteHostnames,
    //     'server-listen-interface': $scope.allowRemoteAccess ? 'any' : 'loopback',
    //     'startup-delay': $scope.startupDelayDurationValue + '' + $scope.startupDelayDurationMultiplier,
    //     'update-channel': $scope.updateChannel,
    //     'usage-reporter-level': $scope.usageReporterLevel,
    //     'disable-tray-icon-login': $scope.disableTrayIconLogin
    // };

    const startupDelay = `${this.pauseSettings.controls.time.value}${this.pauseSettings.controls.timeType.value}`;

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'usage-reporter-level': this.settingsForm.controls.usageStatistics.value,
          'startup-delay': startupDelay === '0s' ? '' : startupDelay,
        },
      })
      .pipe(this.#serverSettingsService.withRefresh())
      .subscribe();
  }

  serverSettingsEffect = effect(() => {
    const serverSettings = this.#serverSettingsService.serverSettings();

    if (serverSettings === undefined) return;

    const startupDelay = serverSettings['startup-delay'] as string;
    const unit = startupDelay.slice(-1);
    const timeStr = startupDelay.slice(0, -1);
    const timeUnitOptions = ['s', 'm', 'h'];

    this.settingsForm.patchValue({
      pauseSettings: {
        time: parseInt(timeStr == '' ? '0' : timeStr),
        timeType: (timeUnitOptions.includes(unit) ? unit : 's') as TimeTypes,
      },
      usageStatistics: serverSettings['usage-reporter-level'],
    });

    this.disableTrayIconLogin.set(serverSettings['disable-tray-icon-login'] === 'False' ? false : true);
    this.updateChannel.set(serverSettings['update-channel'] as UpdateChannel);
    this.allowRemoteAccess.set(serverSettings['server-listen-interface'] === 'any');
    this.allowedHostnames.set(serverSettings['allowed-hostnames']);
    this.loadedAllowedHostnames.set(serverSettings['allowed-hostnames']);
  });

  languageDisplay() {
    const _self = this;

    return () => {
      const x = _self.langCtrl();

      if (!x) return null;

      return LANGUAGES.find((y) => y.value === x)?.label ?? null;
    };
  }

  typeDisplay() {
    const _self = this;

    return () => {
      const x = _self.settingsForm.value.pauseSettings?.timeType;
      if (x === null || x === undefined) return null;

      return TIME_OPTIONS.find((y) => y.value === x)?.label ?? null;
    };
  }

  usageDisplay() {
    const _self = this;

    return () => {
      const x = _self.settingsForm.value.usageStatistics;
      if (x === null || x === undefined) return null;

      return USAGE_STATISTICS_OPTIONS.find((y) => y.value === x)?.label ?? null;
    };
  }

  setDarkMode() {
    this.#layoutState.setDarkMode();
  }

  setLightMode() {
    this.#layoutState.setLightMode();
  }
}
