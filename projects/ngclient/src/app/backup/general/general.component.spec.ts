import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationType } from '../../core/openapi';
import { PasswordGeneratorService } from '../../core/services/password-generator.service';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupState } from '../backup.state';
import GeneralComponent, { createGeneralForm, NONE_OPTION } from './general.component';

describe('GeneralComponent encryption fields', () => {
  let fixture: ComponentFixture<GeneralComponent>;

  const createFixture = ({
    isNew = false,
    isDraft = false,
    encryption = 'aes',
    operationType = 'Backup',
  }: {
    isNew?: boolean;
    isDraft?: boolean;
    encryption?: string;
    operationType?: OperationType;
  } = {}) => {
    const generalForm = createGeneralForm({
      name: 'Imported backup',
      description: '',
      encryption,
      password: encryption === NONE_OPTION.Key ? '' : 'secret',
      repeatPassword: encryption === NONE_OPTION.Key ? '' : 'secret',
      compression: '',
      operationType,
    });

    TestBed.configureTestingModule({
      imports: [GeneralComponent],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
        {
          provide: PasswordGeneratorService,
          useValue: { calculatePasswordStrength: vi.fn(() => 4), generate: vi.fn(() => 'generated') },
        },
        { provide: SysinfoState, useValue: { hasSyncMode: signal(true) } },
        {
          provide: BackupState,
          useValue: {
            generalForm,
            generalFormSignal: signal(generalForm.getRawValue()),
            encryptionFieldSignal: signal(encryption),
            operationTypeFieldSignal: signal(operationType),
            encryptionOptions: signal([NONE_OPTION, { Key: 'aes', DisplayName: 'AES' }]),
            isNew: signal(isNew),
            isDraft: signal(isDraft),
            shouldAutoSave: signal(false),
            submit: vi.fn(),
            exit: vi.fn(),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(GeneralComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('shows encryption and password fields for an encrypted import draft', () => {
    const element = createFixture({ isDraft: true });

    expect(element.querySelector('sh-select')).not.toBeNull();
    expect(element.querySelector('#password')).not.toBeNull();
    expect(element.querySelector('#repeatPassword')).not.toBeNull();
    expect(element.textContent).not.toContain('Encrypted backup');
  });

  it('shows the encryption selector without password fields for an unencrypted import draft', () => {
    const element = createFixture({ isDraft: true, encryption: NONE_OPTION.Key });

    expect(element.querySelector('sh-select')).not.toBeNull();
    expect(element.querySelector('#password')).toBeNull();
    expect(element.querySelector('#repeatPassword')).toBeNull();
  });

  it('keeps encryption fields hidden for an existing backup', () => {
    const element = createFixture();

    expect(element.querySelector('sh-select')).toBeNull();
    expect(element.querySelector('#password')).toBeNull();
    expect(element.textContent).toContain('Encrypted backup');
  });

  it('keeps encryption fields available for a new backup', () => {
    const element = createFixture({ isNew: true });

    expect(element.querySelector('sh-select')).not.toBeNull();
    expect(element.querySelector('#password')).not.toBeNull();
  });

  it('does not show encryption fields for an imported sync job', () => {
    const element = createFixture({ isDraft: true, operationType: 'Sync' });

    expect(element.querySelector('sh-select')).toBeNull();
    expect(element.querySelector('#password')).toBeNull();
    expect(element.textContent).toContain('Synchronization job - files are not encrypted');
  });
});
