import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandLineLogOutputDto, DuplicatiServer } from '../../core/openapi';
import CommandlineResultComponent from './commandline-result.component';

const commandlineResponse = (overrides: Partial<CommandLineLogOutputDto> = {}): CommandLineLogOutputDto => ({
  Pagesize: 100,
  Offset: 0,
  Count: 0,
  Items: [],
  Started: true,
  Finished: false,
  ...overrides,
});

describe('CommandlineResultComponent', () => {
  let component: CommandlineResultComponent;
  let fixture: ComponentFixture<CommandlineResultComponent>;
  let logOutput: HTMLElement;
  let getCommandline: ReturnType<typeof vi.fn>;
  let abortCommandline: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    getCommandline = vi.fn(() => of(commandlineResponse()));
    abortCommandline = vi.fn(() => of({}));

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
            getApiV1CommandlineByRunid: getCommandline,
            postApiV1CommandlineByRunidAbort: abortCommandline,
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
    if (!fixture.componentRef.hostView.destroyed) fixture.destroy();
    vi.useRealTimers();
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

  it('reads every page before marking a finished command as complete', async () => {
    const lines = Array.from({ length: 250 }, (_, index) => `line ${index + 1}`);
    const requestedOffsets: number[] = [];
    getCommandline.mockImplementation((options: { query: { offset: number } }) => {
      const offset = options.query.offset;
      requestedOffsets.push(offset);

      return of(
        commandlineResponse({
          Offset: offset,
          Count: lines.length,
          Items: lines.slice(offset, offset + 100),
          Finished: true,
        })
      );
    });

    await vi.advanceTimersByTimeAsync(3000);

    expect(requestedOffsets).toEqual([0, 100, 200]);
    expect(component.messageLog()).toEqual(lines);
    expect(component.offset()).toBe(250);
    expect(component.status()).toBe('finished');

    await vi.advanceTimersByTimeAsync(1000);
    expect(getCommandline).toHaveBeenCalledTimes(3);
  });

  it('stops polling after a command lookup returns 404', async () => {
    getCommandline.mockReturnValue(throwError(() => ({ status: 404 })));

    await vi.advanceTimersByTimeAsync(3000);

    expect(getCommandline).toHaveBeenCalledTimes(1);
  });

  it('stops polling and marks the run finished when aborting a missing command returns 404', async () => {
    abortCommandline.mockReturnValue(throwError(() => ({ error: { status: 404 } })));

    component.abort();
    await vi.advanceTimersByTimeAsync(3000);

    expect(abortCommandline).toHaveBeenCalledTimes(1);
    expect(getCommandline).not.toHaveBeenCalled();
    expect(component.status()).toBe('finished');
  });

  it('stops polling when the component is destroyed', async () => {
    fixture.destroy();

    await vi.advanceTimersByTimeAsync(3000);

    expect(getCommandline).not.toHaveBeenCalled();
  });

  it('continues polling after errors other than 404', async () => {
    getCommandline.mockReturnValue(throwError(() => ({ error: { status: 503 } })));

    await vi.advanceTimersByTimeAsync(2000);

    expect(getCommandline).toHaveBeenCalledTimes(2);
  });
});
