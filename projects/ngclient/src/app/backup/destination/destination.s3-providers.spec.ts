import { computed, Injector, signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { WebModuleOption, WebModulesService } from '../../core/services/webmodules.service';
import { S3_DISABLE_CHUNK_ENCODING_OPTION } from './destination.config';
import * as providerServers from './destination.s3-provider-servers';
import {
  CreateCustomS3ProviderEntry,
  CustomFormView,
  getBackendType,
  getConfigurationByKey,
  getConfigurationByUrl,
} from './destination.config-utilities';

/** Injector whose WebModulesService returns the given backend S3 server list. */
const injectorWith = (backendServers: WebModuleOption[]) => {
  const all = signal(backendServers);
  return Injector.create({
    providers: [
      {
        provide: WebModulesService,
        useValue: {
          getS3ProvidersFiltered: (predicate: (option: WebModuleOption) => boolean) =>
            computed(() => all().filter(predicate)),
        },
      },
    ],
  });
};

const serverField = (key: string) =>
  getConfigurationByKey(key).dynamicFields?.find(
    (field) => typeof field !== 'string' && field.name === 's3-server-name'
  ) as CustomFormView;

describe('custom S3 providers', () => {
  it('shows the server field above bucket and folder', () => {
    expect(serverField('s3-wasabi').showFirst).toBe(true);
    expect(serverField('s3-cloudflarer2').showFirst).toBe(true);
    // The generic and Amazon entries keep their existing layout
    expect(serverField('s3').showFirst).toBeUndefined();
    expect(serverField('s3-aws').showFirst).toBeUndefined();
  });

  it.each(['s3', 's3-aws', 's3-wasabi', 's3-oracle'])('%s suggests pasting a URL in the server field', (key) => {
    expect(serverField(key).acceptsPastedUrl).toBe(true);
  });

  it('merges built-in servers with backend servers for the provider, without duplicates', () => {
    const entry = CreateCustomS3ProviderEntry('test', 'Test', null, null, ['.example.com'], {
      servers: [
        { key: 'Region A', value: 'a.example.com' },
        { key: 'Region B', value: 'b.example.com' },
      ],
    });
    const field = entry.dynamicFields!.find(
      (f) => typeof f !== 'string' && f.name === 's3-server-name'
    ) as CustomFormView;

    const options = field.loadOptions!(
      injectorWith([
        { key: 'Backend B', value: 'b.example.com' },
        { key: 'Backend C', value: 'c.example.com' },
        { key: 'Other', value: 's3.other.net' },
        { key: 'Suffix only', value: '.example.com' },
      ])
    )();

    expect(options).toEqual([
      { key: 'Region A', value: 'a.example.com' },
      { key: 'Backend B', value: 'b.example.com' },
      { key: 'Backend C', value: 'c.example.com' },
    ]);
  });

  it('uses the custom server help text when given', () => {
    expect(serverField('s3-cloudflarer2').longDescription).toContain('r2.cloudflarestorage.com');
    expect(serverField('s3-wasabi').longDescription).toContain('Wasabi');
  });

  it.each([
    ['0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com', 's3-cloudflarer2', 'Cloudflare R2'],
    ['ns.compat.objectstorage.us-ashburn-1.oraclecloud.com', 's3-oracle', 'Oracle Cloud S3'],
    ['s3.us-south.cloud-object-storage.appdomain.cloud', 's3-ibmcos', 'IBM COS (S3)'],
    ['ns.compat.objectstorage.eu-frankfurt-1.oci.customer-oci.com', 's3-oracle', 'Oracle Cloud S3'],
    ['ams3.digitaloceanspaces.com', 's3-digitalocean', 'DigitalOcean S3'],
    ['fsn1.your-objectstorage.com', 's3-hetzner', 'Hetzner S3'],
    ['us-iad-10.linodeobjects.com', 's3-linode', 'Linode S3'],
    ['s3.gra.io.cloud.ovh.net', 's3-ovhcloud', 'OVHcloud S3'],
    ['s3.eu-central-4.ionoscloud.com', 's3-ionos', 'IONOS S3'],
    ['sos-ch-gva-2.exo.io', 's3-exoscale', 'Exoscale S3'],
    ['eu-001.s3.synologyc2.net', 's3-synologyc2', 'Synology C2 S3'],
    ['obs.eu-west-101.myhuaweicloud.eu', 's3-huawei', 'Huawei Cloud S3'],
  ])('recognises existing connections to %s', (host, customKey, display) => {
    const url = `s3://bucket?s3-server-name=${host}`;
    expect(getConfigurationByUrl(url).customKey).toBe(customKey);
    expect(getBackendType(url)).toContain(display.split(' ')[0]);
  });

  it.each([
    's3-cloudflarer2',
    's3-oracle',
    's3-digitalocean',
    's3-hetzner',
    's3-linode',
    's3-ovhcloud',
    's3-ionos',
    's3-exoscale',
    's3-synologyc2',
    's3-huawei',
  ])('%s disables chunk encoding on new connections', (key) => {
    expect(getConfigurationByKey(key).mapper.default!('')).toBe(
      `${key}://?use-ssl=true&${S3_DISABLE_CHUNK_ENCODING_OPTION}=true`
    );
  });

  it.each(Object.entries(providerServers))('%s are unique hosts without a scheme', (_, servers) => {
    const hosts = servers.map((x) => x.value as string);
    expect(hosts.length).toBeGreaterThan(0);
    expect(new Set(hosts).size).toBe(hosts.length);
    for (const host of hosts) expect(host).toMatch(/^[a-z0-9.-]+$/);
  });
});
