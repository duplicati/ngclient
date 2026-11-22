import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipAlertItemInternal, ShipAlertService } from '@ship-ui/core/ship-alert';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsState } from '../../../notifications/notifications.state';
import { NotificationDto } from '../../openapi';
import ServiceHubComponent from './service-hub.component';

describe('ServiceHub preview lifecycle', () => {
  let fixture: ComponentFixture<ServiceHubComponent>;
  const notifications = signal<NotificationDto[]>([]);
  const history = signal<ShipAlertItemInternal[]>([]);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    notifications.set([{ ID: 1 } as NotificationDto]);
    history.set([]);
    TestBed.configureTestingModule({
      imports: [ServiceHubComponent],
      providers: [
        { provide: NotificationsState, useValue: { notifications } },
        {
          provide: ShipAlertService,
          useValue: {
            alertHistory: history,
            alertHistoryIsOpen: signal(false),
            alertHistoryIsHidden: signal(false),
          },
        },
      ],
    });
    TestBed.overrideComponent(ServiceHubComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(ServiceHubComponent);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function alert(id: string): ShipAlertItemInternal {
    return { id, title: 'Alert', type: 'error', isOpen: true, animateIn: false, animateOut: false };
  }

  function start() {
    fixture.detectChanges();
    TestBed.tick();
    expect(fixture.componentInstance.shownMessage()?.countDown).toBe(3);
    expect(vi.getTimerCount()).toBe(1);
  }

  it.each(['notification', 'alert'] as const)('keeps the existing %s countdown and stops its expired timer', (type) => {
    if (type === 'alert') {
      history.set([alert('alert')]);
      fixture.componentInstance.isNotificationsOpen.set(true);
    }
    start();
    expect(fixture.componentInstance.shownMessage()?.type).toBe(type);
    vi.advanceTimersByTime(3000);
    expect(fixture.componentInstance.shownMessage()?.countDown).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(fixture.componentInstance.shownMessage()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['success', 'error'] as const)('previews a new %s alert without server notifications', (type) => {
    notifications.set([]);
    fixture.detectChanges();
    TestBed.tick();
    history.set([{ ...alert('verify'), title: 'Verify completed', type }]);
    TestBed.tick();
    expect(fixture.componentInstance.shownMessage()).toMatchObject({
      type: 'alert',
      content: { id: 'verify', type, title: 'Verify completed' },
      countDown: 3,
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('previews the new alert rather than an existing server notification', () => {
    start();
    history.set([alert('verify')]);
    TestBed.tick();
    expect(fixture.componentInstance.shownMessage()).toMatchObject({ type: 'alert', content: { id: 'verify' } });
  });

  it('stops the timer when a preview is dismissed', () => {
    start();
    fixture.componentInstance.resetPreviewMessage();
    expect(fixture.componentInstance.shownMessage()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the timer when notifications become empty', () => {
    start();
    notifications.set([]);
    TestBed.tick();
    expect(fixture.componentInstance.shownMessage()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces the old timer without accelerating the new preview', () => {
    start();
    vi.advanceTimersByTime(500);
    history.set([alert('new')]);
    TestBed.tick();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(500);
    expect(fixture.componentInstance.shownMessage()?.countDown).toBe(3);
    vi.advanceTimersByTime(500);
    expect(fixture.componentInstance.shownMessage()?.countDown).toBe(2);
  });

  it('stops the timer when the component is destroyed', () => {
    start();
    const value = fixture.componentInstance.shownMessage();
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(fixture.componentInstance.shownMessage()).toBe(value);
  });
  it('keeps opening the alerts panel working and stops the preview', () => {
    start();
    fixture.componentInstance.toggleAlerts();
    TestBed.tick();
    expect(fixture.componentInstance.isAlertsOpen()).toBe(true);
    expect(fixture.componentInstance.isNotificationsOpen()).toBe(false);
    expect(fixture.componentInstance.shownMessage()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ServiceHub dismiss all', () => {
  let fixture: ComponentFixture<ServiceHubComponent>;
  const notifications = signal<NotificationDto[]>([]);
  const history = signal<ShipAlertItemInternal[]>([]);
  const deleteAllNotifications = vi.fn(() => notifications.set([]));

  function alert(id: string): ShipAlertItemInternal {
    return { id, title: 'Alert', type: 'error', isOpen: true, animateIn: false, animateOut: false };
  }

  function setup(panel: 'alerts' | 'notifications') {
    // The test DOM does not implement scrollTo, which the panel calls when it opens.
    HTMLElement.prototype.scrollTo ??= () => {};
    TestBed.configureTestingModule({
      imports: [ServiceHubComponent],
      providers: [
        { provide: NotificationsState, useValue: { notifications, deleteAllNotifications } },
        {
          provide: ShipAlertService,
          useValue: {
            alertHistory: history,
            alertHistoryIsOpen: signal(false),
            alertHistoryIsHidden: signal(false),
          },
        },
      ],
    });
    // Keep the real template. Only child component rendering is stubbed.
    TestBed.overrideComponent(ServiceHubComponent, { set: { imports: [ShipTooltip], schemas: [CUSTOM_ELEMENTS_SCHEMA] } });
    fixture = TestBed.createComponent(ServiceHubComponent);
    if (panel === 'alerts') fixture.componentInstance.isAlertsOpen.set(true);
    else fixture.componentInstance.isNotificationsOpen.set(true);
    fixture.detectChanges();
  }

  function dismissAllButton(): HTMLButtonElement | undefined {
    fixture.detectChanges();
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === 'Dismiss all'
    );
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    deleteAllNotifications.mockClear();
  });

  it.each([0, 1])('hides the button with %s alerts', (count) => {
    notifications.set([]);
    history.set(Array.from({ length: count }, (_, index) => alert(`a${index}`)));
    setup('alerts');
    expect(dismissAllButton()).toBeUndefined();
  });

  it('clears every alert', () => {
    notifications.set([]);
    history.set([alert('a'), alert('b')]);
    setup('alerts');
    dismissAllButton()!.click();
    expect(history()).toEqual([]);
    expect(dismissAllButton()).toBeUndefined();
    expect(fixture.componentInstance.isAlertsOpen()).toBe(false);
  });

  it.each([0, 1])('hides the button with %s notifications', (count) => {
    history.set([]);
    notifications.set(Array.from({ length: count }, (_, index) => ({ ID: index }) as NotificationDto));
    setup('notifications');
    expect(dismissAllButton()).toBeUndefined();
  });

  it('dismisses every notification with one request', () => {
    history.set([]);
    notifications.set([{ ID: 1 }, { ID: 2 }] as NotificationDto[]);
    setup('notifications');
    dismissAllButton()!.click();
    expect(deleteAllNotifications).toHaveBeenCalledOnce();
    expect(dismissAllButton()).toBeUndefined();
    expect(fixture.componentInstance.isNotificationsOpen()).toBe(false);
  });
});
