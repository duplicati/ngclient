import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core';
import { ShipAlert, ShipButton } from '@ship-ui/core';
import { TestDestinationService } from '../../../../core/services/test-destination.service';
import { TestState } from '../../../backup.state';
import { fromTargetPath } from '../../../destination/destination.config-utilities';

@Component({
  selector: 'app-test-url',
  imports: [ShipAlert, ShipButton],
  templateUrl: './test-url.html',
  styleUrl: './test-url.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestUrl {
  #testDestination = inject(TestDestinationService);

  targetUrl = model.required<string | null>();
  testSignal = model.required<string>();

  testErrorMessage = signal<string | null>(null);

  // responseType = signal<'containsBackup' | 'destinationNotEmpty' | null>(null);

  isExpectedValidTargetUrl = computed(() => {
    const url = this.targetUrl();

    if (!url) return false;

    const config = fromTargetPath(url);

    if (!config) return false;

    return true;
  });

  prevTargetUrl: string | null = null;
  targetUrlEffect = effect(() => {
    const url = this.targetUrl();

    if (url === this.prevTargetUrl) return;

    this.prevTargetUrl = url;
    this.resetTestState();
  });

  setTestState(state: TestState, errorMessage?: string | null) {
    this.testSignal.set(state);
    this.testErrorMessage.set(errorMessage ?? null);
  }

  resetTestState() {
    this.testSignal.set('');
    this.testErrorMessage.set(null);
  }

  testDestination() {
    const targetUrl = this.targetUrl();

    if (!targetUrl) return;

    this.setTestState('testing');

    this.#testDestination.testDestination(targetUrl, null, 0, true, true).subscribe({
      next: (res) => {
        if (res.action === 'success' && res.containsBackup === true) {
          this.setTestState('containsBackup');
          // } else if (res.action === 'success' && res.anyFilesFound === true) {
          //   this.setTestState('destinationNotEmpty');
        } else if (res.action === 'success') {
          this.setTestState('success');
        }
        // this.setTestState('success');

        // if () {
        //   this.setTestState(
        //     'warning',
        //     $localize`The remote destination already contains a backup. Please use a different folder for each backup.`
        //   );

        //   this.responseType.set('containsBackup');
        //   // if (!suppressErrorDialogs) {
        //   // this.#dialog.open(ConfirmDialogComponent, {
        //   //   data: {
        //   //     title: $localize`Folder contains backup`,
        //   //     message: $localize`The remote destination already contains a backup. You must use a different folder for each backup.`,
        //   //     confirmText: $localize`OK`,
        //   //     cancelText: undefined,
        //   //   },
        //   // });
        //   // }
        // } else if (res.anyFilesFound === true) {
        //   this.setTestState('warning', $localize`The remote destination contains unknown files.`);

        //   this.responseType.set('destinationNotEmpty');
        //   // if (!suppressErrorDialogs) {
        //   // this.#dialog.open(ConfirmDialogComponent, {
        //   //   data: {
        //   //     title: $localize`Folder is not empty`,
        //   //     message: $localize`The remote destination is not empty. It is recommended to use an empty folder for the backup.`,
        //   //     confirmText: $localize`OK`,
        //   //     cancelText: undefined,
        //   //   },
        //   // });
        //   // }
        // }

        //   callback?.();
        //   return;
        // }

        this.setTestState('error', res.errorMessage ?? $localize`An error occurred while testing the destination.`);

        if (res.action === 'generic-error') {
          // callback?.();
          return;
        }

        const targetUrlHasParams = targetUrl.includes('?');

        if (res.action === 'trust-cert') {
          this.targetUrl.set(targetUrl + `${targetUrlHasParams ? '&' : '?'}accept-specified-ssl-hash=${res.certData}`);
        }

        if (res.action === 'approve-host-key') {
          this.targetUrl.set(targetUrl + `${targetUrlHasParams ? '&' : '?'}ssh-fingerprint=${res.reportedHostKey}`);
        }

        if (res.testAgain) this.testDestination();
        // else callback?.();
      },
    });
  }
}
