import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ShipButton, ShipChip, ShipIcon, ShipTabs } from '@ship-ui/core';
import { map } from 'rxjs';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import { BytesPipe } from '../../core/pipes/byte.pipe';
import { DurationFormatPipe } from '../../core/pipes/duration.pipe';
import { BackupsState } from '../../core/states/backups.state';
import { GeneralLogComponent } from './general-log/general-log.component';
import { RemoteLogComponent } from './remote-log/remote-log.component';

@Component({
  selector: 'app-log',
  imports: [
    ShipTabs,
    GeneralLogComponent,
    RemoteLogComponent,
    RouterLink,
    BytesPipe,
    DurationFormatPipe,
    DatePipe,
    StatusBarComponent,
    ShipIcon,
    ShipButton,
    ShipChip,
  ],
  templateUrl: './log.component.html',
  styleUrl: './log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LogComponent {
  #route = inject(ActivatedRoute);
  #backupsState = inject(BackupsState);

  MISSING_BACKUP_NAME = $localize`Backup name missing`;
  activeTab = signal<'general' | 'destination'>('general');
  backupId = toSignal<string>(this.#route.params.pipe(map((x) => x['id'])));
  backup = computed(() => {
    const backupId = this.backupId();
    if (backupId) {
      return this.#backupsState.getBackupById(backupId);
    }
    return null;
  });
}
