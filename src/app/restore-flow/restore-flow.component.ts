import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SparkleRadioComponent, SparkleStepperComponent } from '@sparkle-ui/core';
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
})
export default class RestoreFlowComponent {
  #route = inject(ActivatedRoute);
  #restoreFlowState = inject(RestoreFlowState);

  #routeParamsSignal = toSignal(this.#route.params);
  #routeUrlSignal = toSignal(this.#route.url);

  backupId = this.#restoreFlowState.backupId;
  isDraft = this.#restoreFlowState.isDraft;
  isFileRestore = this.#restoreFlowState.isFileRestore;

  paramsChanged = effect(() => {
    const backupId = this.#routeParamsSignal()?.['id'];
    const isDraft = !!this.#routeUrlSignal()?.find((x) => x.path === 'restore-draft');
    const isFileRestore = !!this.#routeUrlSignal()?.find((x) => x.path === 'restore-from-files');

    this.#restoreFlowState.init(backupId, isFileRestore, isFileRestore || isDraft);
  });
}
