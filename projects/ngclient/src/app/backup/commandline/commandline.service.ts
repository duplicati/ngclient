import { Injectable } from '@angular/core';
import { SettingInputDto } from '../../core/openapi';
import { randomUUID } from '../../core/functions/crypto';

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
    const id = randomUUID();
    this.#states.set(id, state);
    return id;
  }

  getState(id: string): CommandlineState | undefined {
    return this.#states.get(id);
  }
}
