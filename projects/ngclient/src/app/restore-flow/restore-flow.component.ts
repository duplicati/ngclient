import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ShipStepper } from '@ship-ui/core';
import { BackupState } from '../backup/backup.state';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { RestoreFlowState } from './restore-flow.state';

@Component({
  selector: 'app-restore-flow',
  imports: [ShipStepper, StatusBarComponent, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './restore-flow.component.html',
  styleUrl: './restore-flow.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RestoreFlowState, BackupState],
  host: {
    '[class.full-width]': 'isFullWidthPage()',
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
  isFileRestore = this.#restoreFlowState.isFileRestore;
  isFullWidthPage = signal(false);

  paramsChanged = effect(() => {
    const childRouteUrl = this.#childRouteUrlSignal();
    const backupId = this.#routeParamsSignal()?.['id'];
    const isFileRestorePage = !!this.#routeUrlSignal()?.find((x) => x.path === 'restore-from-files');
    const isSelectFilesPage = !!childRouteUrl?.find((x) => x.path === 'select-files');
    const isProgressPage = !!childRouteUrl?.find((x) => x.path === 'progress');

    this.isFullWidthPage.set(isProgressPage || isSelectFilesPage);
    this.#restoreFlowState.init(backupId, isFileRestorePage);
  });

  ngOnInit() {
    this.#router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const newUrl = event.urlAfterRedirects;

        this.isFullWidthPage.set(newUrl.includes('progress') || newUrl.includes('select-files'));
      }
    });
  }
}
