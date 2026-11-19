import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { defer, distinctUntilChanged, map, switchMap } from 'rxjs';
import { DuplicatiServer } from '../../core/openapi';
import { Marked, MarkedProvider } from '../../core/providers/marked';

@Component({
  selector: 'app-changelog',
  templateUrl: './changelog.component.html',
  styleUrl: './changelog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MarkedProvider],
})
export default class ChangelogComponent {
  #dupServer = inject(DuplicatiServer);
  #marked = inject(Marked);
  #route = inject(ActivatedRoute);

  changelog = toSignal(
    this.#route.queryParamMap.pipe(
      map((params) => params.get('from-update') === 'true'),
      distinctUntilChanged(),
      switchMap((fromUpdate) =>
        defer(() => this.#dupServer.getApiV1Changelog({ query: { 'from-update': fromUpdate } }))
      ),
      map((x) => this.#marked.parse((x.Changelog ?? '').replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/, '')))
    )
  );
}
