export interface BackendStatistics {
  RemoteCalls: number;
  BytesUploaded: number;
  BytesDownloaded: number;
  FilesUploaded: number;
  FilesDownloaded: number;
  FilesDeleted: number;
  FoldersCreated: number;
  RetryAttempts: number;
  UnknownFileSize: number;
  UnknownFileCount: number;
  KnownFileCount: number;
  KnownFileSize: number;
  LastBackupDate: string;
  BackupListCount: number;
  TotalQuotaSpace: number;
  FreeQuotaSpace: number;
  AssignedQuotaSpace: number;
  ReportedQuotaError: boolean;
  ReportedQuotaWarning: boolean;
  MainOperation: string;
  ParsedResult: string;
  Interrupted: boolean;
  Version: string;
  EndTime: string;
  BeginTime: string;
  Duration: string;
  MessagesActualLength: number;
  WarningsActualLength: number;
  ErrorsActualLength: number;
  Messages: string[] | null;
  Warnings: string[] | null;
  Errors: string[] | null;
}

export interface CompactResults {
  DeletedFileCount?: number;
  DownloadedFileCount?: number;
  UploadedFileCount?: number;
  DeletedFileSize?: number;
  DownloadedFileSize?: number;
  UploadedFileSize?: number;
  Dryrun?: boolean;
  VacuumResults?: null;
  MainOperation?: string;
  ParsedResult?: string;
  Interrupted?: boolean;
  Version?: string;
  EndTime?: string;
  BeginTime?: string;
  Duration?: string;
  MessagesActualLength?: number;
  WarningsActualLength?: number;
  ErrorsActualLength?: number;
  Messages?: string[] | null;
  Warnings?: string[] | null;
  Errors?: string[] | null;
  BackendStatistics?: BackendStatistics;
}

export interface Verification {
  Key: string;
  Value: string[];
}

export interface TestResults {
  MainOperation: string;
  VerificationsActualLength: number;
  Verifications: Verification[];
  ParsedResult: string;
  Interrupted: boolean;
  Version: string;
  EndTime: string;
  BeginTime: string;
  Duration: string;
  MessagesActualLength: number;
  WarningsActualLength: number;
  ErrorsActualLength: number;
  Messages: string[] | null;
  Warnings: string[] | null;
  Errors: string[] | null;
  BackendStatistics: BackendStatistics;
}

/** A file that failed verification during a restore test */
export interface RestoreTestFailure {
  Path: string;
  Reason: 'HashMismatch' | 'SizeMismatch' | 'MissingRemoteVolume' | 'RestoreError' | 'MetadataMismatch' | string;
  Expected: string | null;
  Actual: string | null;
}

/** A difference found between the backup and the live source file during a restore test */
export interface RestoreTestSourceDifference {
  Path: string;
  Reason: string;
  Expected: string | null;
  Actual: string | null;
}

export interface RestoreTestBudget {
  Exceeded: boolean;
  Reason: 'None' | 'DownloadSize' | 'Runtime' | string;
}

/**
 * The result of a restore test, either run after a backup (BackupResult.RestoreTestResults)
 * or as a standalone operation (MainOperation 'RestoreTest').
 * Its warnings and errors are not forwarded to the parent backup result.
 */
export interface RestoreTestResults {
  MainOperation: string;
  Mode: 'RandomFiles' | 'RandomSize' | 'Full' | 'Rolling' | string;
  /** The backup version that was tested, 0 is the newest */
  Version: number;
  Seed: number;
  FilesTested: number;
  FilesPassed: number;
  FilesFailed: number;
  FilesSkipped: number;
  BytesRestored: number;
  BytesDownloaded: number;
  RemoteVolumesDownloaded: number;
  DatabaseRecreated: boolean;
  FailuresActualLength: number;
  Failures: RestoreTestFailure[] | null;
  SourceDifferencesActualLength: number;
  SourceDifferences: RestoreTestSourceDifference[] | null;
  Budget: RestoreTestBudget | null;
  ParsedResult: string;
  Interrupted: boolean;
  EndTime: string;
  BeginTime: string;
  Duration: string;
  MessagesActualLength: number;
  WarningsActualLength: number;
  ErrorsActualLength: number;
  Messages: string[] | null;
  Warnings: string[] | null;
  Errors: string[] | null;
  BackendStatistics: BackendStatistics;
}

export interface LockResults {
  MainOperation: string;
  VolumesRead: number;
  VolumesUpdated: number;
  ParsedResult: string;
  Interrupted: boolean;
  Version: string;
  EndTime: string;
  BeginTime: string;
  Duration: string;
  MessagesActualLength: number;
  WarningsActualLength: number;
  ErrorsActualLength: number;
  Messages: string[] | null;
  Warnings: string[] | null;
  Errors: string[] | null;
  BackendStatistics: BackendStatistics;
}

export interface BackupResult {
  DeletedFiles: number;
  DeletedFolders: number;
  ModifiedFiles: number;
  ExaminedFiles: number;
  OpenedFiles: number;
  AddedFiles: number;
  SizeOfModifiedFiles: number;
  SizeOfAddedFiles: number;
  SizeOfExaminedFiles: number;
  SizeOfOpenedFiles: number;
  NotProcessedFiles: number;
  AddedFolders: number;
  TooLargeFiles: number;
  FilesWithError: number;
  ModifiedFolders: number;
  ModifiedSymlinks: number;
  AddedSymlinks: number;
  DeletedSymlinks: number;
  PartialBackup: boolean;
  Dryrun: boolean;
  MainOperation: string;
  CompactResults: CompactResults;
  VacuumResults: null;
  DeleteResults: null;
  RepairResults: null;
  TestResults: TestResults;
  RestoreTestResults: RestoreTestResults | null;
  RemoteSynchronizationResults: RemoteSynchronizationResult[];
  LockResults: LockResults;
  ParsedResult: string;
  Interrupted: boolean;
  Version: string;
  EndTime: string;
  BeginTime: string;
  Duration: string;
  MessagesActualLength: number;
  WarningsActualLength: number;
  ErrorsActualLength: number;
  Messages: string[];
  Warnings: string[];
  Errors: string[];
  BackendStatistics: BackendStatistics;
}

/**
 * The fields a sync run adds to its result, next to the common result fields.
 */
export interface SyncResult {
  FoldersCreated: number;
  FoldersDeleted: number;
  FilesUploaded: number;
  UnchangedFiles: number;
  FilesDeleted: number;
  SourceFiles: number;
  SizeOfSourceFiles: number;
  SizeOfUploadedFiles: number;
  SizeOfDeletedFiles: number;
}

interface VerificationItem {
  Key: string;
  Value: any[];
}

export interface TestResult {
  MainOperation: string;
  VerificationsActualLength: number;
  Verifications: VerificationItem[];
  ParsedResult: string;
  Interrupted: boolean;
  Version: string;
  EndTime: string;
  BeginTime: string;
  Duration: string;
  MessagesActualLength: number;
  WarningsActualLength: number;
  ErrorsActualLength: number;
  Messages: string[];
  Warnings: string[];
  Errors: string[];
  BackendStatistics: BackendStatistics;
}

export interface RemoteSynchronizationResult {
  Destination: string;
  DeletedFileCount: number;
  RenamedFileCount: number;
  CopiedFileCount: number;
  VerifiedFileCount: number;
  FailedVerificationCount: number;
  CopiedFileSize: number;
  MainOperation: string;
  ParsedResult: string;
  Interrupted: boolean;
  Version: string;
  EndTime: string;
  BeginTime: string;
  Duration: string;
  MessagesActualLength: number;
  WarningsActualLength: number;
  ErrorsActualLength: number;
  Messages: string[] | null;
  Warnings: string[] | null;
  Errors: string[] | null;
}

export type DuplicatiBackupResult = BackupResult | TestResult;
