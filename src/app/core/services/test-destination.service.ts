import { inject, Injectable } from '@angular/core';
import { SparkleDialogService } from '@sparkle-ui/core';
import { Observable, Subscriber } from 'rxjs';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { DestinationTestResponseDto, DuplicatiServerService, PostApiV2DestinationTestResponse } from '../openapi';
import { SysinfoState } from '../states/sysinfo.state';

export type TestDestinationResult = {
  action: 'success' | 'generic-error' | 'test-again' | 'trust-cert' | 'approve-host-key';
  targetUrl: string;
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
  #dupServer = inject(DuplicatiServerService);
  #dialog = inject(SparkleDialogService);
  #sysinfo = inject(SysinfoState);

  testDestination(targetUrl: string, destinationIndex: number, askToCreate: boolean, suppressErrorDialogs: boolean) {
    if (this.#sysinfo.hasV2TestOperations()) return this.testDestinationv2(targetUrl, destinationIndex, askToCreate, suppressErrorDialogs);
    else return this.testDestinationv1(targetUrl, destinationIndex, askToCreate, suppressErrorDialogs);
  }

  private testDestinationv2(
    targetUrl: string,
    destinationIndex: number,
    askToCreate: boolean,
    suppressErrorDialogs: boolean
  ) {
    return new Observable<TestDestinationResult>((observer) => {
      this.#dupServer
        .postApiV2DestinationTest({
          requestBody: {
            DestinationUrl: targetUrl,
            AutoCreate: false,
            Options: null,
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
            const res = err?.error?.body as PostApiV2DestinationTestResponse;
            if (res?.Data?.FolderExists === false || res?.StatusCode === 'missing-folder') {
              if (askToCreate) this.handleMissingFolder(observer, targetUrl, destinationIndex);
              else
                this.handleGenericError(
                  observer,
                  targetUrl,
                  destinationIndex,
                  $localize`The remote destination folder does not exist.`,
                  suppressErrorDialogs
                );
              return;
            }

            if (res?.Data?.HostCertificate) {
              this.handleMissingCertificate(observer, targetUrl, destinationIndex, res.Data?.HostCertificate);
              return;
            }

            if (res?.Data?.ReportedHostKey) {
              this.handleIncorrectKey(
                observer,
                targetUrl,
                destinationIndex,
                res.Data.ReportedHostKey,
                res.Data.AcceptedHostKey ?? null
              );
              return;
            }

            this.handleGenericError(observer, targetUrl, destinationIndex, err?.message ?? 'Unknown error', suppressErrorDialogs);
          },
        });
    });
  }

  private testDestinationv1(targetUrl: string, destinationIndex: number, askToCreate: boolean, suppressErrorDialogs: boolean) {
    return new Observable<TestDestinationResult>((observer) => {
      this.#dupServer
        .postApiV1RemoteoperationTest({
          requestBody: {
            path: targetUrl,
          },
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
            this.handleDestinationErrorv1(err.message, targetUrl, destinationIndex, askToCreate, suppressErrorDialogs).subscribe((res) => {
              observer.next(res);
            });
          },
        });
    });
  }

  private handleMissingFolder(
    observer: Subscriber<TestDestinationResult>,
    targetUrl: string,
    destinationIndex: number
  ) {
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Create folder`,
        message: $localize`The remote destination folder does not exist, do you want to create it?`,
        confirmText: $localize`Create folder`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res)
        {
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

  private reportNoAction(observer: Subscriber<TestDestinationResult>, targetUrl: string, destinationIndex: number, message: string) {
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
    certData: string
  ) {
    this.#dialog.open(ConfirmDialogComponent, {
      maxWidth: '500px',
      data: {
        title: $localize`Trust the certificate`,
        message: $localize`The server is using a certificate that is not trusted.
  If this is a self-signed certificate, you can choose to trust this certificate.
  The server reported the certificate hash: ${certData}`,
        confirmText: $localize`Trust the certificate`,
        cancelText: $localize`Cancel`,
      },
      closed: (res: boolean) => {
        if (!res) {
          this.reportNoAction(observer, targetUrl, destinationIndex, $localize`The server certificate is not trusted.`);
          return;
        }

        observer.next({
          action: 'trust-cert',
          targetUrl,
          testAgain: true,
          certData,
          destinationIndex,
        });
        observer.complete();
      },
    });
  }

  private handleIncorrectKey(
    observer: Subscriber<TestDestinationResult>,
    targetUrl: string,
    destinationIndex: number,
    reportedhostkey: string,
    suppliedhostkey: string | null
  ) {
    if (!suppliedhostkey) {
      this.#dialog.open(ConfirmDialogComponent, {
        maxWidth: '500px',
        data: {
          title: $localize`Approve host key?`,
          message: $localize`No certificate was specified, please verify that the reported host key is correct: ${reportedhostkey}`,
          confirmText: $localize`Approve`,
          cancelText: $localize`Cancel`,
        },
        closed: (res) => {
          if (!res) {
            this.reportNoAction(observer, targetUrl, destinationIndex, $localize`The host key was not approved.`);
            return;
          }

          observer.next({
            action: 'approve-host-key',
            targetUrl,
            testAgain: true,
            reportedHostKey: reportedhostkey,
            destinationIndex,
          });
          observer.complete();
        },
      });
    } else {
      // MITM dialog
      this.#dialog.open(ConfirmDialogComponent, {
        maxWidth: '500px',
        data: {
          title: $localize`The host key has changed`,
          message: $localize`The host key has changed, please check with the server administrator if this is correct,
otherwise you could be the victim of a MAN-IN-THE-MIDDLE attack.
Do you want to REPLACE your CURRENT host key ${suppliedhostkey}
with the REPORTED host key: ${reportedhostkey}?`,
          confirmText: $localize`Approve`,
          cancelText: $localize`Cancel`,
        },
        closed: (res) => {
          if (!res) {
            this.reportNoAction(observer, targetUrl, destinationIndex, $localize`The host key was not approved.`);
            return;
          }

          observer.next({
            action: 'approve-host-key',
            targetUrl,
            testAgain: true,
            reportedHostKey: reportedhostkey,
            destinationIndex,
          });
          observer.complete();
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
    destinationIndex: number,
    askToCreate: boolean,
    suppressErrorDialogs: boolean
  ) {
    return new Observable<TestDestinationResult>((observer) => {
      if (errorMessage === 'missing-folder') {
        if (askToCreate) this.handleMissingFolder(observer, targetUrl, destinationIndex);
        else
          this.handleGenericError(
            observer,
            targetUrl,
            destinationIndex,
            $localize`The remote destination folder does not exist.`,
            suppressErrorDialogs
          );
        return;
      }

      if (errorMessage.startsWith('incorrect-cert:')) {
        const certData = errorMessage.split('incorrect-cert:')[1];
        this.handleMissingCertificate(observer, targetUrl, destinationIndex, certData);
        return;
      }

      if (errorMessage.startsWith('incorrect-host-key:')) {
        const reportedhostkey = errorMessage.split('incorrect-host-key:"')[1].split('",')[0];
        const suppliedhostkey = errorMessage.split('accepted-host-key:"')[1].split('",')[0];
        this.handleIncorrectKey(observer, targetUrl, destinationIndex, reportedhostkey, suppliedhostkey);
        return;
      }

      this.handleGenericError(observer, targetUrl, destinationIndex, errorMessage, suppressErrorDialogs);
    });
  }
}
