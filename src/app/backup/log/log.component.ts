import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { SparkleTabsComponent } from '@sparkle-ui/core';
import { map } from 'rxjs';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import { GeneralLogComponent } from './general-log/general-log.component';
import { RemoteLogComponent } from './remote-log/remote-log.component';

@Component({
  selector: 'app-log',
  imports: [SparkleTabsComponent, GeneralLogComponent, RemoteLogComponent, StatusBarComponent],
  templateUrl: './log.component.html',
  styleUrl: './log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LogComponent {
  #route = inject(ActivatedRoute);

  backupId = toSignal<string>(this.#route.params.pipe(map((x) => x['id'])));
  activeTab = signal<'general' | 'destination'>('general');
}
