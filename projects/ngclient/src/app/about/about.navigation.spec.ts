import { Component, model } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AboutComponent from './about.component';

@Component({ selector: 'app-status-bar', template: '' })
class StatusStub {}
@Component({ selector: 'sh-tabs', template: '<ng-content />' })
class TabsStub {
  value = model<string | null>(null);
}
@Component({ template: '<p>About child</p>' })
class ChildStub {}

const pages = [
  ['General', 'general'],
  ['Changelog', 'changelog'],
  ['Libraries', 'libraries'],
  ['System info', 'system-info'],
  ['Server settings', 'server-settings'],
  ['Logs', 'logs'],
  ['Crash log', 'crashlogs'],
];

describe('About page navigation', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'about',
            component: AboutComponent,
            children: [
              ...pages.filter(([, path]) => path !== 'logs').map(([, path]) => ({ path, component: ChildStub })),
              {
                path: 'logs',
                children: [
                  { path: '', redirectTo: 'stored', pathMatch: 'full' },
                  { path: 'stored', component: ChildStub },
                ],
              },
            ],
          },
        ]),
      ],
    });
    TestBed.overrideComponent(AboutComponent, {
      set: { imports: [StatusStub, TabsStub, RouterOutlet, RouterLink, RouterLinkActive] },
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/about/general');
    const items = () => Array.from(harness.routeNativeElement!.querySelectorAll<HTMLElement>('[tab]'));
    return { harness, items };
  }
  it('offers native links to all seven existing pages', async () => {
    const { items } = await setup();
    expect(items().map((x) => x.textContent!.trim())).toEqual(pages.map(([label]) => label));
    expect(items().map((x) => [x.tagName, x.getAttribute('href')])).toEqual(
      pages.map(([, path]) => ['A', '/about/' + path])
    );
    expect(items().map((x) => x.getAttribute('value'))).toEqual(pages.map(([, path]) => '/about/' + path));
  });
  it('retains normal Router navigation and nested Logs selection', async () => {
    const { harness, items } = await setup();
    items()
      .find((x) => x.textContent!.trim() === 'Logs')!
      .click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/about/logs/stored');
    expect(
      items()
        .filter((x) => x.classList.contains('active'))
        .map((x) => x.textContent!.trim())
    ).toEqual(['Logs']);
  });
  it('keeps the current page when a modified click is meant for a separate tab', async () => {
    const { harness, items } = await setup();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 });
    let preventedByRouter: boolean | undefined;
    // Observe RouterLink first, then suppress the browser default unsupported by jsdom.
    items()[1].addEventListener(
      'click',
      (click) => {
        preventedByRouter = click.defaultPrevented;
        click.preventDefault();
      },
      { once: true }
    );
    items()[1].dispatchEvent(event);
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/about/general');
    expect(preventedByRouter).toBe(false);
  });
  it('keeps the group value aligned with nested routes and history-like navigation', async () => {
    const { harness } = await setup();
    const tabs = () => harness.fixture.debugElement.query(By.directive(TabsStub)).componentInstance as TabsStub;
    expect(tabs().value()).toBe('/about/general');
    await harness.navigateByUrl('/about/logs/stored?query=1#log');
    expect(tabs().value()).toBe('/about/logs');
    await harness.navigateByUrl('/about/system-info');
    expect(tabs().value()).toBe('/about/system-info');
  });
  it('navigates on selection changes without navigating twice for the current page', async () => {
    const { harness } = await setup();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const component = harness.fixture.debugElement.query(By.directive(AboutComponent))
      .componentInstance as AboutComponent;
    component.navigateToTab('/about/general');
    expect(navigate).not.toHaveBeenCalled();
    const tabs = harness.fixture.debugElement.query(By.directive(TabsStub)).componentInstance as TabsStub;
    tabs.value.set('/about/changelog');
    await harness.fixture.whenStable();
    expect(router.url).toBe('/about/changelog');
    expect(tabs.value()).toBe('/about/changelog');
    component.navigateToTab('/about/changelog');
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
