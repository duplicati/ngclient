import { inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { TasksService } from '../openapi';
import { Subscribed } from '../types/subscribed';

export type TasksRes = Subscribed<ReturnType<TasksService['getApiV1Tasks']>>;

@Injectable({
  providedIn: 'root',
})
export class TasksState {
  #taskService = inject(TasksService);

  tasks = signal<TasksRes>([]);
  tasksLoading = signal(false);

  getTasks() {
    this.tasksLoading.set(true);

    this.#taskService
      .getApiV1Tasks()
      .pipe(finalize(() => this.tasksLoading.set(false)))
      .subscribe({
        next: (res) => {
          this.tasks.set(res);
        },
      });
  }

  getTask(id: number) {
    // TODO maybe get task from server
    return this.tasks().find((x) => x.TaskID === id) ?? null;
  }
}
