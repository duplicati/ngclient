import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  SparkleButtonComponent,
  SparkleFormFieldComponent,
  SparkleRadioComponent,
  SparkleSelectComponent,
} from '@sparkle-ui/core';
import { derivedFrom } from 'ngxtension/derived-from';
import { map, pipe, startWith } from 'rxjs';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { LANGUAGES } from '../core/locales/locales.utility';
import { DuplicatiServerService, RemoteControlStatusOutput } from '../core/openapi';
import { LOCALSTORAGE } from '../core/services/localstorage.token';
import { SysinfoState } from '../core/states/sysinfo.state';
import { LayoutState } from '../layout/layout.state';

const fb = new FormBuilder();

type UpdateChannel = '' | 'stable' | 'beta' | 'experimental' | 'canary';
// type TimeTypes = 'Hours' | 'Minutes' | 'Seconds';

// const TimeTypeMap: { [key: string]: TimeTypes } = {
//   h: 'Hours',
//   m: 'Minutes',
//   s: 'Seconds',
// };

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

type LangType = (typeof LANGUAGES)[number];

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
type RemoteControlState =
  | 'connected'
  | 'registered'
  | 'registering'
  | 'registeringfaulted'
  | 'enabled'
  | 'disabled'
  | 'inactive'
  | 'unknown';

type Timeout = ReturnType<typeof setTimeout>;

@Component({
  selector: 'app-settings',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    StatusBarComponent,
    SparkleButtonComponent,
    SparkleRadioComponent,
    SparkleFormFieldComponent,
    SparkleSelectComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SettingsComponent {
  #layoutState = inject(LayoutState);
  #sysinfo = inject(SysinfoState);
  #dupServer = inject(DuplicatiServerService);
  #ls = inject(LOCALSTORAGE);
  #initLang = this.#ls.getItem('locale') ?? 'en-US';

  sysinfo = this.#sysinfo.systemInfo;
  isDarkMode = this.#layoutState.isDarkMode;

  editAs = signal<'list' | 'text'>('list');
  langCtrl = signal<string>(this.#initLang);

  settingsForm = fb.group({
    pauseSettings: fb.group({
      time: fb.control<number>(0),
      timeType: fb.control<TimeTypes>('s'),
    }),
    usageStatistics: fb.control<UsageStatisticsType['value']>(''),
    updateChannel: fb.control<UpdateChannel>(''),
    remoteControlRegisterUrl: fb.control<string>(''),
  });
  remoteControlState = signal<RemoteControlState>('unknown');
  remoteControlClaimUrl = signal<string | null>(null);

  sysInfoEffect = effect(() => {
    this.settingsForm.controls.remoteControlRegisterUrl.patchValue(this.sysinfo()?.RemoteControlRegistrationUrl ?? '');
  });

  get pauseSettings() {
    return this.settingsForm.controls.pauseSettings;
  }

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

  languageOptions = computed(() => {
    const searchValue = this.langCtrl();

    return searchValue ? LANGUAGES.filter((x) => x.label.toLowerCase().includes(searchValue.toLowerCase())) : LANGUAGES;
  });

  usageStatisticsOptions = signal(USAGE_STATISTICS_OPTIONS);

  ngOnInit() {
    this.refreshRemoteControlStatus();
    this.getServerSettings();
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
          'update-channel': this.settingsForm.controls.updateChannel.value,
        },
      })
      .subscribe({
        next: (res) => {
          console.log('res', res);
        },
        error: (err) => {
          console.error('err', err);
        },
      });
  }

  getServerSettings() {
    return this.#dupServer.getApiV1Serversettings().subscribe({
      next: (res) => {
        const startupDelay = res['startup-delay'] as string;
        const unit = startupDelay.slice(-1);
        const timeStr = startupDelay.slice(0, -1);
        const timeUnitOptions = ['s', 'm', 'h'];

        this.settingsForm.patchValue({
          pauseSettings: {
            time: parseInt(timeStr == '' ? '0' : timeStr),
            timeType: (timeUnitOptions.includes(unit) ? unit : 's') as TimeTypes,
          },
          usageStatistics: res['usage-reporter-level'],
          updateChannel: res['update-channel'] as UpdateChannel,
        });
      },
    });
  }

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

  #createTimeOptions(type: TimeTypes) {
    const typeLen = type === 'h' ? 25 : 61;

    return new Array(typeLen).fill(0).map((_, i) => i);
  }

  repeatRegisterTimer: Timeout | null = null;

  #mapRemoteControlStatus(data: RemoteControlStatusOutput) {
    // remoteControlEnabled = data.IsEnabled;
    // remoteControlCanEnable = data.CanEnable;
    // remoteControlConnected = data.IsConnected;
    // remoteControlIsRegistering = data.IsRegistering;
    // remoteControlIsRegisteringFaulted = data.IsRegisteringFaulted;
    // remoteControlIsRegisteringCompleted = data.IsRegisteringCompleted;

    data.RegistrationUrl && this.remoteControlClaimUrl.set(data.RegistrationUrl);

    console.log(data);

    if (data.IsConnected) {
      this.remoteControlState.set('connected');
    } else if (data.IsEnabled) {
      this.remoteControlState.set('enabled');
    } else if (data.CanEnable) {
      this.remoteControlState.set('disabled');
    } else if (data.IsRegisteringFaulted) {
      this.remoteControlState.set('registeringfaulted');
    } else if (data.IsRegistering) {
      if (data.RegistrationUrl != null && data.RegistrationUrl.trim().length > 0) {
        this.remoteControlState.set('registered');
      } else {
        this.remoteControlState.set('registering');
      }
    } else {
      this.remoteControlState.set('inactive');
    }

    const currentRemoteControlState = this.remoteControlState();

    console.log(currentRemoteControlState);

    // Stop any existing timer
    if (this.repeatRegisterTimer !== null) {
      clearTimeout(this.repeatRegisterTimer);
      this.repeatRegisterTimer = null;
    }

    // If we are registering, we need to keep checking until the registration is claimed
    if (currentRemoteControlState === 'registering') {
      this.repeatRegisterTimer = setTimeout(() => {
        this.#dupServer.postApiV1RemotecontrolRegister({ requestBody: { RegistrationUrl: '' } }).subscribe({
          next: (res) => {
            this.#mapRemoteControlStatus(res);
          },
          error: (err) => {
            this.#mapRemoteControlError(err);
          },
        });

        // AppService.post('/remotecontrol/register', { RegistrationUrl: '' }).then(
        //   function (data) {
        //     this.#mapRemoteControlStatus(data.data);
        //   },
        //   () => {
        //     AppService.get('/remotecontrol/status').then(
        //       function (data) {
        //         this.#mapRemoteControlStatus(data.data);
        //       },
        //       () => {}
        //     );
        //   }
        // );
      }, 5000);
    }

    // If we are enabled, poll to see if we become connected
    // If we are registered, poll to see if we become disabled
    if (currentRemoteControlState === 'enabled' || currentRemoteControlState === 'registered') {
      this.repeatRegisterTimer = setTimeout(() => {
        this.#dupServer.getApiV1RemotecontrolStatus().subscribe({
          next: (res) => {
            this.#mapRemoteControlStatus(res);
          },
          error: (err) => {
            this.#mapRemoteControlError(err);
          },
        });
      }, 5000);
    }

    // If we can enable and are registering, there must be a lingering registration
    if (data.IsRegistering && data.CanEnable) {
      this.#dupServer.deleteApiV1RemotecontrolRegister().subscribe({
        next: (res) => {
          this.#mapRemoteControlStatus(res);
        },
      });
    }
  }

  #mapRemoteControlError(data: any) {
    // AppUtils.connectionError(data);

    this.#dupServer.getApiV1RemotecontrolStatus().subscribe({
      next: (res) => {
        this.#mapRemoteControlStatus(res);
      },
    });
  }

  refreshRemoteControlStatus() {
    this.#dupServer.getApiV1RemotecontrolStatus().subscribe({
      next: (res) => {
        this.#mapRemoteControlStatus(res);
      },
      error: (err) => {
        this.#mapRemoteControlError(err);
      },
    });
  }

  beginRemoteRegistration() {
    this.remoteControlState.set('registering');

    const registrationUrl = this.settingsForm.controls.remoteControlRegisterUrl.value;

    this.#dupServer.postApiV1RemotecontrolRegister({ requestBody: { RegistrationUrl: registrationUrl } }).subscribe({
      next: (res) => {
        this.#mapRemoteControlStatus(res);
      },
      error: (err) => {
        this.#mapRemoteControlError(err);
      },
    });
  }

  cancelRemoteRegistration() {
    this.#dupServer.deleteApiV1RemotecontrolRegister().subscribe({
      next: (res) => {
        this.#mapRemoteControlStatus(res);
      },
      error: (err) => {
        this.#mapRemoteControlError(err);
      },
    });
  }

  enableRemoteControl() {
    this.#dupServer.postApiV1RemotecontrolEnable().subscribe({
      next: (res) => {
        this.#mapRemoteControlStatus(res);
      },
      error: (err) => {
        this.#mapRemoteControlError(err);
      },
    });
  }

  disableRemoteControl() {
    this.#dupServer.postApiV1RemotecontrolDisable().subscribe({
      next: (res) => {
        this.#mapRemoteControlStatus(res);
      },
      error: (err) => {
        this.#mapRemoteControlError(err);
      },
    });
  }

  deleteRemoteControl() {
    const _self = this;

    if (confirm('Are you sure you want to delete the remote control registration?')) {
      _self.#dupServer.deleteApiV1RemotecontrolRegistration().subscribe({
        next: (res) => {
          _self.#mapRemoteControlStatus(res);
        },
        error: (err) => {
          _self.#mapRemoteControlError(err);
        },
      });
    }
  }

  getRemoteControlStatusText() {
    const remoteControlState = this.remoteControlState();

    if (remoteControlState === 'enabled') return 'Remote control is enabled but not connected';
    if (remoteControlState === 'connected') return 'Remote control is connected';
    if (remoteControlState === 'registering') return 'Registering machine...';
    if (remoteControlState === 'registeringfaulted') return 'Registration failed';
    if (remoteControlState === 'registered') return 'Registered, waiting for accept';
    if (remoteControlState === 'disabled') return 'Remote control is configured but not enabled';
    if (remoteControlState === 'unknown') return '...loading...';

    return 'Remote control is not set up';
  }
}
