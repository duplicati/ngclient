/** The module key of the restore destination that writes a disk image to a file */
export const IMAGE_FILE_MODULE_KEY = 'diskimage-file';

/** The option that reserves the full size of a raw image file */
export const IMAGE_PREALLOCATE_OPTION = 'diskimage-restore-image-preallocate';

/** The option that selects the image format; the format is chosen by the file extension instead */
export const IMAGE_FORMAT_OPTION = 'diskimage-restore-image-format';

export type ImageFileFormat = 'raw' | 'vhd' | 'vhdx';

const EXTENSIONS: Record<ImageFileFormat, string> = {
  raw: '.img',
  vhd: '.vhd',
  vhdx: '.vhdx',
};

const DEFAULT_IMAGE_NAME = 'disk';

/**
 * Gets the image format the server picks for a file name: VHD and VHDX by
 * their extension, a raw image for anything else.
 */
export function imageFormatFromName(name: string): ImageFileFormat {
  const lower = name.trim().toLowerCase();
  if (lower.endsWith('.vhdx')) return 'vhdx';
  if (lower.endsWith('.vhd')) return 'vhd';
  return 'raw';
}

/**
 * Gives a file name the extension of a format. A known image extension is
 * replaced; any other extension is kept for a raw image and extended otherwise.
 */
export function setImageExtension(name: string, format: ImageFileFormat): string {
  let base = name.trim();
  if (imageFormatFromName(base) === format && (format !== 'raw' || base.length > 0)) return base;

  const lower = base.toLowerCase();
  for (const extension of Object.values(EXTENSIONS)) {
    if (lower.endsWith(extension)) {
      base = base.substring(0, base.length - extension.length);
      break;
    }
  }

  return (base || DEFAULT_IMAGE_NAME) + EXTENSIONS[format];
}

/**
 * Suggests a file name for the image from the first disk in the backup
 * sources, e.g. "sda.img" for a backup of /dev/sda.
 */
export function defaultImageFileName(sources: string[] | null | undefined): string {
  const url = (sources ?? []).map((x) => x.split('|')[1] ?? '').find((x) => x.startsWith('diskimage://'));

  const device = url?.substring('diskimage://'.length) ?? '';
  const name = device
    .split(/[\\/]+/)
    .filter((x) => x !== '' && x !== '.')
    .pop()
    ?.replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^\.+/, '');

  return (name || DEFAULT_IMAGE_NAME) + EXTENSIONS.raw;
}

export type ImageFileTargetError = 'missing-folder' | 'missing-name' | 'invalid-name' | 'invalid-path';

/**
 * Builds the restore path for an image file in a folder. The path goes into a
 * URL, so it cannot hold characters that start the query or fragment.
 */
export function buildImageFileRestorePath(
  folder: string | null | undefined,
  name: string | null | undefined,
  preallocate: boolean
): { path: string } | { error: ImageFileTargetError } {
  const trimmedFolder = (folder ?? '').trim();
  const trimmedName = (name ?? '').trim();

  if (trimmedFolder === '') return { error: 'missing-folder' };
  if (trimmedName === '') return { error: 'missing-name' };
  if (/[\\/]/.test(trimmedName) || trimmedName === '.' || trimmedName === '..') return { error: 'invalid-name' };
  if (/[?#]/.test(trimmedFolder + trimmedName)) return { error: 'invalid-path' };

  const separator = trimmedFolder.includes('\\') && !trimmedFolder.includes('/') ? '\\' : '/';
  const joined = /[\\/]$/.test(trimmedFolder) ? trimmedFolder + trimmedName : trimmedFolder + separator + trimmedName;

  const options = preallocate && imageFormatFromName(trimmedName) === 'raw' ? `?${IMAGE_PREALLOCATE_OPTION}=true` : '';
  return { path: `@${IMAGE_FILE_MODULE_KEY}://${joined}${options}` };
}
