import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BackupsState } from '../../core/states/backups.state';
import { PurgeFilesState } from './purge-files.state';

@Component({
  selector: 'app-purge-files',
  imports: [RouterOutlet],
  templateUrl: './purge-files.component.html',
  styleUrl: './purge-files.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PurgeFilesState],
})
export default class PurgeFilesComponent {
  #state = inject(PurgeFilesState);
  #backupsState = inject(BackupsState);

  id = input.required<string>();
  backup = computed(() => this.#backupsState.getBackupById(this.id()));

  initEffect = effect(() => this.#state.init(this.id()));
}
