import { inject, Injectable } from '@angular/core';
import { ShipDialogService } from '@ship-ui/core';
import { Observable, Subscriber } from 'rxjs';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import {
  DestinationTestResponseDto,
  DuplicatiServer,
  PostApiV2DestinationTestResponse,
  RemoteDestinationType,
} from '../openapi';
import { SysinfoState } from '../states/sysinfo.state';

export type FolderHandlingOption = 'prompt' | 'create' | 'error';

export type TestDestinationResult = {
  action: 'success' | 'generic-error' | 'missing-folder' | 'test-again' | 'trust-cert' | 'approve-host-key';
  targetUrl: string;
  suggestedUrl?: string;
  testAgain: boolean;
  certData?: string;
  reportedHostKey?: string;
  destinationIndex: number;
  anyFilesFound?: boolean;
  containsBackup?: boolean;
  containsEncryptedBackupFiles?: boolean;
  errorMessage?: string;
};

@Injectable({
  providedIn: 'root',
})
export class TestDestinationService {
  #dupServer = inject(DuplicatiServer);
  #dialog = inject(ShipDialogService);
  #sysinfo = inject(SysinfoState);

  testDestination(
    targetUrl: string,
    backupId: string | null,
    destinationIndex: number,
    urlType: RemoteDestinationType,
    suppressErrorDialogs: boolean,
    folderHandling: FolderHandlingOption
  ) {
    if (this.#sysinfo.hasV2TestOperations())
      return this.testDestinationv2(
        targetUrl,
        backupId,
        destinationIndex,
        urlType,
        suppressErrorDialogs,
        folderHandling
      );
    else
      return this.testDestinationv1(
        targetUrl,
        backupId,
        destinationIndex,
        urlType,
        suppressErrorDialogs,
        folderHandling
      );
  }

  private testDestinationv2(
    targetUrl: string,
    backupId: string | null,
    destinationIndex: number,
    urlType: RemoteDestinationType,
    suppressErrorDialogs: boolean,
    folderHandling: FolderHandlingOption
  ) {
    return new Observable<TestDestinationResult>((observer) => {
      this.#dupServer
        .postApiV2DestinationTest({
          requestBody: {
            DestinationUrl: targetUrl,
            BackupId: backupId == 'new' ? null : backupId,
            AutoCreate: folderHandling === 'create',
            Options: null,
            DestinationType: urlType,
          },
        })
        .subscribe({
          next: (res) => {
            if (res.Success) {
              this.emitSuccessV2(observer, targetUrl, destinationIndex, res);
              return;
            }

            this.handleGenericError(
              observer,
              targetUrl,
              destinationIndex,
              res.Error ?? 'Unknown error',
              suppressErrorDialogs
            );
          },
          error: (err) => {
            const res = (err?.error?.body ?? err?.error?.requestBody) as PostApiV2DestinationTestResponse;
            if (res?.Data?.FolderExists === false || res?.StatusCode === 'missing-folder') {
              this.handleMissingFolder(
                observer,
                targetUrl,
                backupId,
                destinationIndex,
                suppressErrorDialogs,
                folderHandling
              );
              return;
            }

            if (res?.Data?.HostCertificate) {
              this.handleMissingCertificate(
                observer,
                targetUrl,
                destinationIndex,
                res.Data?.HostCertificate,
                suppressErrorDialogs
              );
              return;
            }

            if (res?.Data?.ReportedHostKey) {
              this.handleIncorrectKey(
                observer,
                targetUrl,
                destinationIndex,
                res.Data.ReportedHostKey,
                res.Data.AcceptedHostKey ?? null,
                suppressErrorDialogs
              );
              return;
            }

            this.handleGenericError(
              observer,
              targetUrl,
              destinationIndex,
              err?.message ?? 'Unknown error',
              suppressErrorDialogs
            );
          },
        });
    });
  }

  private testDestinationv1(
    targetUrl: string,
    backupId: string | null,
    destinationIndex: number,
    urlType: RemoteDestinationType,
    suppressErrorDialogs: boolean,
    folderHandling: FolderHandlingOption
  ) {
    // V1 does not support auto-create folders, but we should retire the use of V1 anyway
    return new Observable<TestDestinationResult>((observer) => {
      this.#dupServer
        .postApiV1RemoteoperationTest({
          requestBody: {
            path: targetUrl,
            backupId: backupId == 'new' ? null : backupId,
          },
          type: urlType,
        })
        .subscribe({
          next: (_) => {
            observer.next({
              action: 'success',
              targetUrl,
              testAgain: false,
              destinationIndex,
            });
            observer.complete();
          },
          error: (err) => {
            this.handleDestinationErrorv1(
              err.message,
              targetUrl,
              backupId,
              destinationIndex,
              suppressErrorDialogs,
              folderHandling
            ).subscribe((res) => {
              observer.next(res);
            });
          },
        });
    });
  }

  private handleMissingFolder(
    observer: Subscriber<TestDestinationResult>,
    targetUrl: string,
    backupId: string | null,
    destinationIndex: number,
    suppressErrorDialogs: boolean,
    folderHandling: FolderHandlingOption
  ) {
    function sendError() {
      observer.next({
        action: 'missing-folder',
        targetUrl,
        testAgain: false,
        destinationIndex,
        errorMessage: $localize`The remote destination folder does not exist.`,
      });
      observer.complete();
    }

    if (suppressErrorDialogs || folderHandling === 'error') {
      sendError();
      return;
    }

    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Create folder`,
        message: $localize`The remote destination folder does not exist, do you want to create it?`,
        confirmText: $localize`Create folder`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) {
          this.reportNoAction(observer, targetUrl, destinationIndex, $localize`The remote folder does not exist.`);
          return;
        }

        if (this.#sysinfo.hasV2TestOperations()) {
          this.#dupServer
            .postApiV2DestinationTest({
              requestBody: {
                DestinationUrl: targetUrl,
                AutoCreate: true,
                Options: null,
                BackupId: backupId == 'new' ? null : backupId,
              },
            })
            .subscribe({
              next: (res) => {
                if (res.Success) {
                  this.emitSuccessV2(observer, targetUrl, destinationIndex, res);
                  return;
                } else {
                  this.handleFolderCreateFailure(
                    observer,
                    targetUrl,
                    destinationIndex,
                    res.Error ?? $localize`Unknown error`
                  );
                }
              },
              error: (err) => {
                this.handleFolderCreateFailure(
                  observer,
                  targetUrl,
                  destinationIndex,
                  err.message ?? $localize`Unknown error`
                );
              },
            });
        } else {
          this.#dupServer
            .postApiV1RemoteoperationCreate({
              requestBody: {
                path: targetUrl,
                backupId: backupId == 'new' ? null : backupId,
              },
            })
            .subscribe({
              next: () => {
                this.handleFolderCreated(observer, targetUrl, destinationIndex);
              },
              error: (err) => {
                this.handleFolderCreateFailure(
                  observer,
                  targetUrl,
                  destinationIndex,
                  err.message ?? $localize`Unknown error`
                );
              },
            });
        }
      },
    });
  }

  private handleFolderCreateFailure(
    observer: Subscriber<TestDestinationResult>,
    targetUrl: string,
    destinationIndex: number,
    errorMessage: string
  ) {
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Error creating folder`,
        message: $localize`The remote destination folder could not be created. ${errorMessage}`,
        confirmText: $localize`OK`,
        cancelText: null,
      },
      closed: () => {
        observer.next({
          action: 'generic-error',
          targetUrl,
          testAgain: false,
          destinationIndex,
        });
        observer.complete();
      },
    });
  }

  private emitSuccessV2(
    observer: Subscriber<TestDestinationResult>,
    targetUrl: string,
    destinationIndex: number,
    res: DestinationTestResponseDto
  ) {
    observer.next({
      action: 'success',
      targetUrl,
      testAgain: false,
      destinationIndex,
      anyFilesFound: !res.Data?.FolderIsEmpty,
      containsBackup: res.Data?.FolderContainsBackupFiles ?? undefined,
      containsEncryptedBackupFiles: res.Data?.FolderContainsEncryptedBackupFiles ?? undefined,
    });
    observer.complete();
  }

  private handleFolderCreated(
    observer: Subscriber<TestDestinationResult>,
    targetUrl: string,
    destinationIndex: number
  ) {
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Folder created`,
        message: $localize`The remote destination folder was created successfully.`,
        confirmText: $localize`OK`,
        cancelText: null,
      },
      closed: () => {
        observer.next({
          action: 'test-again',
          targetUrl,
          testAgain: true,
          destinationIndex,
        });
        observer.complete();
      },
    });
  }

  private reportNoAction(
    observer: Subscriber<TestDestinationResult>,
    targetUrl: string,
    destinationIndex: number,
    message: string
  ) {
    observer.next({
      action: 'generic-error',
      targetUrl,
      errorMessage: message,
      testAgain: false,
      destinationIndex,
    });
    observer.complete();
  }

  private handleMissingCertificate(
    observer: Subscriber<TestDestinationResult>,
    targetUrl: string,
    destinationIndex: number,
    certData: string,
    suppressErrorDialogs: boolean
  ) {
    const msg = $localize`The server is using a certificate that is not trusted.
  If this is a self-signed certificate, you can choose to trust this certificate.
  The server reported the certificate hash: ${certData}`;

    const targetUrlHasParams = targetUrl.includes('?');

    function sendError() {
      observer.next({
        action: 'trust-cert',
        targetUrl,
        suggestedUrl: targetUrl + `${targetUrlHasParams ? '&' : '?'}accept-specified-ssl-hash=${certData}`,
        testAgain: true,
        certData,
        errorMessage: msg,
        destinationIndex,
      });

      observer.complete();
    }

    if (suppressErrorDialogs) {
      sendError();
      return;
    }

    this.#dialog.open(ConfirmDialogComponent, {
      maxWidth: '500px',
      data: {
        title: $localize`Trust the certificate`,
        message: msg,
        confirmText: $localize`Trust the certificate`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) {
          this.reportNoAction(observer, targetUrl, destinationIndex, $localize`The server certificate is not trusted.`);
          return;
        }
        sendError();
      },
    });
  }

  private handleIncorrectKey(
    observer: Subscriber<TestDestinationResult>,
    targetUrl: string,
    destinationIndex: number,
    reportedhostkey: string,
    suppliedhostkey: string | null,
    suppressErrorDialogs: boolean
  ) {
    if (!suppliedhostkey) {
      const msg = $localize`No certificate was specified, please verify that the reported host key is correct: ${reportedhostkey}`;
      const targetUrlHasParams = targetUrl.includes('?');

      function sendError() {
        observer.next({
          action: 'approve-host-key',
          targetUrl,
          suggestedUrl: targetUrl + `${targetUrlHasParams ? '&' : '?'}ssh-fingerprint=${reportedhostkey}`,
          testAgain: true,
          reportedHostKey: reportedhostkey,
          errorMessage: msg,
          destinationIndex,
        });
        observer.complete();
      }

      if (suppressErrorDialogs) {
        sendError();
        return;
      }

      this.#dialog.open(ConfirmDialogComponent, {
        maxWidth: '500px',
        data: {
          title: $localize`Approve host key?`,
          message: msg,
          confirmText: $localize`Approve`,
          cancelText: $localize`Cancel`,
        },
        closed: (res) => {
          if (!res) {
            this.reportNoAction(observer, targetUrl, destinationIndex, $localize`The host key was not approved.`);
            return;
          }

          sendError();
        },
      });
    } else {
      // MITM dialog
      const msg = $localize`The host key has changed, please check with the server administrator if this is correct,
otherwise you could be the victim of a MAN-IN-THE-MIDDLE attack.
Do you want to REPLACE your CURRENT host key ${suppliedhostkey}
with the REPORTED host key: ${reportedhostkey}?`;

      let suggestedUrl = targetUrl;
      try {
        // Use URL class to safely set/replace the parameter
        const url = new URL(targetUrl);
        url.searchParams.set('ssh-fingerprint', reportedhostkey);
        suggestedUrl = url.toString();
      } catch {
        // Fallback for invalid URLs: remove existing param via regex and append new one
        const cleanUrl = targetUrl.replace(/([?&])ssh-fingerprint=[^&]*/, '');
        const hasParams = cleanUrl.includes('?');
        suggestedUrl = cleanUrl + `${hasParams ? '&' : '?'}ssh-fingerprint=${reportedhostkey}`;
      }

      function sendError() {
        observer.next({
          action: 'approve-host-key',
          targetUrl,
          suggestedUrl,
          testAgain: true,
          reportedHostKey: reportedhostkey,
          errorMessage: msg,
          destinationIndex,
        });
        observer.complete();
      }

      if (suppressErrorDialogs) {
        sendError();
        return;
      }

      this.#dialog.open(ConfirmDialogComponent, {
        maxWidth: '500px',
        data: {
          title: $localize`The host key has changed`,
          message: msg,
          confirmText: $localize`Approve`,
          cancelText: $localize`Cancel`,
        },
        closed: (res) => {
          if (!res) {
            this.reportNoAction(observer, targetUrl, destinationIndex, $localize`The host key was not approved.`);
            return;
          }

          sendError();
        },
      });
    }
  }

  private handleGenericError(
    observer: Subscriber<TestDestinationResult>,
    targetUrl: string,
    destinationIndex: number,
    errorMessage: string,
    suppressErrorDialogs: boolean
  ) {
    function sendError() {
      observer.next({
        action: 'generic-error',
        targetUrl,
        testAgain: false,
        destinationIndex,
        errorMessage,
      });
      observer.complete();
    }

    if (suppressErrorDialogs) {
      sendError();
      return;
    }

    this.#dialog.open(ConfirmDialogComponent, {
      maxWidth: '500px',
      data: {
        title: $localize`Test connection failed`,
        message: errorMessage,
        cancelText: $localize`OK`,
      },
      closed: (_) => sendError(),
    });
  }

  private handleDestinationErrorv1(
    errorMessage: string,
    targetUrl: string,
    backupId: string | null,
    destinationIndex: number,
    suppressErrorDialogs: boolean,
    folderHandling: FolderHandlingOption
  ) {
    return new Observable<TestDestinationResult>((observer) => {
      if (errorMessage === 'missing-folder') {
        this.handleMissingFolder(observer, targetUrl, backupId, destinationIndex, suppressErrorDialogs, folderHandling);
        return;
      }

      if (errorMessage.startsWith('incorrect-cert:')) {
        const certData = errorMessage.split('incorrect-cert:')[1];
        this.handleMissingCertificate(observer, targetUrl, destinationIndex, certData, suppressErrorDialogs);
        return;
      }

      if (errorMessage.startsWith('incorrect-host-key:')) {
        const reportedhostkey = errorMessage.split('incorrect-host-key:"')[1].split('",')[0];
        const suppliedhostkey = errorMessage.split('accepted-host-key:"')[1].split('",')[0];
        this.handleIncorrectKey(
          observer,
          targetUrl,
          destinationIndex,
          reportedhostkey,
          suppliedhostkey,
          suppressErrorDialogs
        );
        return;
      }

      this.handleGenericError(observer, targetUrl, destinationIndex, errorMessage, suppressErrorDialogs);
    });
  }
}
