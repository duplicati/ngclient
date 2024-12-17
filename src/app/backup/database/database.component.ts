import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  selector: 'app-database',
  imports: [],
  templateUrl: './database.component.html',
  styleUrl: './database.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DatabaseComponent {
  #route = inject(ActivatedRoute);

  backupId = toSignal<string>(this.#route.params.pipe(map((x) => x['id'])));
}
