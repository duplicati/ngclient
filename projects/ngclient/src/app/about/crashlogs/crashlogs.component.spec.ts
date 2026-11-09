import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { CrashLogState } from '../../core/states/crashlog.state';
import CrashlogsComponent from './crashlogs.component';

describe('CrashlogsComponent failed load recovery', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('shows failure rather than an empty log, and retries without leaving the page', () => {
    const replies: Subject<{ Logdata: string | null }>[] = [];
    const get = vi.fn(() => {
      const response = new Subject<{ Logdata: string | null }>();
      replies.push(response);
      return response;
    });
    TestBed.configureTestingModule({
      imports: [CrashlogsComponent],
      providers: [CrashLogState, { provide: DuplicatiServer, useValue: { getApiV1LogdataCrashlog: get } }],
    });
    const fixture = TestBed.createComponent(CrashlogsComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Loading');
    replies[0].error(new Error('unavailable'));
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')?.textContent).toContain('Failed to load crash log');
    expect(element.textContent).not.toContain('No crash log found');
    element.querySelector('button')!.click();
    fixture.detectChanges();
    expect(get).toHaveBeenCalledTimes(2);
    expect(element.querySelector('[role=alert]')).toBeNull();
    expect(element.textContent).toContain('Loading');
    replies[1].next({ Logdata: 'Recovered stack trace' });
    replies[1].complete();
    fixture.detectChanges();
    expect(element.textContent).toContain('Recovered stack trace');
    expect(element.querySelector('button')).toBeNull();
    fixture.destroy();
  });
});
