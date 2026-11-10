import { WebModuleOption } from '../../core/services/webmodules.service';

/**
 * Built-in server lists for S3 providers the backend does not list endpoints for.
 * Hostnames are from each provider's documentation (checked 2026-11); labels name
 * the location where the provider publishes it, otherwise just the region code.
 * Users can still type or paste any other endpoint.
 */

const servers = (hostTemplate: (code: string) => string, regions: [code: string, label: string | null][]) =>
  regions.map(
    ([code, label]): WebModuleOption => ({ key: label ? `${label} (${code})` : code, value: hostTemplate(code) })
  );

/** docs.digitalocean.com/products/spaces/details/availability */
export const DIGITALOCEAN_SERVERS = servers(
  (code) => `${code}.digitaloceanspaces.com`,
  [
    ['nyc3', 'New York'],
    ['ams3', 'Amsterdam'],
    ['sfo2', 'San Francisco'],
    ['sfo3', 'San Francisco'],
    ['sgp1', 'Singapore'],
    ['lon1', 'London'],
    ['fra1', 'Frankfurt'],
    ['tor1', 'Toronto'],
    ['blr1', 'Bangalore'],
    ['syd1', 'Sydney'],
    ['atl1', 'Atlanta'],
    ['ric1', 'Richmond'],
    ['mkc1', 'Kansas City'],
  ]
);

/** docs.hetzner.com/storage/object-storage/overview */
export const HETZNER_SERVERS = servers(
  (code) => `${code}.your-objectstorage.com`,
  [
    ['fsn1', 'Falkenstein'],
    ['nbg1', 'Nuremberg'],
    ['hel1', 'Helsinki'],
  ]
);

/**
 * techdocs.akamai.com/cloud-computing/docs/endpoint-types
 * The cluster number in a hostname does not always match the region name, so these are listed as published.
 */
export const LINODE_SERVERS = servers(
  (code) => `${code}.linodeobjects.com`,
  [
    ['us-southeast-1', 'Atlanta'],
    ['us-ord-1', 'Chicago'],
    ['us-ord-10', 'Chicago'],
    ['us-lax-1', 'Los Angeles'],
    ['us-lax-4', 'Los Angeles'],
    ['us-mia-1', 'Miami'],
    ['us-east-1', 'Newark'],
    ['us-sea-1', 'Seattle'],
    ['us-sea-9', 'Seattle'],
    ['us-iad-1', 'Washington, DC'],
    ['us-iad-10', 'Washington, DC'],
    ['us-iad-18', 'Washington, DC 2'],
    ['id-cgk-1', 'Jakarta'],
    ['in-maa-1', 'Chennai'],
    ['in-maa-5', 'Chennai'],
    ['in-bom-1', 'Mumbai 2'],
    ['jp-osa-1', 'Osaka'],
    ['jp-osa-3', 'Osaka'],
    ['jp-tyo-1', 'Tokyo 3'],
    ['ap-south-1', 'Singapore'],
    ['sg-sin-1', 'Singapore 2'],
    ['eu-central-1', 'Frankfurt'],
    ['de-fra-1', 'Frankfurt 2'],
    ['es-mad-1', 'Madrid'],
    ['fr-par-1', 'Paris'],
    ['fr-par-13', 'Paris 2'],
    ['gb-lon-1', 'London 2'],
    ['it-mil-1', 'Milan'],
    ['nl-ams-1', 'Amsterdam'],
    ['se-sto-1', 'Stockholm'],
    ['au-mel-1', 'Melbourne'],
    ['br-gru-1', 'São Paulo'],
  ]
);

/** docs.ovhcloud.com/en/guides/storage-and-backup/object-storage/s3-location (current "io" endpoints) */
export const OVHCLOUD_SERVERS = servers(
  (code) => `s3.${code}.io.cloud.ovh.net`,
  [
    ['gra', 'Gravelines'],
    ['rbx', 'Roubaix'],
    ['sbg', 'Strasbourg'],
    ['eu-west-par', 'Paris'],
    ['de', 'Frankfurt'],
    ['eu-south-mil', 'Milan'],
    ['uk', 'London'],
    ['waw', 'Warsaw'],
    ['bhs', 'Beauharnois'],
    ['ca-east-tor', 'Toronto'],
    ['sgp', 'Singapore'],
    ['ap-southeast-syd', 'Sydney'],
    ['ap-south-mum', 'Mumbai'],
  ]
);

/** docs.ionos.com/cloud/storage-and-backup/ionos-object-storage/endpoints */
export const IONOS_SERVERS = servers(
  (code) => `s3.${code}.ionoscloud.com`,
  [
    ['eu-central-4', 'Frankfurt, contract-owned buckets'],
    ['eu-central-3', 'Berlin, contract-owned buckets'],
    ['us-central-1', 'Lenexa, contract-owned buckets'],
    ['eu-central-1', 'Frankfurt, user-owned buckets'],
    ['eu-central-2', 'Berlin, user-owned buckets'],
    ['eu-south-2', 'Logroño, user-owned buckets'],
  ]
);

/** community.exoscale.com/platform/dc-zones (SOS is available in every zone) */
export const EXOSCALE_SERVERS = servers(
  (code) => `sos-${code}.exo.io`,
  [
    ['at-vie-1', 'Vienna'],
    ['at-vie-2', 'Vienna'],
    ['bg-sof-1', 'Sofia'],
    ['ch-dk-2', 'Zurich'],
    ['ch-gva-2', 'Geneva'],
    ['de-fra-1', 'Frankfurt'],
    ['de-muc-1', 'Munich'],
    ['hr-zag-1', 'Zagreb'],
  ]
);

/**
 * kb.synology.com/en-global/C2/tutorial/C2_Object_Storage_API gives the format;
 * Synology publishes no complete list, so only the documented endpoints are listed.
 */
export const SYNOLOGY_C2_SERVERS = servers(
  (code) => `${code}.s3.synologyc2.net`,
  [
    ['eu-001', 'Europe 1'],
    ['eu-002', 'Europe 2'],
    ['eu-003', 'Europe 3'],
    ['eu-004', 'Europe 4'],
    ['us-001', 'North America 1'],
    ['us-002', 'North America 2'],
    ['us-003', 'North America 3'],
    ['tw-001', 'Asia Pacific'],
  ]
);

/**
 * International regions from Huawei's SDK region list (huaweicloudsdkobs obs_region.py).
 * Only locations Huawei's documentation confirms are named.
 */
export const HUAWEI_OBS_SERVERS = [
  ...servers(
    (code) => `obs.${code}.myhuaweicloud.com`,
    [
      ['ap-southeast-1', 'Hong Kong'],
      ['ap-southeast-2', null],
      ['ap-southeast-3', null],
      ['ap-southeast-4', null],
      ['ap-southeast-5', null],
      ['af-south-1', null],
      ['af-north-1', null],
      ['tr-west-1', null],
      ['me-east-1', null],
      ['na-mexico-1', 'Mexico City 1'],
      ['la-north-2', null],
      ['sa-brazil-1', null],
      ['la-south-2', null],
      ['sa-peru-1', null],
      ['ru-northwest-2', null],
    ]
  ),
  ...servers((code) => `obs.${code}.myhuaweicloud.eu`, [['eu-west-101', 'Dublin']]),
];
