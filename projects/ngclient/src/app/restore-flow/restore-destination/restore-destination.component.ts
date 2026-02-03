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
import { BackupState } from '../../backup/backup.state';
import { DestinationListItemComponent } from '../../backup/destination/destination-list-item/destination-list-item.component';
import { DestinationListComponent } from '../../backup/destination/destination-list/destination-list.component';
import { getConfigurationByKey, getConfigurationByUrl } from '../../backup/destination/destination.config-utilities';
import { SingleDestinationComponent } from '../../backup/destination/single-destination/single-destination.component';
import { TestUrl } from '../../backup/source-data/target-url-dialog/test-url/test-url';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { IDynamicModule } from '../../core/openapi';
import { DestinationTypeOption } from '../../core/states/destinationconfig.state';
import { RestoreFlowState } from '../restore-flow.state';

@Component({
  selector: 'app-restore-destination',
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
  templateUrl: './restore-destination.component.html',
  styleUrl: './restore-destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BackupState],
})
export default class RestoreDestinationComponent {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #dialog = inject(ShipDialogService);
  injector = inject(Injector);
  #restoreFlowState = inject(RestoreFlowState);

  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');
  testUrlComponent = viewChild.required<TestUrl>('testUrl');

  testSignal = this.#restoreFlowState.destinationTestSignal;
  targetUrlModel = this.#restoreFlowState.destinationTargetUrl;
  targetUrlCtrl = signal<string | null>(null);
  targetUrlInitial = signal<string | null>(null);
  targetUrlDialogOpen = signal(false);
  toggleNewDestination = signal(true);

  selectedDestinationType = computed(() => {
    const targetUrl = this.#restoreFlowState.destinationTargetUrl();

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
    navigator.clipboard.writeText(this.#restoreFlowState.destinationTargetUrl() ?? '');
  }

  openTargetUrlDialog() {
    const targetUrl = this.#restoreFlowState.destinationTargetUrl();
    this.targetUrlCtrl.set(targetUrl);
    this.targetUrlInitial.set(targetUrl);
    this.targetUrlDialogOpen.set(true);
  }

  closeTargetUrlDialog(submit = false) {
    this.targetUrlDialogOpen.set(false);

    const targetUrl = this.targetUrlCtrl();
    const initialTargetUrl = this.targetUrlInitial();

    if (!submit || targetUrl === initialTargetUrl || !targetUrl) return;

    this.#restoreFlowState.updateTargetUrl(targetUrl);
  }

  setDestination(key: IDynamicModule['Key']) {
    const config = getConfigurationByKey(key ?? '');
    if (!config) return;

    if (config.mapper.default) {
      const defaultUrl = config.mapper.default('');
      this.#restoreFlowState.updateTargetUrl(defaultUrl);
      return;
    }

    this.#restoreFlowState.updateTargetUrl(`${key}://`);
  }

  removeDestination() {
    this.#restoreFlowState.updateTargetUrl(null);
  }

  goBack() {
    this.#router.navigate(['general'], { relativeTo: this.#route.parent });
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
