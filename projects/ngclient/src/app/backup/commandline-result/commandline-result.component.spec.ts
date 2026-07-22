import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import CommandlineResultComponent from './commandline-result.component';

describe('CommandlineResultComponent', () => {
  let component: CommandlineResultComponent;
  let fixture: ComponentFixture<CommandlineResultComponent>;
  let logOutput: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CommandlineResultComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            params: new BehaviorSubject({ runId: 'run-id' }),
            queryParams: new BehaviorSubject({ state: 'state-id' }),
          },
        },
        {
          provide: DuplicatiServer,
          useValue: {
            getApiV1CommandlineByRunid: vi.fn(() => of({})),
            postApiV1CommandlineByRunidAbort: vi.fn(() => of({})),
          },
        },
      ],
    });

    TestBed.overrideComponent(CommandlineResultComponent, {
      set: {
        imports: [],
        template: '<code #logOutput (scroll)="updateAutoScroll()">{{ messageLog().join("\\n") }}</code>',
      },
    });

    fixture = TestBed.createComponent(CommandlineResultComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    logOutput = fixture.nativeElement.querySelector('code');

    Object.defineProperties(logOutput, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 100, writable: true },
    });
  });

  afterEach(() => {
    clearInterval(component.interval);
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('follows new output while the log is at the bottom', () => {
    component.messageLog.set(['new output']);
    fixture.detectChanges();

    expect(logOutput.scrollTop).toBe(200);
  });

  it('pauses while earlier output is being read and resumes at the bottom', () => {
    logOutput.scrollTop = 40;
    logOutput.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();

    expect(component.autoScrollEnabled()).toBe(false);

    component.messageLog.set(['output while paused']);
    fixture.detectChanges();

    expect(logOutput.scrollTop).toBe(40);

    logOutput.scrollTop = 100;
    logOutput.dispatchEvent(new Event('scroll'));
    Object.defineProperty(logOutput, 'scrollHeight', { configurable: true, value: 300 });
    component.messageLog.update((messages) => [...messages, 'output after resuming']);
    fixture.detectChanges();

    expect(component.autoScrollEnabled()).toBe(true);
    expect(logOutput.scrollTop).toBe(300);
  });
});
