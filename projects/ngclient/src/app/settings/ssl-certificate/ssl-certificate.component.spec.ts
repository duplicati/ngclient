import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { SslCertificateComponent } from './ssl-certificate.component';
import { canUploadCertificate, isInsecureConnection, toUpdateCertificateRequest } from './ssl-certificate-settings';

const PFX_BYTES = new Uint8Array([0x30, 0x82, 0x00, 0xff, 0x80, 0x01]);

describe('ssl certificate settings', () => {
  it('encodes the certificate bytes as base64 and passes the password unchanged', () => {
    expect(toUpdateCertificateRequest(PFX_BYTES.buffer, ' secret ')).toEqual({
      Certificate: 'MIIA/4AB',
      Password: ' secret ',
    });
  });

  it.each([
    ['http:', true],
    ['HTTP:', true],
    ['https:', false],
    ['HTTPS:', false],
  ])('treats protocol %s as insecure: %s', (protocol, insecure) => {
    expect(isInsecureConnection(protocol)).toBe(insecure);
  });

  it('needs a file and a password that is not blank', () => {
    const file = new File([PFX_BYTES], 'server.pfx');
    expect(canUploadCertificate([], 'secret')).toBe(false);
    expect(canUploadCertificate([file], '')).toBe(false);
    expect(canUploadCertificate([file], '   ')).toBe(false);
    expect(canUploadCertificate([file], 'secret')).toBe(true);
  });
});

describe('ssl certificate component', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function setup() {
    const response = new Subject<unknown>();
    const post = vi.fn(() => response);
    TestBed.configureTestingModule({
      imports: [SslCertificateComponent],
      providers: [{ provide: DuplicatiServer, useValue: { postApiV1Uisettings: post } }],
    });
    const fixture = TestBed.createComponent(SslCertificateComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = () => element.querySelector('button.primary') as HTMLButtonElement;
    return { fixture, component: fixture.componentInstance, element, button, post, response };
  }

  async function typePassword(fixture: ReturnType<typeof setup>['fixture'], value: string) {
    const input = (fixture.nativeElement as HTMLElement).querySelector('#sslCertificatePassword') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('warns that the certificate is sent unencrypted when the page is not loaded over HTTPS', () => {
    const { element } = setup();
    expect(window.location.protocol).toBe('http:');
    expect(element.querySelector('sh-alert')?.textContent).toContain('sent to the server unencrypted');
  });

  it('posts the selected file as base64 with the typed password', async () => {
    const { fixture, component, element, button, post, response } = setup();
    expect(button().disabled).toBe(true);

    component.selectFiles([new File([PFX_BYTES], 'server.pfx', { type: 'application/x-pkcs12' })]);
    fixture.detectChanges();
    expect(button().disabled).toBe(true);

    await typePassword(fixture, 'secret');
    expect(button().disabled).toBe(false);

    button().click();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledExactlyOnceWith({ body: { Certificate: 'MIIA/4AB', Password: 'secret' } });

    response.next(undefined);
    response.complete();
    fixture.detectChanges();
    expect(component.files()).toEqual([]);
    expect(component.password()).toBe('');
    expect(element.textContent).toContain('The certificate has been installed');
  });

  it('keeps the file and the password when the server rejects the certificate', async () => {
    const { fixture, component, element, button, response } = setup();
    component.selectFiles([new File([PFX_BYTES], 'server.pfx')]);
    await typePassword(fixture, 'wrong');

    button().click();
    await vi.waitFor(() => expect(component.isUploading()).toBe(true));
    response.error(new Error('Invalid certificate'));
    fixture.detectChanges();

    expect(component.isUploading()).toBe(false);
    expect(component.files().length).toBe(1);
    expect(component.password()).toBe('wrong');
    expect(element.textContent).not.toContain('The certificate has been installed');
  });
});
