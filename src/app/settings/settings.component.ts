import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  SparkleButtonComponent,
  SparkleOptionComponent,
  SparkleRadioComponent,
  SparkleSelectComponent,
} from '@sparkle-ui/core';
import { derivedFrom } from 'ngxtension/derived-from';
import { map, pipe, startWith } from 'rxjs';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { LANGUAGES } from '../core/locales/locales.utility';
import { DuplicatiServerService } from '../core/openapi';
import { LOCALSTORAGE } from '../core/services/localstorage.token';
import { SysinfoState } from '../core/states/sysinfo.state';
import { LayoutState } from '../layout/layout.state';
import { RemoteControlComponent } from './remote-control/remote-control.component';
import { RemoteControlState } from './remote-control/remote-control.state';

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
    SparkleOptionComponent,
    SparkleButtonComponent,
    SparkleRadioComponent,
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
    updateChannel: fb.control<UpdateChannel>(''),
  });

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

  ngOnInit() {
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
}
