import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, provideSignalFormsConfig } from '@angular/forms/signals';
import { compatForm, NG_STATUS_CLASSES } from '@angular/forms/signals/compat';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipButtonGroup } from '@ship-ui/core/ship-button-group';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { PasswordGeneratorService } from '../../core/services/password-generator.service';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupState } from '../backup.state';
import { NONE_OPTION } from '../models/general-form';
import { NullableTextControl } from './nullable-text-control';

@Component({
  selector: 'app-general',
  providers: [provideSignalFormsConfig({ classes: NG_STATUS_CLASSES })],
  imports: [
    FormField,
    NullableTextControl,
    ShipFormField,
    ShipSelect,
    ShipButton,
    ShipIcon,
    ShipProgressBar,
    ShipAlert,
    ShipTooltip,
    ShipAlert,
    ShipButtonGroup,
  ],
  templateUrl: './general.component.html',
  styleUrl: './general.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GeneralComponent {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #passwordGeneratorService = inject(PasswordGeneratorService);
  #backupState = inject(BackupState);
  #sysinfo = inject(SysinfoState);

  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');
  // Keep the existing controls as the single source of truth during the staged migration.
  generalForm = compatForm(signal(this.#backupState.generalForm.controls));
  encryptionFieldSignal = computed(() => this.generalForm.encryption().value());
  operationTypeFieldSignal = computed(() => this.generalForm.operationType().value() ?? 'Backup');
  encryptionOptions = this.#backupState.encryptionOptions;
  isNew = this.#backupState.isNew;
  isDraft = this.#backupState.isDraft;
  canEditEncryption = computed(() => this.isNew() || this.isDraft());
  syncModeSupported = this.#sysinfo.hasSyncMode;

  showPassword = signal(false);
  copiedPassword = signal(false);
  showCopyPassword = signal(false);
  noneOptionKey = NONE_OPTION.Key;

  encryptionEffect = effect(() => {
    const encryptionField = this.encryptionFieldSignal();

    if (encryptionField === NONE_OPTION.Key) {
      this.copiedPassword.set(false);
      this.showCopyPassword.set(false);
    }
  });

  updateOperationType(value: string | number | null) {
    if (value === 'Backup' || value === 'Sync') this.generalForm.operationType().value.set(value);
  }

  nameAndDescriptionValid = computed(() => this.generalForm.name().valid() && this.generalForm.description().valid());

  calculatePasswordStrength = computed(() =>
    this.#passwordGeneratorService.calculatePasswordStrength(this.generalForm.password().value() ?? '')
  );

  ngOnInit() {
    this.formRef().nativeElement.focus();
  }

  exit() {
    this.#backupState.exit(true);
  }

  async copyPassword() {
    const pass = this.generalForm.password().value();

    await this.#copyToClipboard(pass ?? '');

    this.copiedPassword.set(true);
  }

  async #copyToClipboard(text: string) {
    try {
      // Attempt to use the Clipboard API
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // Fallback to execCommand if Clipboard API fails
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
  }

  generatePassword() {
    this.copiedPassword.set(false);

    const newPass = this.#passwordGeneratorService.generate(41);
    this.generalForm.password().value.set(newPass);
    this.generalForm.repeatPassword().value.set(newPass);

    this.showCopyPassword.set(true);
  }

  next() {
    if (this.#backupState.shouldAutoSave()) {
      this.#backupState.submit(true);
    }
    this.#router.navigate(['source-data'], { relativeTo: this.#route.parent });
  }
}
