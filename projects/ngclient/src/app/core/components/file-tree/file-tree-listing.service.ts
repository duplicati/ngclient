import { inject, Injectable } from '@angular/core';
import { defer, map } from 'rxjs';
import { DuplicatiServer, RemoteDestinationType } from '../../openapi';
import { SysinfoState } from '../../states/sysinfo.state';

export type BackupSettings = { id: string; time: string };
export type RemoteSource = { mount: string; prefix: string; url: string; type: string; path: string };
export type PagedListResult = { items: any[]; hasMore: boolean; nextOffset: number };
export type FileTreeRemoteMode = 'gsuite' | 'o365' | 'diskimage' | 'backend' | null;

/** Read current inputs at the same points as the original deferred requests. */
export type FileTreeListingContext = {
  showFiles: () => boolean;
  backupId: () => string | null | undefined;
  destinationUrl: () => string | null | undefined;
  connectionStringId: () => number | null | undefined;
  sourcePrefix: () => string | null | undefined;
  destinationType: () => RemoteDestinationType;
  backupSettings: () => BackupSettings | null;
  customRemoteMode: () => FileTreeRemoteMode;
  loadExtendedData: () => boolean;
  isByBackupSettings: () => boolean;
};

const usev2Listing = true;

@Injectable({ providedIn: 'root' })
export class FileTreeListingService {
  #dupServer = inject(DuplicatiServer);
  #sysInfo = inject(SysinfoState);

  #getFilesystemPath(path: string, context: FileTreeListingContext) {
    return defer(() =>
      this.#dupServer.postApiV1Filesystem({
        query: {
          showHidden: true,
          onlyFolders: !context.showFiles(),
        },
        body: {
          path,
        },
      })
    );
  }

  #getBackendFiles(
    path: string | null,
    remote: RemoteSource | null,
    destinationType: RemoteDestinationType,
    context: FileTreeListingContext,
    offset: number | null = null
  ) {
    return defer(() =>
      this.#dupServer.postApiV2DestinationList({
        body: {
          BackupId: context.backupId() ?? null,
          DestinationUrl: remote?.url ?? context.destinationUrl() ?? null,
          ConnectionStringId: context.connectionStringId() ?? null,
          DestinationType: destinationType,
          SourcePrefix: remote?.prefix ?? context.sourcePrefix() ?? null,
          Path: path,
          Offset: offset,
          Limit: 100,
        },
      })
    ).pipe(
      map((res) => {
        const rawItems = res.Data?.Items ?? [];

        const result: PagedListResult = {
          items: rawItems
            .map((x) => ({
              ...x,
              Path: (remote?.prefix ?? '') + x.Path,
            }))
            .filter((x) => x.Metadata == null || !x.Metadata['ExtType']),
          hasMore: res.Data?.HasMore ?? false,
          nextOffset: (res.Data?.Offset ?? offset ?? 0) + rawItems.length,
        };

        return result;
      })
    );
  }

  #getMicrosoft365Files(path: string | null, remote: RemoteSource | null, context: FileTreeListingContext) {
    return defer(() =>
      this.#dupServer.postApiV1WebmoduleByModulekey({
        path: { modulekey: 'office365' },
        body: {
          'backup-id': context.backupId() ?? '',
          'source-prefix': remote?.prefix ?? context.sourcePrefix() ?? '',
          operation: 'ListDestinationRestoreTargets',
          url: remote?.url ?? context.destinationUrl() ?? '',
          path: path ?? '/',
        },
      })
    ).pipe(
      map((res) => {
        const d = res.Result;
        if (!d) {
          throw new Error('No result returned');
        }
        if (res.Status !== 'OK') {
          throw new Error(d['error'] ?? 'An error occured');
        }
        return Object.keys(d).map((key) => {
          return {
            Path: (remote?.prefix ?? '') + key,
            Metadata: JSON.parse(d[key]),
          };
        });
      })
    );
  }

  #getGoogleWorkspaceFiles(path: string | null, remote: RemoteSource | null, context: FileTreeListingContext) {
    return defer(() =>
      this.#dupServer.postApiV1WebmoduleByModulekey({
        path: { modulekey: 'googleworkspace' },
        body: {
          'backup-id': context.backupId() ?? '',
          'source-prefix': remote?.prefix ?? context.sourcePrefix() ?? '',
          operation: 'ListDestinationRestoreTargets',
          url: remote?.url ?? context.destinationUrl() ?? '',
          path: path ?? '/',
        },
      })
    ).pipe(
      map((res) => {
        const d = res.Result;
        if (!d) {
          throw new Error('No result returned');
        }

        if (res.Status !== 'OK') {
          throw new Error(d['error'] ?? 'An error occured');
        }
        return Object.keys(d).map((key) => {
          return {
            Path: (remote?.prefix ?? '') + key,
            Metadata: JSON.parse(d[key]),
          };
        });
      })
    );
  }

  #getDiskImagePaths(path: string | null) {
    return defer(() =>
      this.#dupServer.postApiV1WebmoduleByModulekey({
        path: { modulekey: 'diskimage' },
        body: {
          operation: 'ListDestinationRestoreTargets',
          path: path ?? '/',
        },
      })
    ).pipe(
      map((res) => {
        const d = res.Result as {
          [key: string]: string;
        };
        return Object.keys(d).map((key) => {
          return {
            Path: key,
            Metadata: JSON.parse(d[key]),
          };
        });
      })
    );
  }

  #getBackupFiles(path: string | null, context: FileTreeListingContext) {
    const backupSettings = context.backupSettings()!;
    if (this.#sysInfo.hasV2ListOperations()) {
      return defer(() =>
        this.#dupServer.postApiV2BackupListFolder({
          body: {
            BackupId: backupSettings.id,
            Time: backupSettings.time,
            Paths: path ? [path] : null,
            PageSize: 0, // TODO: Add pagination support
            Page: 0,
            ReturnExtended: context.customRemoteMode() !== null || context.loadExtendedData(),
          },
        })
      ).pipe(map((res) => res.Data ?? []));
    } else {
      return defer(() =>
        this.#dupServer.getApiV1BackupByIdFiles({
          path: { id: backupSettings.id + '' },
          query: {
            'prefix-only': false,
            'folder-contents': true,
            time: backupSettings.time,
            filter: path ? '@' + path : undefined,
          },
        })
      ).pipe(map((res) => res['Files'] ?? []));
    }
  }

  list(
    path: string,
    remote: RemoteSource | null | undefined,
    context: FileTreeListingContext,
    offset: number | null = null
  ) {
    if (remote?.type === 'office365') {
      if (this.#sysInfo.hasV2ListBackendOperations() && usev2Listing)
        return this.#getBackendFiles(remote.path, remote, 'SourceProvider', context, offset);

      return this.#getMicrosoft365Files(remote.path, remote, context);
    }

    if (context.customRemoteMode() === 'o365') {
      if (this.#sysInfo.hasV2ListBackendOperations() && usev2Listing)
        return this.#getBackendFiles(path, null, 'SourceProvider', context, offset);

      return this.#getMicrosoft365Files(path, null, context);
    }

    if (remote?.type === 'googleworkspace') {
      if (this.#sysInfo.hasV2ListBackendOperations() && usev2Listing)
        return this.#getBackendFiles(remote.path, remote, 'SourceProvider', context, offset);

      return this.#getGoogleWorkspaceFiles(remote.path, remote, context);
    }

    if (context.customRemoteMode() === 'gsuite') {
      if (this.#sysInfo.hasV2ListBackendOperations() && usev2Listing)
        return this.#getBackendFiles(path, null, 'SourceProvider', context, offset);

      return this.#getGoogleWorkspaceFiles(path, null, context);
    }

    if (remote?.type === 'diskimage') {
      if (this.#sysInfo.hasV2ListBackendOperations() && usev2Listing)
        return this.#getBackendFiles(remote.path, remote, 'SourceProvider', context, offset);

      return this.#getDiskImagePaths(remote.path);
    }

    if (context.customRemoteMode() === 'diskimage') {
      if (this.#sysInfo.hasV2ListBackendOperations() && usev2Listing)
        return this.#getBackendFiles(path, null, 'SourceProvider', context, offset);
      return this.#getDiskImagePaths(path);
    }

    // Any other remote source (e.g. smb, sftp) has no v1 fallback, so use the v2 list endpoint when available
    if (remote && this.#sysInfo.hasV2ListBackendOperations() && usev2Listing) {
      return this.#getBackendFiles(remote.path, remote, 'SourceProvider', context, offset);
    }

    if (context.isByBackupSettings()) {
      return this.#getBackupFiles(path, context);
    }

    if (context.customRemoteMode() === 'backend') {
      return this.#getBackendFiles(path, null, context.destinationType(), context, offset);
    }

    return this.#getFilesystemPath(path, context);
  }
}
