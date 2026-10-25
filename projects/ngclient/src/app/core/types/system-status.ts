import { IProgressEventData } from '../openapi';

/** Machine information in a system status snapshot; values the server cannot determine are null */
export type SystemStatusMachine = {
  ProcessorCount: number;
  /** Machine-wide CPU usage since the previous snapshot, 0..1 */
  CpuUsage: number | null;
  TotalMemory: number | null;
  AvailableMemory: number | null;
};

/** Resource usage for the server process or a controller process it runs */
export type SystemStatusProcess = {
  Role: 'server' | 'controller' | string;
  ProcessId: number;
  StartTime: string | null;
  /** CPU usage since the previous snapshot as a fraction of all processors, 0..1 */
  CpuUsage: number | null;
  WorkingSet: number;
  PrivateMemory: number;
  ManagedHeapSize: number | null;
  ThreadCount: number;
};

export type SystemStatusQueueItem = {
  TaskID: number;
  BackupID: string | null;
  BackupName: string | null;
  Operation: string;
  Status: 'Running' | 'Waiting' | string;
  TaskStarted: string | null;
};

/**
 * A snapshot pushed by the `systemstatus` websocket subscription.
 * The server keeps no history, so trends are collected on the client.
 */
export type SystemStatusSnapshot = {
  Timestamp: string;
  IntervalMs: number;
  Machine: SystemStatusMachine;
  Processes: SystemStatusProcess[];
  Queue: SystemStatusQueueItem[];
  Progress: IProgressEventData | null;
};
