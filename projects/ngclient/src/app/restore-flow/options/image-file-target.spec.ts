import { describe, expect, it } from 'vitest';
import {
  buildImageFileRestorePath,
  defaultImageFileName,
  imageFormatFromName,
  setImageExtension,
} from './image-file-target';

describe('Image file restore target', () => {
  it.each([
    ['disk.img', 'raw'],
    ['disk.VHD', 'vhd'],
    ['disk.vhdx', 'vhdx'],
    ['disk', 'raw'],
    ['disk.vhd.bin', 'raw'],
  ] as const)('picks the format of %s as the server does', (name, format) => {
    expect(imageFormatFromName(name)).toBe(format);
  });

  it.each([
    ['disk.img', 'vhd', 'disk.vhd'],
    ['disk.vhd', 'vhdx', 'disk.vhdx'],
    ['disk.vhdx', 'raw', 'disk.img'],
    ['disk.bin', 'raw', 'disk.bin'],
    ['disk.bin', 'vhdx', 'disk.bin.vhdx'],
    ['', 'vhd', 'disk.vhd'],
    ['', 'raw', 'disk.img'],
    ['  server.vhd ', 'vhd', 'server.vhd'],
  ] as const)('gives %s the extension for %s', (name, format, expected) => {
    expect(setImageExtension(name, format)).toBe(expected);
  });

  it.each([
    [['@/mnt/dupl-disk-abc|diskimage:///dev/sda'], 'sda.img'],
    [['@C:\\dupl-disk-abc|diskimage://\\\\.\\PhysicalDrive0'], 'PhysicalDrive0.img'],
    [['/home/user', '@/mnt/x|office365://tenant'], 'disk.img'],
    [null, 'disk.img'],
  ])('suggests a file name from the sources %j', (sources, expected) => {
    expect(defaultImageFileName(sources)).toBe(expected);
  });

  it.each([
    ['/images', 'disk.img', '@diskimage-file:///images/disk.img'],
    ['/images/', 'disk.vhdx', '@diskimage-file:///images/disk.vhdx'],
    ['C:\\Images', 'disk.vhd', '@diskimage-file://C:\\Images\\disk.vhd'],
    ['C:\\', 'disk.img', '@diskimage-file://C:\\disk.img'],
  ])('builds the restore path for %s and %s', (folder, name, expected) => {
    expect(buildImageFileRestorePath(folder, name, false)).toEqual({ path: expected });
  });

  it('reserves the full size only for raw images', () => {
    expect(buildImageFileRestorePath('/images', 'disk.img', true)).toEqual({
      path: '@diskimage-file:///images/disk.img?diskimage-restore-image-preallocate=true',
    });
    expect(buildImageFileRestorePath('/images', 'disk.vhdx', true)).toEqual({
      path: '@diskimage-file:///images/disk.vhdx',
    });
  });

  it.each([
    ['', 'disk.img', 'missing-folder'],
    ['/images', ' ', 'missing-name'],
    ['/images', 'sub/disk.img', 'invalid-name'],
    ['/images', '..', 'invalid-name'],
    ['/images', 'disk?.img', 'invalid-path'],
    ['/images#1', 'disk.img', 'invalid-path'],
  ])('rejects folder %j with name %j', (folder, name, error) => {
    expect(buildImageFileRestorePath(folder, name, false)).toEqual({ error });
  });
});
