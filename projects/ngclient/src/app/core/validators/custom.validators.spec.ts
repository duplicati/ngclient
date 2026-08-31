import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateIf, validateWhen, watchField } from './custom.validators';

const fb = new FormBuilder();

describe('custom validators', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateWhen', () => {
    it('skips validation when the control has no parent', () => {
      const validator = validateWhen(() => true, Validators.required);

      expect(validator(new FormControl(''))).toBeNull();
    });

    it('skips validation when the predicate is false', () => {
      const form = fb.group({
        enabled: fb.control(false),
        value: fb.control('', [validateWhen((parent) => parent.value.enabled, Validators.required)]),
      });
      form.controls.value.updateValueAndValidity();

      expect(form.controls.value.valid).toBe(true);
      expect(form.controls.value.errors).toBeNull();
    });

    it('returns the first validation error in the default namespace', () => {
      const firstValidator = vi.fn(() => ({ first: true }));
      const secondValidator = vi.fn(() => ({ second: true }));
      const form = fb.group({
        enabled: fb.control(true),
        value: fb.control('', [validateWhen((parent) => parent.value.enabled, [firstValidator, secondValidator])]),
      });
      form.controls.value.updateValueAndValidity();

      expect(form.controls.value.errors).toEqual({ conditional: { first: true } });
      expect(firstValidator).toHaveBeenCalled();
      expect(secondValidator).not.toHaveBeenCalled();
    });

    it('returns the validation error directly when the namespace is empty', () => {
      const form = fb.group({
        enabled: fb.control(true),
        value: fb.control('', [validateWhen((parent) => parent.value.enabled, Validators.required, '')]),
      });
      form.controls.value.updateValueAndValidity();

      expect(form.controls.value.errors).toEqual({ required: true });
    });

    it('returns no error when every validator succeeds', () => {
      const form = fb.group({
        enabled: fb.control(true),
        value: fb.control('value', [
          validateWhen((parent) => parent.value.enabled, [Validators.required, Validators.minLength(3)]),
        ]),
      });
      form.controls.value.updateValueAndValidity();

      expect(form.controls.value.valid).toBe(true);
      expect(form.controls.value.errors).toBeNull();
    });
  });

  describe('validateIf', () => {
    it('skips validation when the control has no parent', () => {
      const validator = validateIf('enabled', true, Validators.required);

      expect(validator(new FormControl(''))).toBeNull();
    });

    it('returns the first validation error when a scalar condition matches', () => {
      const firstValidator = vi.fn(() => ({ first: true }));
      const secondValidator = vi.fn(() => ({ second: true }));
      const form = fb.group({
        enabled: fb.control(true),
        value: fb.control('', [validateIf('enabled', true, [firstValidator, secondValidator])]),
      });
      form.controls.value.updateValueAndValidity();

      expect(form.controls.value.errors).toEqual({ first: true });
      expect(firstValidator).toHaveBeenCalled();
      expect(secondValidator).not.toHaveBeenCalled();
    });

    it('validates when the current value is in the allowed values', () => {
      const form = fb.group({
        mode: fb.control('second'),
        value: fb.control('', [validateIf('mode', ['first', 'second'], Validators.required)]),
      });
      form.controls.value.updateValueAndValidity();

      expect(form.controls.value.errors).toEqual({ required: true });
    });

    it('returns no error when the condition does not match', () => {
      const form = fb.group({
        enabled: fb.control(false),
        value: fb.control('', [validateIf('enabled', true, Validators.required)]),
      });
      form.controls.value.updateValueAndValidity();

      expect(form.controls.value.valid).toBe(true);
      expect(form.controls.value.errors).toBeNull();
    });

    it('returns no error and warns when the conditional field is missing', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const form = fb.group({
        value: fb.control('', [validateIf('missing', true, Validators.required)]),
      });
      form.controls.value.updateValueAndValidity();

      expect(form.controls.value.valid).toBe(true);
      expect(form.controls.value.errors).toBeNull();
      expect(warn).toHaveBeenCalledWith('Conditional field not found');
    });

    it('returns no error when the condition matches and validation succeeds', () => {
      const form = fb.group({
        enabled: fb.control(true),
        value: fb.control('value', [validateIf('enabled', true, Validators.required)]),
      });
      form.controls.value.updateValueAndValidity();

      expect(form.controls.value.valid).toBe(true);
      expect(form.controls.value.errors).toBeNull();
    });
  });

  describe('watchField', () => {
    it('revalidates General-style password fields when encryption changes', async () => {
      const form = fb.group({
        encryption: fb.control('aes', [watchField()]),
        password: fb.control('', [validateWhen((parent) => parent.value.encryption !== '-', Validators.required)]),
      });
      form.controls.password.updateValueAndValidity();
      const revalidatePassword = vi.spyOn(form.controls.password, 'updateValueAndValidity');

      expect(form.controls.password.invalid).toBe(true);

      form.controls.encryption.setValue('-');
      await Promise.resolve();

      expect(revalidatePassword).toHaveBeenCalled();
      expect(form.controls.password.valid).toBe(true);
    });

    it('revalidates Export-style password fields when encryption is enabled', async () => {
      const form = fb.group({
        encryption: fb.control(false, [watchField()]),
        password: fb.control('', [validateIf('encryption', true, Validators.required)]),
      });

      expect(form.controls.password.valid).toBe(true);

      form.controls.encryption.setValue(true);
      await Promise.resolve();

      expect(form.controls.password.errors).toEqual({ required: true });

      form.controls.password.setValue('secret');

      expect(form.controls.password.valid).toBe(true);
    });
  });
});
