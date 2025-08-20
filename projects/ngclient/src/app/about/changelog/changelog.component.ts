import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { map } from 'rxjs';
import { DuplicatiServerService } from '../../core/openapi';
import { Marked, MarkedProvider } from '../../core/providers/marked';

@Component({
  selector: 'app-changelog',
  templateUrl: './changelog.component.html',
  styleUrl: './changelog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MarkedProvider],
})
export default class ChangelogComponent {
  #dupServer = inject(DuplicatiServerService);
  #sanitizer = inject(DomSanitizer);
  #marked = inject(Marked);

  changelog = toSignal(
    this.#dupServer.getApiV1Changelog().pipe(
      map((x) => {
        const changelog = this.#sanitizer.bypassSecurityTrustHtml(x.Changelog ?? '');
        let stringLog = changelog.toString();

        if (stringLog.startsWith('SafeValue must use [property]=binding: ')) {
          stringLog = stringLog.replace('SafeValue must use [property]=binding: ', '');
        }

        return this.#marked.parse(stringLog.replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/, ''));
      })
    )
  );
}
