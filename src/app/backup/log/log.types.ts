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
  DeletedFileCount: number;
  DownloadedFileCount: number;
  UploadedFileCount: number;
  DeletedFileSize: number;
  DownloadedFileSize: number;
  UploadedFileSize: number;
  Dryrun: boolean;
  VacuumResults: null;
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
  BackendStatistics: BackendStatistics;
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

export type DuplicatiBackupResult = BackupResult | TestResult;
