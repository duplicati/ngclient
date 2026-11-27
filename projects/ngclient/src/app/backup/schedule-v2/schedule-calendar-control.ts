import { contentChild, Directive, effect, ElementRef, model } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { getLocalDateParts, toLocalDateString } from '../models/schedule-form';

@Directive({ selector: 'sh-datepicker-input[appScheduleCalendar]', exportAs: 'appScheduleCalendar' })
export class ScheduleCalendarControl implements FormValueControl<string | Date> {
  // ShipDatepickerInput treats a projected NgControl as a reactive form control.
  // Bind FormField at the host so the picker uses its native input events.
  private readonly dateInput = contentChild<ElementRef<HTMLInputElement>>('dateRef');
  value = model<string | Date>('');

  #writeDate = effect(() => {
    const input = this.dateInput()?.nativeElement;
    const value = this.value();
    if (!input) return;
    const text = value ? this.localDate(value).toString() : '';
    if (input.value !== text) input.value = text;
  });

  updateValue(value: string) {
    if (!value) {
      this.value.set('');
      return;
    }
    const date = this.localDate(value);
    if (!Number.isNaN(date.getTime())) this.value.set(toLocalDateString(date));
  }

  private localDate(value: string | Date) {
    const { year, month, day } = getLocalDateParts(value);
    return new Date(year, month, day);
  }
}
