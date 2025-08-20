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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
    ShipAlertComponent,
    ShipButtonComponent,
    ShipFormFieldComponent,
    ShipIconComponent,
    ShipProgressBarComponent,
    ShipSelectComponent,
    ShipTooltipDirective,
} from '@ship-ui/core';
import { PasswordGeneratorService } from '../../core/services/password-generator.service';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { validateWhen, watchField } from '../../core/validators/custom.validators';
import { BackupState } from '../backup.state';

const fb = new FormBuilder();

export const createGeneralForm = (
  defaults = {
    name: '',
    description: '',
    encryption: '',
    password: '',
    repeatPassword: '',
    compression: '',
  }
) => {
  return fb.group({
    name: fb.control<string>(defaults.name, [Validators.required]),
    description: fb.control<string>(defaults.description),
    encryption: fb.control<string>(defaults.encryption, [watchField()]),
    password: fb.control<string>(defaults.password, [
      validateWhen((t) => t?.value.encryption !== '', [Validators.required]),
    ]),
    repeatPassword: fb.control<string>(defaults.repeatPassword, [
      validateWhen((t) => t?.value.encryption !== '', [Validators.required]),
    ]),
    compression: fb.control<string>(defaults.compression)
  });
};

export const NONE_OPTION = {
  Key: '-',
  DisplayName: 'None',
};

@Component({
  selector: 'app-general',
  imports: [
    ReactiveFormsModule,
    ShipFormFieldComponent,
    ShipSelectComponent,
    ShipButtonComponent,
    ShipIconComponent,
    ShipProgressBarComponent,
    ShipAlertComponent,
    ShipTooltipDirective,
    ShipAlertComponent,
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
  generalForm = this.#backupState.generalForm;
  generalFormSignal = this.#backupState.generalFormSignal;
  encryptionFieldSignal = this.#backupState.encryptionFieldSignal;
  encryptionOptions = this.#backupState.encryptionOptions;
  isNew = this.#backupState.isNew;

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

  nameAndDescriptionValid = computed(() => {
    const _ = this.generalFormSignal();
    const formControls = this.generalForm.controls;

    return formControls?.name && formControls.name.valid && formControls?.description && formControls.description.valid;
  });

  calculatePasswordStrength = computed(() => {
    const form = this.generalFormSignal();
    const password = form?.password ?? '';

    return this.#passwordGeneratorService.calculatePasswordStrength(password);
  });

  ngOnInit() {
    this.formRef().nativeElement.focus();
  }

  exit() {
    this.#backupState.exit(true);
  }

  async copyPassword() {
    const pass = this.generalForm.controls.password.value;

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

    const newPass = this.#passwordGeneratorService.generate(16);
    this.generalForm.controls.password.setValue(newPass);
    this.generalForm.controls.repeatPassword.setValue(newPass);

    this.showCopyPassword.set(true);
  }

  next() {
    if (!this.#backupState.isNew()) {
      this.#backupState.submit(true);
    }
    this.#router.navigate(['destination'], { relativeTo: this.#route.parent });
  }
}
