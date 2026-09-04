import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { NewFilterComponent, parseFilterPath, serializeFilterPath } from './new-filter.component';

describe('new filter path conversion', () => {
  it.each([
    ['-/home/user/', undefined, '-Folder', '/home/user'],
    ['+C:\\Data\\Backups\\', 'Windows', '+Folder', 'C:\\Data\\Backups'],
    ['-%HOME%/', undefined, '-Folder', '%HOME%'],
    ['-/', undefined, '-Folder', '/'],
    ['-C:\\', 'Windows', '-Folder', 'C:\\'],
  ])('parses %s as a folder without exposing its syntax delimiter', (path, osType, type, expression) => {
    expect(parseFilterPath(path, osType)).toEqual({ type, expression });
  });

  it.each([
    ['-*cache*/', '-FolderName', 'cache'],
    ['-[.*temp[^\\/]*]', '-FileName', 'temp'],
    ['-{DefaultExcludes}', '-FileGroup', 'DefaultExcludes'],
    ['+[^important$]', '+Regex', '^important$'],
    ['-*.tmp', '-Extension', 'tmp'],
    ['-logs/*.tmp', '-Expression', 'logs/*.tmp'],
  ])('keeps the existing parsing behavior for %s', (path, type, expression) => {
    expect(parseFilterPath(path)).toEqual({ type, expression });
  });

  it.each([
    ['-Folder', '/home/user', undefined, '-/home/user/'],
    ['+Folder', 'C:\\Data\\Backups', 'Windows', '+C:\\Data\\Backups\\'],
    ['-Folder', '%HOME%', undefined, '-%HOME%/'],
    ['-Folder', '/home/user///', undefined, '-/home/user/'],
    ['+Folder', 'C:\\Data\\Backups\\\\', 'Windows', '+C:\\Data\\Backups\\'],
  ] as const)('serializes %s paths with one trailing delimiter', (type, expression, osType, expected) => {
    expect(serializeFilterPath(type, expression, osType)).toBe(expected);
  });

  it('keeps non-folder affixes unchanged', () => {
    expect(serializeFilterPath('-Expression', '*.tmp')).toBe('-*.tmp');
    expect(serializeFilterPath('+Regex', 'important', undefined, '[', ']')).toBe('+[important]');
  });
});

describe('NewFilterComponent folder editing', () => {
  let fixture: ComponentFixture<NewFilterComponent>;

  const createFixture = (path: string, osType?: string) => {
    TestBed.configureTestingModule({ imports: [NewFilterComponent] });
    fixture = TestBed.createComponent(NewFilterComponent);
    fixture.componentRef.setInput('path', path);
    fixture.componentRef.setInput('osType', osType);
    fixture.detectChanges();

    return fixture.componentInstance;
  };

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('keeps an excluded folder selected while its path is edited', () => {
    const component = createFixture('-/srv/backups');
    let emittedPath = '';
    component.pathChange.subscribe((path) => (emittedPath = path));

    component.pathType.set('-Folder');
    component.internalPath.set('/srv/backups/archive');
    component.updateFilter();

    expect(emittedPath).toBe('-/srv/backups/archive/');

    fixture.componentRef.setInput('path', emittedPath);
    fixture.detectChanges();

    expect(component.pathType()).toBe('-Folder');
    expect(component.internalPath()).toBe('/srv/backups/archive');
  });

  it('keeps an included Windows folder selected while its path is edited', () => {
    const component = createFixture('+C:\\Data', 'Windows');
    let emittedPath = '';
    component.pathChange.subscribe((path) => (emittedPath = path));

    component.pathType.set('+Folder');
    component.internalPath.set('C:\\Data\\Documents');
    component.updateFilter();

    expect(emittedPath).toBe('+C:\\Data\\Documents\\');

    fixture.componentRef.setInput('path', emittedPath);
    fixture.detectChanges();

    expect(component.pathType()).toBe('+Folder');
    expect(component.internalPath()).toBe('C:\\Data\\Documents');
  });

  it('does not change an expression filter while editing', () => {
    const component = createFixture('-logs/*.lock');
    let emittedPath = '';
    component.pathChange.subscribe((path) => (emittedPath = path));

    component.internalPath.set('logs/*.tmp');
    component.updateFilter();

    expect(emittedPath).toBe('-logs/*.tmp');
    expect(component.pathType()).toBe('-Expression');
  });
});
