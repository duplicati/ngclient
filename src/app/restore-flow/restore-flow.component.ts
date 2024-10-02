import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SparkleRadioComponent, SparkleStepperComponent } from '@sparkle-ui/core';
import { RestoreFlowState } from './restore-flow.state';

@Component({
  selector: 'app-restore-flow',
  standalone: true,
  imports: [SparkleStepperComponent, SparkleRadioComponent, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './restore-flow.component.html',
  styleUrl: './restore-flow.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RestoreFlowComponent {
  #route = inject(ActivatedRoute);
  #restoreFlowState = inject(RestoreFlowState);

  backupId = this.#restoreFlowState.backupId;

  ngOnInit() {
    this.#restoreFlowState.init(this.#route.snapshot.params['id']);
  }
}
