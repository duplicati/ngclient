import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SysinfoState } from '../../core/states/sysinfo.state';

@Component({
  selector: 'app-system-info',
  standalone: true,
  imports: [JsonPipe],
  templateUrl: './system-info.component.html',
  styleUrl: './system-info.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SystemInfoComponent {
  #sysInfo = inject(SysinfoState);

  systemInfo = this.#sysInfo.systemInfo;
}
