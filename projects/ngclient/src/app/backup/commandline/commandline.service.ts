import { Injectable } from '@angular/core';
import { SettingInputDto } from '../../core/openapi';

export interface CommandlineState {
  command: string;
  targetUrl: string;
  arguments: string;
  backupId: string;
  backupName: string;
  dbpath: string;
  filters: string[];
  options: SettingInputDto[];
}

@Injectable({
  providedIn: 'root',
})
export class CommandlineService {
  #states = new Map<string, CommandlineState>();

  saveState(state: CommandlineState): string {
    const id = crypto.randomUUID();
    this.#states.set(id, state);
    return id;
  }

  getState(id: string): CommandlineState | undefined {
    return this.#states.get(id);
  }
}
