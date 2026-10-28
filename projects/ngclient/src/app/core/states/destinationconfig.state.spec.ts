import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { IDynamicModule } from '../openapi';
import { DestinationConfigState } from './destinationconfig.state';
import { SysinfoState } from './sysinfo.state';

describe('DestinationConfigState provider options', () => {
  afterEach(() => TestBed.resetTestingModule());

  const module = (key: string, displayName = key, description = 'Server description'): IDynamicModule => ({
    Key: key,
    DisplayName: displayName,
    Description: description,
    Options: [],
  });
  function setup(backends: IDynamicModule[] = [], sources: IDynamicModule[] = [], restores: IDynamicModule[] = []) {
    const backendModules = signal(backends);
    const sourceProviderModules = signal(sources);
    const restoreDestinationProviderModules = signal(restores);
    TestBed.configureTestingModule({
      providers: [
        DestinationConfigState,
        {
          provide: SysinfoState,
          useValue: { backendModules, sourceProviderModules, restoreDestinationProviderModules },
        },
      ],
    });
    return {
      state: TestBed.inject(DestinationConfigState),
      backendModules,
      sourceProviderModules,
      restoreDestinationProviderModules,
    };
  }

  it('has no selectable providers before modules are available', () => {
    const { state } = setup();
    expect(state.backendDestinationOptions()).toEqual([]);
    expect(state.sourceProviderOptions()).toEqual([]);
    expect(state.restoreDestinationOptions()).toEqual([]);
    expect(state.allModules()).toEqual([]);
  });

  it('uses advertised backends, skips missing keys and keeps metadata for an unknown provider', () => {
    const { state } = setup([
      { Key: null },
      { Key: '' },
      module('webdav', 'Server WebDAV'),
      module('custombackend', 'Custom storage', 'Custom source description'),
    ]);
    expect(state.backendDestinationOptions().map((x) => x.key)).toEqual(['webdav', 'custombackend']);
    expect(state.backendDestinationOptions()[0].displayName).toBe('WebDAV');
    expect(state.backendDestinationOptions()[1]).toMatchObject({
      key: 'custombackend',
      customKey: null,
      displayName: 'Custom storage',
      description: 'Custom source description',
      sourceDescription: 'Custom source description',
      icon: 'assets/dest-icons/file-system.png',
    });
    expect(state.backendDestinationOptions()[1].searchTerms).toContain('Custom storage');
    expect(state.backendDestinationOptions()[1].searchTerms).toContain('custombackend');
  });

  it('offers both Storj authentication variants with distinct searchable keys', () => {
    const { state } = setup([module('storj')]);
    const options = state.backendDestinationOptions();
    expect(options.map((x) => x.key)).toEqual(expect.arrayContaining(['storjAccessGrant', 'storjApiKey']));
    expect(options).toHaveLength(2);
    for (const option of options) {
      expect(option.customKey).toBe(option.key);
      expect(option.searchTerms).toContain(option.key);
      expect(option.searchTerms).toContain('storj');
    }
  });

  it('keeps explicit source and restore modules separate from backup destinations', () => {
    const { state } = setup([module('custombackend')], [module('customsource')], [module('customrestore')]);
    expect(state.destinationTypeOptions().map((x) => x.key)).toEqual(['custombackend']);
    expect(state.sourceProviderOptions().map((x) => x.key)).toEqual(['customsource']);
    expect(state.restoreDestinationOptions().map((x) => x.key)).toEqual(['customrestore']);
  });

  it('falls back independently to backend modules when a provider group is unavailable', () => {
    const { state, sourceProviderModules, restoreDestinationProviderModules } = setup(
      [module('webdav')],
      [],
      [module('customrestore')]
    );
    expect(state.sourceProviderOptions().map((x) => x.key)).toEqual(['webdav']);
    expect(state.restoreDestinationOptions().map((x) => x.key)).toEqual(['customrestore']);
    sourceProviderModules.set([module('customsource')]);
    restoreDestinationProviderModules.set([]);
    expect(state.sourceProviderOptions().map((x) => x.key)).toEqual(['customsource']);
    expect(state.restoreDestinationOptions().map((x) => x.key)).toEqual(['webdav']);
  });

  it('reacts to refreshed module lists and resumes fallback when explicit providers disappear', () => {
    const { state, backendModules, sourceProviderModules, restoreDestinationProviderModules } = setup(
      [module('custombackend')],
      [module('customsource')],
      [module('customrestore')]
    );
    expect(state.sourceProviderOptions()[0].key).toBe('customsource');
    expect(state.restoreDestinationOptions()[0].key).toBe('customrestore');
    sourceProviderModules.set([]);
    restoreDestinationProviderModules.set([]);
    backendModules.set([module('webdav')]);
    expect(state.destinationTypeOptions().map((x) => x.key)).toEqual(['webdav']);
    expect(state.sourceProviderOptions().map((x) => x.key)).toEqual(['webdav']);
    expect(state.restoreDestinationOptions().map((x) => x.key)).toEqual(['webdav']);
  });

  it('deduplicates shared module keys while retaining the first metadata and provider-only entries', () => {
    const backend = module('shared', 'Backend metadata');
    const source = module('sourceonly');
    const restore = module('restoreonly');
    const { state } = setup(
      [backend],
      [module('shared', 'Source metadata'), source],
      [module('shared', 'Restore metadata'), restore]
    );
    expect(state.allModules()).toEqual([backend, source, restore]);
  });
});
