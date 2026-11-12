import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipAlertItemInternal, ShipAlertService } from '@ship-ui/core/ship-alert';
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
