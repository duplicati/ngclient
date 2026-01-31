import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core';
import { ShipAlert, ShipButton } from '@ship-ui/core';
import { RemoteDestinationType } from '../../../../core/openapi';
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
  askToCreate = model.required<boolean>();
  testSignal = model.required<string>();
  moduleType = model.required<RemoteDestinationType>();

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

    this.#testDestination.testDestination(targetUrl, null, 0, this.askToCreate(), this.moduleType(), true).subscribe({
      next: (res) => {
        if (res.action === 'success' && res.containsBackup === true) {
          this.setTestState('containsBackup');
          return;
        } else if (res.action === 'success') {
          this.setTestState('success');
          return;
        }

        this.setTestState('error', res.errorMessage ?? $localize`An error occurred while testing the destination.`);

        if (res.action === 'generic-error') {
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
      },
    });
  }
}
