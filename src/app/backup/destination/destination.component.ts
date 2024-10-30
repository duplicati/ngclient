import { JsonPipe, NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleButtonGroupComponent,
  SparkleCheckboxComponent,
  SparkleDividerComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleOptionComponent,
  SparkleSelectComponent,
  SparkleToggleComponent,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { DuplicatiServerService, IDynamicModule } from '../../core/openapi';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupState } from '../backup.state';
import { FormView } from './destination.config';
import { toTargetPath } from './destination.mapper';

const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

export type Size = (typeof SIZE_OPTIONS)[number];
const fb = new FormBuilder();

export const createDestinationForm = (
  defaults = {
    destinations: [],
  }
) => {
  return fb.group({
    destinations: fb.array<DestinationFormGroup>(defaults.destinations),
  });
};

export const createDestinationFormGroup = ({
  key,
  customGroup,
  dynamicGroup,
  advancedGroup,
}: {
  key: string;
  customGroup: FormGroup;
  dynamicGroup: FormGroup;
  advancedGroup: FormGroup;
}) => {
  return fb.group({
    destinationType: fb.control<string>(key),
    custom: customGroup,
    dynamic: dynamicGroup,
    advanced: advancedGroup,
  });
};

export type DestinationFormGroup = ReturnType<typeof createDestinationFormGroup>;
export type DestinationFormGroupValue = ReturnType<typeof createDestinationFormGroup>['value'];

@Component({
  selector: 'app-destination',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,

    SparkleFormFieldComponent,
    SparkleSelectComponent,
    SparkleMenuComponent,
    SparkleCheckboxComponent,
    SparkleOptionComponent,
    SparkleButtonGroupComponent,
    SparkleIconComponent,
    SparkleToggleComponent,
    SparkleDividerComponent,

    ToggleCardComponent,
    FileTreeComponent,
    JsonPipe,
  ],
  templateUrl: './destination.component.html',
  styleUrl: './destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DestinationComponent {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #sysinfo = inject(SysinfoState);
  #httpClient = inject(HttpClient);
  #dupServer = inject(DuplicatiServerService);
  #backupState = inject(BackupState);

  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  sysIsLoaded = this.#sysinfo.isLoaded;
  finishedLoading = this.#backupState.finishedLoading;
  destinationForm = this.#backupState.destinationForm;
  destinationFormPair = this.#backupState.destinationFormPair;
  selectedAdvancedFormPair = this.#backupState.selectedAdvancedFormPair;
  notSelectedAdvancedFormPair = this.#backupState.notSelectedAdvancedFormPair;
  destinationOptions = this.#backupState.destinationOptions;
  destinationFormSignal = this.#backupState.destinationFormSignal;
  destinationCount = computed(() => this.destinationFormSignal()?.destinations?.length ?? 0);
  sizeOptions = signal(SIZE_OPTIONS);

  getFormFieldValue(
    destinationIndex: number,
    formGroupName: 'custom' | 'dynamic' | 'advanced',
    formControlName: string
  ) {
    const dest = this.destinationForm.controls.destinations.controls?.[destinationIndex];
    const group = dest.controls?.[formGroupName];

    return group.controls[formControlName].value;
  }

  addDestinationFormGroup(key: IDynamicModule['Key']) {
    this.#backupState.addDestinationFormGroup(key);
  }

  addAdvancedFormPair(item: FormView) {
    this.selectedAdvancedFormPair.update((y) => {
      y.push(item);

      return y;
    });

    this.notSelectedAdvancedFormPair.update((y) => {
      y = y.filter((x) => x.name !== item.name);

      return y;
    });
  }

  targetUrl = computed(() => {
    const destinationGroup = this.destinationFormSignal()?.destinations?.[0];

    if (!destinationGroup) return '';

    return toTargetPath(destinationGroup);
  });

  testDestination() {
    const targetUrl = this.targetUrl();

    if (!targetUrl) return;

    let request = null;

    if (targetUrl.startsWith('s3://')) {
      // Use the right API
      request = this.#dupServer.postApiV1RemoteoperationCreate({
        requestBody: {
          path: targetUrl,
        },
      });
    } else {
      request = this.#dupServer.postApiV1RemoteoperationTest({
        requestBody: {
          path: targetUrl,
        },
      });
    }

    if (request) {
      request.subscribe({
        next: (res) => {
          console.log('res', res);
        },
        error: (err) => {
          console.error('err', err);
        },
      });
    }
  }

  mapToTargetUrl(destinationGroup: DestinationFormGroup) {
    return toTargetPath(destinationGroup.value);
  }

  removeDestinationFormGroup(index: number) {
    this.destinationForm.controls.destinations.removeAt(index);
  }

  displayFn(key: IDynamicModule['Key']) {
    const item = this.destinationOptions().find((x) => x.Key === key);

    return item ? `${item.DisplayName}` : '';
  }

  goBack() {
    this.#router.navigate(['general'], { relativeTo: this.#route.parent });
  }

  next() {
    this.#router.navigate(['source-data'], { relativeTo: this.#route.parent });
  }

  #oauthServiceLink = signal('https://duplicati-oauth-handler.appspot.com/').asReadonly();
  #oauthCreateToken = signal(
    Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
  ).asReadonly();
  #oauthInProgress = signal(false);
  #oauthId = signal(null);

  keyCreation() {}

  oauthStartTokenCreation(backendKey: string) {
    // if (!servicelink.endsWith('/')) servicelink += '/';

    this.#oauthInProgress.set(true);

    const w = 450;
    const h = 600;
    const startlink = this.#oauthServiceLink() + '?type=' + backendKey + '&token=' + this.#oauthCreateToken();

    // const countDown = 100;
    // const ft = oauthCreateToken;
    const left = screen.width / 2 - w / 2;
    const top = screen.height / 2 - h / 2;
    const wnd = window.open(
      startlink,
      '_blank',
      'height=' + h + ',width=' + w + ',menubar=0,status=0,titlebar=0,toolbar=0,left=' + left + ',top=' + top
    );

    wnd?.addEventListener('blur', (event) => {
      console.log('event blur', event);
    });

    wnd?.addEventListener('beforeunload', (event) => {
      console.log('event beforeunload', event);
      this.#httpClient
        .get(this.#oauthServiceLink() + 'fetch?callback=JSON_CALLBACK', {
          params: { token: this.#oauthCreateToken() },
        })
        .pipe(finalize(() => this.#oauthInProgress.set(false)))
        .subscribe({
          next: (res: any) => {
            console.log('res', res);

            if (res?.authid) {
              this.#oauthId.set(res.authid);

              // wnd.close();
            }
          },
        });
    });

    // var recheck = function () {
    //   countDown--;
    //   if (countDown > 0 && ft == oauthCreateToken) {
    //     $http
    //       .jsonp(servicelink + "fetch?callback=JSON_CALLBACK", {
    //         params: { token: ft },
    //       })
    //       .then(
    //         function (response) {
    //           if (response.data.authid) {
    //             const AuthID = response.data.authid;
    //             const oauth_in_progress = false;
    //             wnd.close();
    //           } else {
    //             setTimeout(recheck, 3000);
    //           }
    //         },
    //         function (response) {
    //           setTimeout(recheck, 3000);
    //         }
    //       );
    //   } else {
    //     const oauth_in_progress = false;
    //     if (wnd != null) wnd.close();
    //   }
    // };

    // setTimeout(recheck, 6000);

    // return false;
  }
}
