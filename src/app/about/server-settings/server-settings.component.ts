import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ServerSettingsService } from '../../settings/server-settings.service';

@Component({
  selector: 'app-server-settings',
  imports: [JsonPipe],
  templateUrl: './server-settings.component.html',
  styleUrl: './server-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ServerSettingsComponent {
  #serverSettingsService = inject(ServerSettingsService);

  serverSettings = this.#serverSettingsService.serverSettings;
}
