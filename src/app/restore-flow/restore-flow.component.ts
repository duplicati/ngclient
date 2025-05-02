import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SparkleRadioComponent, SparkleStepperComponent } from '@sparkle-ui/core';
import { BackupState } from '../backup/backup.state';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { RestoreFlowState } from './restore-flow.state';

@Component({
  selector: 'app-restore-flow',
  imports: [
    SparkleStepperComponent,
    SparkleRadioComponent,
    StatusBarComponent,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
  templateUrl: './restore-flow.component.html',
  styleUrl: './restore-flow.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RestoreFlowState, BackupState],
  host: {
    '[class.full-width]': 'isProgressPage()',
  },
})
export default class RestoreFlowComponent {
  #route = inject(ActivatedRoute);
  #router = inject(Router);
  #restoreFlowState = inject(RestoreFlowState);

  #routeParamsSignal = toSignal(this.#route.params);
  #routeUrlSignal = toSignal(this.#route.url);
  #childRouteUrlSignal = toSignal(this.#route.children[0].url);

  backupId = this.#restoreFlowState.backupId;
  isDraft = this.#restoreFlowState.isDraft;
  isFileRestore = this.#restoreFlowState.isFileRestore;
  isProgressPage = signal(false);

  paramsChanged = effect(() => {
    const childRouteUrl = this.#childRouteUrlSignal();
    const backupId = this.#routeParamsSignal()?.['id'];
    const isDraft = !!this.#routeUrlSignal()?.find((x) => x.path === 'restore-draft');
    const isFileRestore = !!this.#routeUrlSignal()?.find((x) => x.path === 'restore-from-files');
    const isProgressPage = !!childRouteUrl?.find((x) => x.path === 'progress');

    this.isProgressPage.set(isProgressPage);
    this.#restoreFlowState.init(backupId, isFileRestore, isFileRestore || isDraft);
  });

  ngOnInit() {
    this.#router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const newUrl = event.urlAfterRedirects;

        this.isProgressPage.set(newUrl.includes('progress'));
      }
    });
  }
}
