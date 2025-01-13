import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SparkleButtonComponent, SparkleIconComponent } from '@sparkle-ui/core';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import { CommandLineLogOutputDto, DuplicatiServerService } from '../../core/openapi';

type Status = 'starting' | 'started' | 'finished' | 'aborted';

@Component({
  selector: 'app-commandline-result',
  imports: [StatusBarComponent, SparkleIconComponent, SparkleButtonComponent, RouterLink],
  templateUrl: './commandline-result.component.html',
  styleUrl: './commandline-result.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CommandlineResultComponent {
  #dupServer = inject(DuplicatiServerService);
  #route = inject(ActivatedRoute);
  #routeParamsSignal = toSignal(this.#route.params);
  runId = computed(() => this.#routeParamsSignal()?.['runId']);

  offset = signal<number>(0);
  status = signal<Status>('starting');
  messageLog = signal<string[]>([]);

  interval = setInterval(() => {
    this.#dupServer
      .getApiV1CommandlineByRunid({
        runid: this.runId()!,
        offset: this.offset(),
        pagesize: 100,
      })
      .subscribe((response) => {
        this.offset.set(response.Count!);
        this.evalStatus(response);
        this.messageLog.update((y) => [...y, ...response.Items!]);
      });
  }, 1000);

  evalStatus(res: CommandLineLogOutputDto) {
    if (res.Started === true && res.Finished === true) {
      this.status.set('finished');
      clearInterval(this.interval);
    }

    if (res.Started === true && res.Finished === false) {
      this.status.set('started');
    }
  }

  abort() {
    this.#dupServer.postApiV1CommandlineByRunidAbort({ runid: this.runId() }).subscribe({
      next: (res) => {
        this.status.set('aborted');
        clearInterval(this.interval);
      },
    });
  }
}
