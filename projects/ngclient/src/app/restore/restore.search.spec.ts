import { Component, signal } from '@angular/core';
import { DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { DuplicatiServer } from '../core/openapi';
import { BackupsState } from '../core/states/backups.state';
import RestoreComponent from './restore.component';

@Component({ selector: 'app-status-bar', template: '' })
class StatusBarStub {}

const job = (id: string, name: string) => ({
  Backup: { ID: id, Name: name, OperationType: 'Backup' as const, Metadata: {} },
});

describe('Restore backup list search', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup(jobs: ReturnType<typeof job>[]) {
    TestBed.configureTestingModule({
      imports: [RestoreComponent],
      providers: [
        provideRouter([]),
        {
          provide: BackupsState,
          useValue: { backups: signal(jobs), backupsLoading: signal(false), getBackups: vi.fn() },
        },
        { provide: DuplicatiServer, useValue: {} },
      ],
    }).overrideComponent(RestoreComponent, {
      remove: { imports: [StatusBarComponent] },
      add: { imports: [StatusBarStub] },
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(RestoreComponent);
    fixture.detectChanges();
    const blocks = await fixture.getDeferBlocks();
    await blocks[0].render(DeferBlockState.Complete);
    fixture.detectChanges();
    const searchInput = () => fixture.nativeElement.querySelector('sh-form-field input') as HTMLInputElement | null;
    return { fixture, searchInput };
  }
  const many = [job('1', 'Documents'), job('2', 'Photos'), job('3', 'Music'), job('4', 'Projects')];

  it('hides the search field for three or fewer backups', async () => {
    const { searchInput } = await setup(many.slice(0, 3));
    expect(searchInput()).toBeNull();
  });
  it('shows the search field for more than three backups', async () => {
    const { searchInput } = await setup(many);
    expect(searchInput()).not.toBeNull();
  });
  it('filters the list by backup name, case-insensitively', async () => {
    const { fixture, searchInput } = await setup(many);
    const input = searchInput()!;
    input.value = '  PHO ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('sh-card[class*="actionable"] h3').length).toBe(1 + 2);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Photos');
    expect(text).not.toContain('Documents');
    expect(text).not.toContain('No backups match');
  });
  it('shows a no-matches message when nothing matches', async () => {
    const { fixture, searchInput } = await setup(many);
    const input = searchInput()!;
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No backups match "zzz"');
    expect(fixture.nativeElement.textContent).toContain('Direct restore from backup files');
  });
});
