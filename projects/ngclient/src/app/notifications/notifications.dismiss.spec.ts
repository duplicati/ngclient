import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, NotificationDto } from '../core/openapi';
import { AppAuthState } from '../core/states/app-auth.state';
import { NotificationComponent } from './notification/notification.component';
import { NotificationsComponent } from './notifications.component';
import { NotificationsState } from './notifications.state';

function notification(id: number): NotificationDto {
  return {
    ID: id,
    Type: 'Information',
    Title: `Notification ${id}`,
    Message: `Message ${id}`,
    Exception: null,
    BackupID: null,
    Action: null,
    Timestamp: '2026-10-02T00:00:00Z',
    LogEntryID: null,
    MessageID: null,
    MessageLogTag: null,
  };
}

describe('Notification dismissal identity', () => {
  let fixture: ComponentFixture<NotificationsComponent>;

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function setup(filtered = false) {
    const notifications = signal([11, 22, 33].map(notification));
    const deletedIds: number[] = [];
    const deleteNotification = vi.fn((index: number) => {
      deletedIds.push(notifications()[index].ID);
      notifications.update((items) => items.filter((_, itemIndex) => itemIndex !== index));
    });
    TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        { provide: NotificationsState, useValue: { notifications, serverState: signal(null), deleteNotification } },
        { provide: Router, useValue: {} },
        { provide: ActivatedRoute, useValue: {} },
        { provide: ShipDialogService, useValue: {} },
        { provide: ShipAlertService, useValue: {} },
        { provide: DuplicatiServer, useValue: {} },
        { provide: AppAuthState, useValue: {} },
      ],
    });
    // Keep both application templates and the real child component. Only Ship UI rendering is stubbed.
    TestBed.overrideComponent(NotificationComponent, { set: { imports: [], schemas: [CUSTOM_ELEMENTS_SCHEMA] } });
    fixture = TestBed.createComponent(NotificationsComponent);
    if (filtered) {
      fixture.componentRef.setInput('notificationFilterPredicate', {
        predicate: (item: NotificationDto) => item.ID !== 11,
      });
    }
    fixture.detectChanges();
    return { notifications, deleteNotification, deletedIds };
  }

  function dismissButton(id: number): HTMLButtonElement {
    const row = fixture.debugElement
      .queryAll(By.directive(NotificationComponent))
      .find((element) => (element.componentInstance as NotificationComponent).notification().ID === id);
    expect(row).toBeDefined();
    const button = Array.from((row!.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === 'Dismiss'
    );
    expect(button).toBeDefined();
    return button!;
  }

  it('dismisses the displayed notification rather than the hidden notification at the same index', () => {
    const { notifications, deleteNotification, deletedIds } = setup(true);
    expect(fixture.debugElement.queryAll(By.directive(NotificationComponent))).toHaveLength(2);
    dismissButton(22).click();
    expect(deletedIds).toEqual([22]);
    expect(deleteNotification).toHaveBeenCalledExactlyOnceWith(1);
    expect(notifications().map((item) => item.ID)).toEqual([11, 33]);
    fixture.detectChanges();
    expect(fixture.componentInstance.notifications().map((item) => item.ID)).toEqual([33]);
  });

  it.each([11, 22, 33])('dismisses notification %s in an unfiltered list', (id) => {
    const { notifications, deletedIds } = setup();
    dismissButton(id).click();
    expect(deletedIds).toEqual([id]);
    expect(notifications().map((item) => item.ID)).toEqual([11, 22, 33].filter((itemId) => itemId !== id));
  });

  it('resolves the current index when the full list changes before the view refreshes', () => {
    const { notifications, deleteNotification, deletedIds } = setup();
    const button = dismissButton(22);
    notifications.update((items) => [notification(99), ...items]);
    button.click();
    expect(deletedIds).toEqual([22]);
    expect(deleteNotification).toHaveBeenCalledExactlyOnceWith(2);
    expect(notifications().map((item) => item.ID)).toEqual([99, 11, 33]);
  });

  it('does nothing when the displayed notification has already disappeared from the full list', () => {
    const { notifications, deleteNotification } = setup();
    const button = dismissButton(22);
    notifications.set([11, 33].map(notification));
    button.click();
    expect(deleteNotification).not.toHaveBeenCalled();
    expect(notifications().map((item) => item.ID)).toEqual([11, 33]);
  });
});
