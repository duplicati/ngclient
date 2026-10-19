import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent from './file-tree.component';

describe('restore file tree across operating systems', () => {
  let fixture: ComponentFixture<FileTreeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it.each([
    {
      hostSeparator: '\\',
      root: '/home/user/',
      folder: '/home/user/Documents/',
      file: '/home/user/notes.txt',
      child: '/home/user/Documents/report.txt',
    },
    {
      hostSeparator: '/',
      root: 'C:\\Users\\',
      folder: 'C:\\Users\\Documents\\',
      file: 'C:\\Users\\notes.txt',
      child: 'C:\\Users\\Documents\\report.txt',
    },
    {
      hostSeparator: '/',
      root: '\\\\server\\share\\',
      folder: '\\\\server\\share\\Documents\\',
      file: '\\\\server\\share\\notes.txt',
      child: '\\\\server\\share\\Documents\\report.txt',
    },
  ])(
    'classifies and expands $folder on a host using $hostSeparator',
    ({ hostSeparator, root, folder, file, child }) => {
      const list = vi.fn(({ body }: { body: { Paths: string[] | null } }) =>
        of({
          Data: (body.Paths?.[0] === folder ? [child] : [folder, file]).map((Path) => ({
            Path,
            Size: 12,
            Metadata: null,
          })),
        })
      );
      TestBed.configureTestingModule({
        imports: [FileTreeComponent],
        providers: [
          { provide: DuplicatiServer, useValue: { postApiV2BackupListFolder: list } },
          {
            provide: SysinfoState,
            useValue: {
              systemInfo: signal({ DirectorySeparator: hostSeparator }),
              filterGroups: signal({}),
              hasV2ListOperations: () => true,
              hasV2FilterOperations: () => false,
              resolveShorthandPath: (path: string) => path,
            },
          },
          { provide: FileTreeState, useValue: { foldersFirst: signal(true), caseSensitiveSort: signal(false) } },
          { provide: ShipDialogService, useValue: {} },
        ],
      });
      TestBed.overrideComponent(FileTreeComponent, { set: { template: '', imports: [] } });
      fixture = TestBed.createComponent(FileTreeComponent);
      fixture.componentRef.setInput('backupSettings', { id: 'backup-42', time: '2026-10-01T12:00:00Z' });
      fixture.componentRef.setInput('rootPaths', [root]);
      fixture.detectChanges();
      const tree = fixture.componentInstance;
      expect(list).toHaveBeenCalledExactlyOnceWith({
        body: {
          BackupId: 'backup-42',
          Time: '2026-10-01T12:00:00Z',
          Paths: [root],
          PageSize: 0,
          Page: 0,
          ReturnExtended: true,
        },
      });
      expect(tree.treeNodes()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: folder, text: 'Documents', cls: 'folder' }),
          expect.objectContaining({ id: file, text: 'notes.txt', cls: 'file' }),
        ])
      );
      const folderNode = tree.treeStructure()[0].children.find((node) => node.id === folder)!;
      expect(folderNode).toBeDefined();
      tree.toggleNode(new Event('click'), folder, folderNode);
      expect(list).toHaveBeenLastCalledWith({
        body: {
          BackupId: 'backup-42',
          Time: '2026-10-01T12:00:00Z',
          Paths: [folder],
          PageSize: 0,
          Page: 0,
          ReturnExtended: true,
        },
      });
      expect(tree.treeNodes()).toContainEqual(
        expect.objectContaining({ id: child, text: 'report.txt', cls: 'file', parentPath: folder })
      );
      const fileNode = tree.treeStructure()[0].children.find((node) => node.id === file)!;
      tree.toggleNode(new Event('click'), file, fileNode);
      expect(list).toHaveBeenCalledTimes(2);
      expect(tree.errorMessage()).toBeNull();
    }
  );
});
