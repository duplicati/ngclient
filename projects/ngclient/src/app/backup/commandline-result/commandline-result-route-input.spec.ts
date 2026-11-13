import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterLink, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import CommandlineResultComponent from './commandline-result.component';

@Component({ template: '<p>Command editor</p>' })
class EditorStub {}

describe('CommandlineResult route inputs', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup(path = '/backup/42/commandline/run-a?state=first') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            {
              path: 'backup/:id/commandline/:runId',
              component: CommandlineResultComponent,
              canActivate: [(route) => route.params['runId'] !== 'blocked'],
            },
            { path: 'backup/:id/commandline', component: EditorStub },
          ],
          withComponentInputBinding()
        ),
        {
          provide: DuplicatiServer,
          useValue: {
            getApiV1CommandlineByRunid: () => of({ Started: false, Items: [], Offset: 0, Count: 0 }),
          },
        },
      ],
    });
    TestBed.overrideComponent(CommandlineResultComponent, {
      set: {
        imports: [RouterLink],
        template: '<button routerLink="../" [queryParams]="{state: stateId()}">Back</button><code #logOutput></code>',
      },
    });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(path, CommandlineResultComponent);
    return { harness, component };
  }

  it('reads path and query values on first navigation', async () => {
    const { component } = await setup();
    expect(component.runId()).toBe('run-a');
    expect(component.stateId()).toBe('first');
  });

  it('updates both values when the route component is reused', async () => {
    const { harness, component } = await setup();
    expect(await harness.navigateByUrl('/backup/43/commandline/run-b?state=second', CommandlineResultComponent)).toBe(
      component
    );
    expect(component.runId()).toBe('run-b');
    expect(component.stateId()).toBe('second');
  });

  it('clears a removed query state while retaining the path run ID', async () => {
    const { harness, component } = await setup();
    await harness.navigateByUrl('/backup/42/commandline/run-a', CommandlineResultComponent);
    expect(component.runId()).toBe('run-a');
    expect(component.stateId()).toBeUndefined();
  });

  it('keeps the path run ID ahead of a conflicting query value', async () => {
    const { component } = await setup('/backup/42/commandline/run-a?runId=other&state=first#log');
    expect(component.runId()).toBe('run-a');
    expect(component.stateId()).toBe('first');
  });

  it.each([
    ['first', '?state=first'],
    ['', ''],
  ] as const)('preserves the Back destination for state %s', async (state, query) => {
    const { harness } = await setup('/backup/42/commandline/run-a' + (state ? `?state=${state}` : ''));
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('button')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/backup/42/commandline' + query);
  });

  it('keeps the current inputs when a guard rejects another run', async () => {
    const { harness, component } = await setup();
    await harness.navigateByUrl('/backup/42/commandline/blocked?state=other');
    expect(component.runId()).toBe('run-a');
    expect(component.stateId()).toBe('first');
  });
});
