import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { LOCALSTORAGE } from './core/services/localstorage.token';
import { RelayconfigState } from './core/states/relayconfig.state';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('App', () => {
  let mockLocalStorage: any;
  let mockRelayConfigState: any;
  let querySelectorSpy: any;

  beforeEach(() => {
    mockLocalStorage = {
      clearAllNotCurrentVersion: vi.fn(),
    };

    mockRelayConfigState = {
      fetchConfig: vi.fn(),
    };

    querySelectorSpy = vi.spyOn(document, 'querySelector');

    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: LOCALSTORAGE, useValue: mockLocalStorage },
        { provide: RelayconfigState, useValue: mockRelayConfigState },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create the app component', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should call configureProxySupport, fetchConfig, and clearAllNotCurrentVersion on ngOnInit', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    fixture.detectChanges(); // Trigger ngOnInit

    // configureProxySupport queries the meta tag to load config
    expect(querySelectorSpy).toHaveBeenCalledWith('meta[name="duplicati-proxy-config"]');
    expect(mockRelayConfigState.fetchConfig).toHaveBeenCalled();
    expect(mockLocalStorage.clearAllNotCurrentVersion).toHaveBeenCalled();
  });
});
