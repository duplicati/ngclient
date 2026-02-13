import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, FormGroup, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ShipAlert,
  ShipButton,
  ShipCard,
  ShipDialog,
  ShipDialogService,
  ShipDivider,
  ShipFormField,
  ShipIcon,
  ShipMenu,
  ShipProgressBar,
} from '@ship-ui/core';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { IDynamicModule } from '../../core/openapi';
import { ConnectionStringsState } from '../../core/states/connection-strings.state';
import { DestinationTypeOption } from '../../core/states/destinationconfig.state';
import { BackupState } from '../backup.state';
import { TestUrl } from '../source-data/target-url-dialog/test-url/test-url';
import { DestinationListItemComponent } from './destination-list-item/destination-list-item.component';
import { DestinationListComponent } from './destination-list/destination-list.component';
import { getConfigurationByKey, getConfigurationByUrl, getSimplePath } from './destination.config-utilities';
import { SingleDestinationComponent } from './single-destination/single-destination.component';

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
  imports: [
    SingleDestinationComponent,
    DestinationListComponent,
    DestinationListItemComponent,
    TestUrl,

    FormsModule,
    ShipButton,
    ShipFormField,
    ShipMenu,
    ShipIcon,
    ShipDialog,
    ShipAlert,
    ShipCard,
    ShipDivider,
    ShipProgressBar,
  ],
  templateUrl: './destination.component.html',
  styleUrl: './destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DestinationComponent {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #backupState = inject(BackupState);
  #dialog = inject(ShipDialogService);
  #connectionStringsState = inject(ConnectionStringsState);
  injector = inject(Injector);
  getSimplePath = getSimplePath;

  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');
  testUrlComponent = viewChild.required<TestUrl>('testUrl');

  testSignal = this.#backupState.targetUrlTestSignal;
  targetUrlModel = this.#backupState.targetUrlModel;
  targetUrlCtrl = signal<string | null>(null);
  targetUrlInitial = signal<string | null>(null);
  targetUrlDialogOpen = signal(false);
  showCustomList = signal(false);
  saveConnectionString = this.#backupState.saveConnectionString;
  isConnectionStringSaved = this.#backupState.isConnectionStringSaved;

  destinations = this.#connectionStringsState.destinations;
  isLoadingDestinations = this.#connectionStringsState.resourceDestinations.isLoading;

  isNew = this.#backupState.isNew;

  selectedDestinationType = computed(() => {
    const targetUrl = this.targetUrlModel();

    if (!targetUrl) return null;

    return getConfigurationByUrl(targetUrl) ?? null;
  });

  selectedDestinationTypeOption = computed(() => {
    const x = this.selectedDestinationType();
    return x
      ? ({
          key: x.customKey ?? x.key,
          customKey: x.customKey ?? null,
          displayName: x.displayName,
          description: x.description,
          icon: x.icon,
        } as DestinationTypeOption)
      : null;
  });

  copyTargetUrl() {
    navigator.clipboard.writeText(this.targetUrlModel() ?? '');
  }

  openTargetUrlDialog() {
    const targetUrl = this.targetUrlModel();
    this.targetUrlCtrl.set(targetUrl);
    this.targetUrlInitial.set(targetUrl);
    this.targetUrlDialogOpen.set(true);
  }

  closeTargetUrlDialog(submit = false) {
    this.targetUrlDialogOpen.set(false);

    const targetUrl = this.targetUrlCtrl();
    const initialTargetUrl = this.targetUrlInitial();

    if (!submit || targetUrl === initialTargetUrl || !targetUrl) return;

    this.#backupState.setTargetUrl(targetUrl);
  }

  setDestination(key: IDynamicModule['Key']) {
    const config = getConfigurationByKey(key ?? '');
    if (!config) return;

    if (config.mapper.default) {
      const defaultUrl = config.mapper.default(this.#backupState.backupName() ?? '');
      this.#backupState.setTargetUrl(defaultUrl, true);
      return;
    }

    this.#backupState.setTargetUrl(`${key}://`, true);
  }

  selectSavedDestination(option: any) {
    if (!option.BaseUrl) return;
    this.#backupState.setTargetUrl(option.BaseUrl, true, option.ID);
  }

  toggleCustomList() {
    this.showCustomList.set(true);
  }

  removeDestination() {
    this.#backupState.setTargetUrl(null, true);
    this.showCustomList.set(false);
  }

  goBack() {
    this.#router.navigate(['general'], { relativeTo: this.#route.parent });
  }

  next() {
    const isNew = this.#backupState.isNew();
    const testSignalValue = this.testSignal();

    if (!isNew) {
      this.#navigateToNext();
      return;
    }

    if (testSignalValue === null) {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Test destination`,
          message: $localize`You have not tested the destination yet. Do you want to test it now?`,
          confirmText: $localize`Test now`,
          cancelText: $localize`Skip test and continue`,
        },
        closed: (res) => {
          if (res) {
            this.testUrlComponent()
              ?.testDestination(false)
              ?.then((res) => {
                if (res.action === 'success' && !res.containsBackup && !res.anyFilesFound) {
                  this.#navigateToNext();
                } else {
                  this.#dialog.open(ConfirmDialogComponent, {
                    data: {
                      title: $localize`Test did not succeed`,
                      message: res.errorMessage ?? $localize`Failed to test the destination.`,
                      confirmText: $localize`OK`,
                      cancelText: undefined,
                    },
                  });
                }
              });
          } else {
            this.#navigateToNext();
          }
        },
      });
      return;
    }

    const testResult = typeof testSignalValue === 'string' ? null : testSignalValue;

    if (testResult?.action !== 'success' || testResult.containsBackup || testResult.anyFilesFound) {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Test destination`,
          message: $localize`The destination has not been tested successfully. Are you sure you want to continue?`,
          confirmText: $localize`Yes, continue`,
          cancelText: $localize`Cancel`,
        },
        closed: (res) => {
          if (res) this.#navigateToNext();
        },
      });

      return;
    }

    this.#navigateToNext();
  }

  #navigateToNext() {
    if (this.#backupState.shouldAutoSave()) {
      this.#backupState.submit(true);
    }

    this.#router.navigate(['source-data'], { relativeTo: this.#route.parent });
  }
}
