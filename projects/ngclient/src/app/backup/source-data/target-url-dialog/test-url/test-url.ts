import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, model } from '@angular/core';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipSpinner } from '@ship-ui/core/ship-spinner';
import { Subscription } from 'rxjs';
import { RemoteDestinationType } from '../../../../core/openapi';
import {
  FolderHandlingOption,
  TestDestinationResult,
  TestDestinationService,
} from '../../../../core/services/test-destination.service';
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
  #activeTest?: {
    targetUrl: string;
    folderHandling: FolderHandlingOption;
    promise: Promise<TestDestinationResult | undefined>;
    cancel: () => void;
  };

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

    // An old URL must not keep Continue waiting or later validate the new URL.
    if (this.#activeTest && this.#activeTest.targetUrl !== url) this.#activeTest.cancel();
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
    const folderHandling: FolderHandlingOption = autoCreateFolders ? 'create' : this.askToCreate() ? 'prompt' : 'error';

    // A running test can be shared, unless it would not create a folder that this call asks to create
    const activeTest = this.#activeTest;
    if (activeTest?.targetUrl === targetUrl && (folderHandling !== 'create' || activeTest.folderHandling === 'create'))
      return activeTest.promise;
    activeTest?.cancel();
    if (!targetUrl) return;

    let resolve!: (result: TestDestinationResult | undefined) => void;
    const promise = new Promise<TestDestinationResult | undefined>((done) => {
      resolve = done;
    });
    const subscriptions = new Subscription();
    const active = { targetUrl, folderHandling, promise, cancel: () => finish(undefined) };
    this.#activeTest = active;
    const unregister = this.#destroyRef.onDestroy(() => finish(undefined, false));
    const finish = (result: TestDestinationResult | undefined, updateState = true) => {
      if (subscriptions.closed) return;
      if (this.#activeTest === active) this.#activeTest = undefined;
      if (updateState) this.testSignal.set(result ?? null);
      unregister();
      subscriptions.unsubscribe();
      resolve(result);
    };

    this.prevTargetUrl = targetUrl;
    this.testSignal.set('testing');
    const run = (url: string, canRetry: boolean) => {
      let emitted = false;
      subscriptions.add(
        this.#testDestination
          .testDestination(
            url,
            this.backupId(),
            this.connectionStringId(),
            this.sourcePrefix(),
            0,
            this.moduleType(),
            this.suppressErrorDialogs(),
            folderHandling,
            this.readOnlyTest()
          )
          .subscribe({
            next: (res) => {
              if (subscriptions.closed) return;
              if (this.targetUrl() !== active.targetUrl) {
                finish(undefined);
                return;
              }
              emitted = true;
              if (canRetry && !this.suppressErrorDialogs() && res.testAgain) {
                const retryUrl = res.suggestedUrl ?? url;
                // This URL change is part of this test (certificate/host-key approval).
                active.targetUrl = retryUrl;
                this.prevTargetUrl = retryUrl;
                if (res.suggestedUrl) this.targetUrl.set(retryUrl);
                // Parents may reset the test state when the URL changes
                this.testSignal.set('testing');
                run(retryUrl, false);
              } else {
                finish(res);
              }
            },
            error: (error: unknown) =>
              finish({
                action: 'generic-error',
                targetUrl: url,
                testAgain: false,
                destinationIndex: 0,
                errorMessage: error instanceof Error ? error.message : String(error),
              }),
            complete: () => {
              if (!emitted) finish(undefined);
            },
          })
      );
    };
    run(targetUrl, true);
    return promise;
  }
}
