import { Injectable, effect, inject, signal } from '@angular/core';
import { StatusBarState } from '../core/components/status-bar/status-bar.state';
import { ServerStateService } from '../core/services/server-state.service';

export interface RecentFile {
  filename: string;
  filesize: number;
  timestamp: Date;
}

export interface ETAData {
  startTime: Date;
  filesProcessedAtStart: number;
  bytesProcessedAtStart: number;
  currentFilesPerSecond: number;
  currentBytesPerSecond: number;
  estimatedCompletion: Date | null;
  metric: 'files' | 'bytes';
}

@Injectable({
  providedIn: 'root',
})
export class StatusPageState {
  #statusBarState = inject(StatusBarState);
  #serverState = inject(ServerStateService);

  #recentFiles = signal<RecentFile[]>([]);
  recentFiles = this.#recentFiles.asReadonly();
  #maxRecentFiles = 5;

  #etaData = signal<ETAData | null>(null);
  etaData = this.#etaData.asReadonly();

  #viewActivatedAt: Date | null = null;
  #initialProgress: { files: number; bytes: number } | null = null;
  #etaInterval: number | null = null;

  recentFileEffect = effect(() => {
    const statusData = this.#statusBarState.statusData();
    if (statusData && statusData.CurrentFilename && statusData.CurrentFilesize !== undefined) {
      this.#addRecentFile(statusData.CurrentFilename, statusData.CurrentFilesize);
    }
  });

  #addRecentFile(filename: string, filesize: number) {
    const now = new Date();

    this.#recentFiles.update((files) => {
      if (files.length > 0 && files[0].filename === filename) {
        return files;
      }

      const newFiles = [{ filename, filesize, timestamp: now }, ...files];

      return newFiles.slice(0, this.#maxRecentFiles);
    });
  }

  activateView() {
    this.#viewActivatedAt = new Date();

    const statusData = this.#statusBarState.statusData();

    if (statusData && statusData.ProcessedFileCount !== undefined && statusData.ProcessedFileSize !== undefined) {
      this.#initialProgress = {
        files: statusData.ProcessedFileCount,
        bytes: statusData.ProcessedFileSize,
      };
    }

    this.#etaInterval = setInterval(() => {
      this.#calculateETA();
    }, 1000);
  }

  deactivateView() {
    this.#viewActivatedAt = null;
    this.#initialProgress = null;
    if (this.#etaInterval) {
      clearInterval(this.#etaInterval);
      this.#etaInterval = null;
    }
  }

  #calculateETA() {
    if (!this.#viewActivatedAt || !this.#initialProgress) return;

    const statusData = this.#statusBarState.statusData();
    if (!statusData) return;

    const now = new Date();
    const elapsedSeconds = (now.getTime() - this.#viewActivatedAt.getTime()) / 1000;

    // Wait for minimum elapsed time (5 seconds)
    if (elapsedSeconds < 5) return;

    const currentProcessedFiles = statusData.ProcessedFileCount || 0;
    const currentProcessedBytes = statusData.ProcessedFileSize || 0;

    const filesProcessedSinceStart = currentProcessedFiles - this.#initialProgress.files;
    const bytesProcessedSinceStart = currentProcessedBytes - this.#initialProgress.bytes;

    const filesPerSecond = filesProcessedSinceStart / elapsedSeconds;
    const bytesPerSecond = bytesProcessedSinceStart / elapsedSeconds;

    const remainingFiles = (statusData.TotalFileCount || 0) - currentProcessedFiles;
    const remainingBytes = (statusData.TotalFileSize || 0) - currentProcessedBytes;

    let etaFiles: number | null = null;
    let etaBytes: number | null = null;

    if (filesPerSecond > 0) {
      etaFiles = remainingFiles / filesPerSecond;
    }

    if (bytesPerSecond > 0) {
      etaBytes = remainingBytes / bytesPerSecond;
    }

    let estimatedCompletion: Date | null = null;
    let metric: 'files' | 'bytes' = 'bytes';

    if (etaFiles !== null && etaBytes !== null) {
      const etaSeconds = Math.max(etaFiles, etaBytes);
      estimatedCompletion = new Date(now.getTime() + etaSeconds * 1000);
      metric = etaFiles > etaBytes ? 'files' : 'bytes';
    } else if (etaFiles !== null) {
      estimatedCompletion = new Date(now.getTime() + etaFiles * 1000);
      metric = 'files';
    } else if (etaBytes !== null) {
      estimatedCompletion = new Date(now.getTime() + etaBytes * 1000);
      metric = 'bytes';
    }

    this.#etaData.set({
      startTime: this.#viewActivatedAt,
      filesProcessedAtStart: this.#initialProgress.files,
      bytesProcessedAtStart: this.#initialProgress.bytes,
      currentFilesPerSecond: filesPerSecond,
      currentBytesPerSecond: bytesPerSecond,
      estimatedCompletion,
      metric,
    });
  }
}
