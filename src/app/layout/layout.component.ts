import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleIconComponent,
  SparkleListComponent,
  SparkleSidenavComponent,
} from '@sparkle-ui/core';
import LogoComponent from '../core/components/logo/logo.component';
import { BackupsState } from '../core/states/backups.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { TasksState } from '../core/states/tasks.state';
import { LayoutState } from './layout.state';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,

    SparkleSidenavComponent,
    SparkleIconComponent,
    SparkleListComponent,
    SparkleButtonComponent,

    LogoComponent,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LayoutComponent {
  #layoutState = inject(LayoutState);
  #backupsState = inject(BackupsState);
  #taskState = inject(TasksState);
  #sysinfoState = inject(SysinfoState);

  isDarkMode = this.#layoutState.isDarkMode;

  ngOnInit() {
    this.#backupsState.getBackups();
    this.#sysinfoState.preloadSystemInfo();
    // this.#taskState.getTasks();
  }

  toggleBodyClass() {
    this.#layoutState.toggleBodyClass();
  }
}
