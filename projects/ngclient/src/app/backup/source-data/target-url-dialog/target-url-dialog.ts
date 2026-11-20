import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { IDynamicModule, RemoteDestinationType } from '../../../core/openapi';
import { DestinationListItemComponent } from '../../destination/destination-list-item/destination-list-item.component';
import { POSTGRESQL_SCHEME } from '../../destination/destination.postgresql';
import { DestinationListComponent } from '../../destination/destination-list/destination-list.component';
import { getConfigurationByKey } from '../../destination/destination.config-utilities';
import { SingleDestinationComponent } from '../../destination/single-destination/single-destination.component';
import { CustomRemotePermissionsDialog } from '../custom-remote-permissions-dialog/custom-remote-permissions-dialog';
import { GoogleWorkspaceCountsDialog } from '../googleworkspace-counts-dialog/googleworkspace-counts-dialog';
import { Office365CountsDialog } from '../office365-counts-dialog/office365-counts-dialog';
import { PostgresqlCountsDialog } from '../postgresql-counts-dialog/postgresql-counts-dialog';
import { TestExpectation, TestState, TestUrl } from './test-url/test-url';

const POSTGRESQL_URL_PREFIX = `${POSTGRESQL_SCHEME}://`;

@Component({
  selector: 'app-target-url-dialog',
  imports: [
    SingleDestinationComponent,
    DestinationListComponent,
    DestinationListItemComponent,
    ShipButton,
    ShipIcon,
    TestUrl,
  ],
  templateUrl: './target-url-dialog.html',
  styleUrl: './target-url-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TargetUrlDialog {
  #dialog = inject(ShipDialogService);

  data = input<{
    targetUrlModel: string | null;
    backupId: string | null;
    sourcePrefix: string | null;
    moduleType: RemoteDestinationType;
    askToCreate: boolean;
    expectedResult: TestExpectation;
    suppressErrorDialogs: boolean;
  }>();
  closed = output<string | null>();

  targetUrlModel = signal<string | null>(null);
  moduleType = signal<RemoteDestinationType>('Backend');
  askToCreate = signal<boolean>(false);
  expectedResult = signal<TestExpectation>('any');
  suppressErrorDialogs = signal<boolean>(false);
  backupId = signal<string | null>(null);
  sourcePrefix = signal<string | null>(null);

  dataEffect = effect(() => {
    const data = this.data();

    data?.targetUrlModel && this.targetUrlModel.set(data.targetUrlModel);
    data?.moduleType && this.moduleType.set(data.moduleType);
    data?.askToCreate !== null && data?.askToCreate !== undefined && this.askToCreate.set(data.askToCreate);
    data?.expectedResult && this.expectedResult.set(data.expectedResult);
    data?.suppressErrorDialogs !== null &&
      data?.suppressErrorDialogs !== undefined &&
      this.suppressErrorDialogs.set(data.suppressErrorDialogs);
    data?.backupId && this.backupId.set(data.backupId);
    data?.sourcePrefix && this.sourcePrefix.set(data.sourcePrefix);
  });

  testSignal = signal<TestState>(null);
  /** The URL has to be tested before it can be used, and before the source tools can check it */
  untested = computed(() => this.testSignal() === null || this.testSignal() === 'testing');

  /** Microsoft 365, Google Workspace and PostgreSQL sources can show item counts and check permissions */
  workspaceModule = computed(() => {
    if (this.moduleType() !== 'SourceProvider') return null;
    const url = this.targetUrlModel() ?? '';
    if (url.startsWith('office365://')) return 'office365';
    if (url.startsWith('googleworkspace://')) return 'googleworkspace';
    if (url.startsWith(POSTGRESQL_URL_PREFIX)) return POSTGRESQL_SCHEME;
    return null;
  });

  openCounts() {
    const url = this.targetUrlModel();
    const module = this.workspaceModule();
    if (!url || !module) return;

    const options = {
      maxWidth: '500px',
      width: '100%',
      closeOnOutsideClick: true,
      data: { url, sourcePrefix: this.sourcePrefix() ?? '', backupId: this.backupId() },
    };
    if (module === 'office365') this.#dialog.open(Office365CountsDialog, options);
    else if (module === 'googleworkspace') this.#dialog.open(GoogleWorkspaceCountsDialog, options);
    else this.#dialog.open(PostgresqlCountsDialog, options);
  }

  openPermissions() {
    const url = this.targetUrlModel();
    const module = this.workspaceModule();
    if (!url || !module) return;

    this.#dialog.open(CustomRemotePermissionsDialog, {
      maxWidth: '700px',
      width: '100%',
      closeOnOutsideClick: true,
      data: { url, sourcePrefix: this.sourcePrefix() ?? '', backupId: this.backupId(), module, mode: 'backup' },
    });
  }

  setTargetUrl(targetUrl: string | null, resetLastTargetUrl = false) {
    this.targetUrlModel.set(targetUrl);
  }

  setDestination(key: IDynamicModule['Key']) {
    const config = getConfigurationByKey(key ?? '');
    if (!config) return;

    if (config.mapper.default) {
      const defaultUrl = config.mapper.default('');
      this.setTargetUrl(defaultUrl, true);
      return;
    }

    this.setTargetUrl(`${key}://`, true);
  }

  submit() {
    this.closed.emit(this.targetUrlModel());
  }

  removeDestination() {
    this.setTargetUrl(null, true);
  }
}
