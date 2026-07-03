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
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipAlert, ShipButton, ShipDialog, ShipDialogService, ShipFormField, ShipIcon, ShipMenu } from '@ship-ui/core';
import { BackupState } from '../../backup.state';
import { DestinationListItemComponent } from '../../destination/destination-list-item/destination-list-item.component';
import { DestinationListComponent } from '../../destination/destination-list/destination-list.component';
import { getConfigurationByKey, getConfigurationByUrl } from '../../destination/destination.config-utilities';
import { SingleDestinationComponent } from '../../destination/single-destination/single-destination.component';
import { TestUrl } from '../../source-data/target-url-dialog/test-url/test-url';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog/confirm-dialog.component';
import { IDynamicModule } from '../../../core/openapi';
import { DestinationTypeOption } from '../../../core/states/destinationconfig.state';
import { ImportDestinationState } from '../import-destination.state';

@Component({
  selector: 'app-import-destination-destination',
  imports: [
    SingleDestinationComponent,
    DestinationListComponent,
    DestinationListItemComponent,
    FormsModule,
    ShipButton,
    ShipFormField,
    ShipMenu,
    ShipIcon,
    ShipDialog,
    ShipAlert,
    TestUrl,
  ],
  templateUrl: './destination.component.html',
  styleUrl: './destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BackupState],
})
export default class DestinationComponent {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #dialog = inject(ShipDialogService);
  injector = inject(Injector);
  #importDestinationState = inject(ImportDestinationState);

  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');
  testUrlComponent = viewChild.required<TestUrl>('testUrl');

  testSignal = this.#importDestinationState.destinationTestSignal;
  targetUrlModel = this.#importDestinationState.destinationTargetUrl;
  targetUrlCtrl = signal<string | null>(null);
  targetUrlInitial = signal<string | null>(null);
  targetUrlDialogOpen = signal(false);
  toggleNewDestination = signal(true);

  selectedDestinationType = computed(() => {
    const targetUrl = this.#importDestinationState.destinationTargetUrl();

    if (!targetUrl) return null;

    return getConfigurationByUrl(targetUrl);
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
    navigator.clipboard.writeText(this.#importDestinationState.destinationTargetUrl() ?? '');
  }

  openTargetUrlDialog() {
    const targetUrl = this.#importDestinationState.destinationTargetUrl();
    this.targetUrlCtrl.set(targetUrl);
    this.targetUrlInitial.set(targetUrl);
    this.targetUrlDialogOpen.set(true);
  }

  closeTargetUrlDialog(submit = false) {
    this.targetUrlDialogOpen.set(false);

    const targetUrl = this.targetUrlCtrl();
    const initialTargetUrl = this.targetUrlInitial();

    if (!submit || targetUrl === initialTargetUrl || !targetUrl) return;

    this.#importDestinationState.updateTargetUrl(targetUrl);
  }

  setDestination(key: IDynamicModule['Key']) {
    const config = getConfigurationByKey(key ?? '');
    if (!config) return;

    if (config.mapper.default) {
      const defaultUrl = config.mapper.default('');
      this.#importDestinationState.updateTargetUrl(defaultUrl);
      return;
    }

    this.#importDestinationState.updateTargetUrl(`${key}://`);
  }

  removeDestination() {
    this.#importDestinationState.updateTargetUrl(null);
  }

  goBack() {
    this.#router.navigate(['/']);
  }

  next() {
    const testSignalValue = this.testSignal();
    if (testSignalValue === null) {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Test destination`,
          message: $localize`You have not tested the destination yet. Do you want to test it now?`,
          confirmText: $localize`Test now`,
          cancelText: $localize`Skip test and continue`,
        },
        closed: (dlgres) => {
          if (dlgres) {
            this.testUrlComponent()
              ?.testDestination(false)
              ?.then((res) => {
                if (res.action === 'success' && res.containsBackup) {
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

    if (testResult?.action !== 'success' || !testResult.containsBackup) {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Test destination`,
          message: $localize`The destination has not been tested successfully. Are you sure you want to continue?`,
          confirmText: $localize`Edit destination`,
          cancelText: $localize`Yes, continue`,
        },
        closed: (res) => {
          if (!res) this.#navigateToNext();
        },
      });
      return;
    }

    this.#navigateToNext();
  }

  #navigateToNext() {
    this.#router.navigate(['encryption'], { relativeTo: this.#route.parent });
  }
}
