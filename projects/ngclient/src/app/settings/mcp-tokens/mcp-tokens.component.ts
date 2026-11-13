import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { defer, finalize } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer, McpTokenDto, McpTokenLevel } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import {
  describeMcpTokenBackups,
  emptyMcpTokenForm,
  getMcpTokenFormError,
  MCP_TOKEN_LEVEL_OPTIONS,
  MCP_TOKEN_LIFETIME_OPTIONS,
  toCreateMcpTokenRequest,
  toMcpEndpointUrl,
} from './mcp-token-settings';
import { getMcpAgentInstructions, MCP_AGENT_OPTIONS, McpAgentId } from './mcp-agent-instructions';

/**
 * Lists the tokens that give AI agents access to the MCP endpoint, and creates and deletes them.
 * A token is shown once, right after it is created.
 */
@Component({
  selector: 'app-mcp-tokens',
  imports: [DatePipe, FormsModule, ShipAlert, ShipButton, ShipCheckbox, ShipFormField, ShipIcon, ShipSelect],
  templateUrl: './mcp-tokens.component.html',
  styleUrl: './mcp-tokens.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McpTokensComponent {
  #dupServer = inject(DuplicatiServer);
  #backupsState = inject(BackupsState);
  #dialog = inject(ShipDialogService);
  #sysinfo = inject(SysinfoState);

  levelOptions = MCP_TOKEN_LEVEL_OPTIONS;
  lifetimeOptions = MCP_TOKEN_LIFETIME_OPTIONS;
  endpointUrl = toMcpEndpointUrl(window.location.origin);

  tokens = signal<McpTokenDto[]>([]);
  isLoading = signal(true);
  isCreating = signal(false);
  deletingId = signal<string | null>(null);
  showForm = signal(false);
  form = signal(emptyMcpTokenForm());
  /** The token that was just created; the server does not give it out again */
  createdToken = signal<{ name: string; token: string } | null>(null);
  copied = signal(false);

  agentOptions = MCP_AGENT_OPTIONS;
  selectedAgentId = signal<McpAgentId>(MCP_AGENT_OPTIONS[0].id);
  /** How to give the new token to the selected agent */
  selectedAgent = computed(() => {
    const created = this.createdToken();
    if (!created) return null;
    const isWindowsServer = this.#sysinfo.systemInfo()?.OSType === 'Windows';
    return (
      getMcpAgentInstructions(this.endpointUrl, created.token, isWindowsServer).find(
        (x) => x.id === this.selectedAgentId()
      ) ?? null
    );
  });

  backups = computed(() =>
    this.#backupsState
      .backups()
      .map((x) => ({ id: x.Backup?.ID ?? '', name: x.Backup?.Name ?? '' }))
      .filter((x) => x.id !== '')
  );
  #backupNames = computed(() => new Map(this.backups().map((x) => [x.id, x.name])));
  formError = computed(() => getMcpTokenFormError(this.form()));

  ngOnInit() {
    this.#backupsState.getBackups();
    this.#loadTokens();
  }

  #loadTokens() {
    this.isLoading.set(true);
    defer(() => this.#dupServer.getApiV2McpTokens())
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (res) => this.tokens.set(res.Data ?? []),
        // The HTTP interceptor reports the error
        error: () => {},
      });
  }

  describeBackups(token: McpTokenDto) {
    return describeMcpTokenBackups(token, this.#backupNames());
  }

  levelLabel(level: McpTokenLevel | undefined) {
    return this.levelOptions.find((x) => x.value === level)?.label ?? level ?? '';
  }

  openForm() {
    this.form.set(emptyMcpTokenForm());
    this.createdToken.set(null);
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
  }

  updateForm(patch: Partial<ReturnType<typeof emptyMcpTokenForm>>) {
    this.form.update((x) => ({ ...x, ...patch }));
  }

  // The selects can be cleared, which must not leave the token without a level or a lifetime
  selectLevel(level: McpTokenLevel | null | undefined | '') {
    if (level) this.updateForm({ level });
  }

  selectLifetime(expiresIn: string | null | undefined) {
    if (expiresIn) this.updateForm({ expiresIn });
  }

  isBackupSelected(id: string) {
    return this.form().backupIds.includes(id);
  }

  toggleBackup(id: string, selected: boolean) {
    this.form.update((x) => ({
      ...x,
      backupIds: selected ? [...x.backupIds.filter((y) => y !== id), id] : x.backupIds.filter((y) => y !== id),
    }));
  }

  create() {
    if (this.isCreating() || this.formError() !== null) return;

    this.isCreating.set(true);
    defer(() => this.#dupServer.postApiV2McpTokens({ body: toCreateMcpTokenRequest(this.form()) }))
      .pipe(finalize(() => this.isCreating.set(false)))
      .subscribe({
        next: (res) => {
          this.createdToken.set({ name: res.Data?.Token?.Name ?? '', token: res.Data?.AccessToken ?? '' });
          this.showForm.set(false);
          this.#loadTokens();
        },
        // The HTTP interceptor reports the error, and the form stays open for a correction
        error: () => {},
      });
  }

  delete(token: McpTokenDto) {
    const id = token.Id;
    if (!id || this.deletingId() !== null) return;

    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Delete access token`,
        message: $localize`Delete the access token "${token.Name}:name:"? An agent using it loses access at once.`,
        confirmText: $localize`Delete token`,
        cancelText: $localize`Cancel`,
      },
      closed: (res) => {
        if (!res) return;

        this.deletingId.set(id);
        defer(() => this.#dupServer.deleteApiV2McpTokenById({ path: { id } }))
          .pipe(finalize(() => this.deletingId.set(null)))
          .subscribe({
            next: () => this.tokens.update((x) => x.filter((y) => y.Id !== id)),
            error: () => {},
          });
      },
    });
  }

  dismissCreatedToken() {
    this.createdToken.set(null);
  }

  selectAgent(id: McpAgentId | null | undefined | '') {
    if (!id) return;
    this.selectedAgentId.set(id);
    this.copied.set(false);
  }

  copy(value: string) {
    navigator.clipboard.writeText(value);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
