import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, model } from '@angular/core';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipSpinner } from '@ship-ui/core/ship-spinner';
import { Subscription } from 'rxjs';
import { RemoteDestinationType } from '../../../../core/openapi';
import { TestDestinationResult, TestDestinationService } from '../../../../core/services/test-destination.service';
import { fromTargetPath } from '../../../destination/destination.config-utilities';

export type TestExpectation = 'containsBackup' | 'destinationEmpty' | 'destinationNotEmpty' | 'any';
export type TestState = 'testing' | TestDestinationResult | null;

@Component({
  selector: 'app-test-url',
  imports: [ShipAlert, ShipButton, ShipIcon, ShipSpinner],
  templateUrl: './test-url.html',
  styleUrl: './test-url.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestUrl {
  #testDestination = inject(TestDestinationService);
  #destroyRef = inject(DestroyRef);

  targetUrl = model.required<string | null>();
  testSignal = model.required<TestState>();
  connectionStringId = input<number | null>(null);

  backupId = input.required<string | null>();
  sourcePrefix = input.required<string | null>();

  suppressErrorDialogs = input.required<boolean>();
  askToCreate = input.required<boolean>();
  readOnlyTest = input.required<boolean>();
  testExpectation = input.required<TestExpectation>();
  moduleType = input.required<RemoteDestinationType>();

  // Filter out the testing state for easier use in template
  testResponse = computed(() => {
    const testState = this.testSignal();

    if (testState && typeof testState !== 'string') {
      return testState;
    }

    return null;
  });

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
    const prevUrl = this.prevTargetUrl;

    if (url === prevUrl) return;

    this.prevTargetUrl = url;

    // If we change the target url during testing, don't reset the test state
    if (this.testSignal() === 'testing') return;
    // If we are just loading for the first time, don't reset the test state
    if (prevUrl === null) return;

    this.testSignal.set(null);
  });

  useSuggestedUrl() {
    const targetUrl = this.targetUrl();
    const testResult = this.testSignal();
    const originalUrl = testResult && typeof testResult !== 'string' ? testResult?.targetUrl : null;
    const suggestedUrl = testResult && typeof testResult !== 'string' ? testResult?.suggestedUrl : null;

    if (!targetUrl || !suggestedUrl || originalUrl !== targetUrl) return false;

    this.targetUrl.set(suggestedUrl);
    this.testDestinationClick();
    return false;
  }

  createFolder() {
    this.testDestination(true);
    return false;
  }

  testDestinationClick() {
    this.testDestination(false);
    return false;
  }

  testDestination(autoCreateFolders: boolean) {
    if (this.#destroyRef.destroyed) return;
    const targetUrl = this.targetUrl();

    if (!targetUrl) return;

    this.testSignal.set('testing');

    const folderHandling = autoCreateFolders ? 'create' : this.askToCreate() ? 'prompt' : 'error';

    return new Promise<TestDestinationResult | undefined>((resolve) => {
      const subscriptions = new Subscription();
      const unregister = this.#destroyRef.onDestroy(() => {
        subscriptions.unsubscribe();
        resolve(undefined);
      });
      const finish = (result: TestDestinationResult) => {
        this.testSignal.set(result);
        unregister();
        subscriptions.unsubscribe();
        resolve(result);
      };

      subscriptions.add(
        this.#testDestination
          .testDestination(
            targetUrl,
            this.backupId(),
            this.connectionStringId(),
            this.sourcePrefix(),
            0,
            this.moduleType(),
            this.suppressErrorDialogs(),
            folderHandling,
            this.readOnlyTest()
          )
          ?.subscribe({
            next: (res) => {
              if (subscriptions.closed) return;
              if (!this.suppressErrorDialogs() && res.testAgain) {
                const suggestedUrl = res.suggestedUrl;
                if (suggestedUrl) this.targetUrl.set(suggestedUrl);

                this.testSignal.set('testing');

                subscriptions.add(
                  this.#testDestination
                    .testDestination(
                      suggestedUrl ?? targetUrl,
                      this.backupId(),
                      this.connectionStringId(),
                      this.sourcePrefix(),
                      0,
                      this.moduleType(),
                      this.suppressErrorDialogs(),
                      folderHandling,
                      this.readOnlyTest()
                    )
                    ?.subscribe({
                      // We only support one level of re-test for now
                      next: (res) => {
                        if (subscriptions.closed) return;
                        finish(res);
                      },
                    })
                );
              } else {
                finish(res);
              }
            },
          })
      );
    });
  }
}
