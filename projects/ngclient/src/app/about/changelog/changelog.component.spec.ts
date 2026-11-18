import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import ChangelogComponent from './changelog.component';

describe('changelog version selection', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(fromUpdate?: string) {
    const params = new BehaviorSubject(convertToParamMap(fromUpdate ? { 'from-update': fromUpdate } : {}));
    const load = vi.fn(() => of({ Changelog: '# Release notes' }));
    TestBed.configureTestingModule({
      imports: [ChangelogComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        { provide: DuplicatiServer, useValue: { getApiV1Changelog: load } },
      ],
    });
    const fixture = TestBed.createComponent(ChangelogComponent);
    fixture.detectChanges();
    return { fixture, params, load };
  }

  it('requests the available update when opened from an update notification', () => {
    const { load, fixture } = setup('true');
    expect(load).toHaveBeenCalledExactlyOnceWith({ query: { 'from-update': true } });
    expect(fixture.nativeElement.textContent).toContain('Release notes');
  });

  it.each([undefined, 'false', 'unexpected'])('requests the installed version for %s', (value) => {
    expect(setup(value).load).toHaveBeenCalledExactlyOnceWith({ query: { 'from-update': false } });
  });

  it('reloads notes when the query changes and releases its subscription on destroy', () => {
    const { load, fixture, params } = setup();
    params.next(convertToParamMap({ 'from-update': 'true' }));
    expect(load).toHaveBeenLastCalledWith({ query: { 'from-update': true } });
    params.next(convertToParamMap({ 'from-update': 'true' }));
    expect(load).toHaveBeenCalledTimes(2);
    fixture.destroy();
    params.next(convertToParamMap({}));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
