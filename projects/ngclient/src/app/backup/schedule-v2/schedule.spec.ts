import { describe, it, expect } from 'vitest';
import { scheduleOptionToSchedule } from './schedule.component';

describe('scheduleOptionToSchedule', () => {
  it('should correctly parse local date/time and convert to ISO string matching local components', () => {
    const input = {
      autoRun: true,
      nextTime: {
        time: '08:50:00',
        date: '2026-06-14',
      },
      runAgain: {
        repeatValue: 1,
        repeatUnit: 'D',
        allowedDays: {
          mon: true,
          tue: true,
          wed: true,
          thu: true,
          fri: true,
          sat: true,
          sun: true,
        },
      },
    };

    const result = scheduleOptionToSchedule(input);
    expect(result).not.toBeNull();
    
    // Parse result.Time back into a Date object.
    // The local date/time components of this Date object must exactly match the inputs,
    // regardless of the timezone the test is run in.
    const parsedDate = new Date(result!.Time!);
    
    expect(parsedDate.getFullYear()).toBe(2026);
    expect(parsedDate.getMonth()).toBe(5); // June is index 5
    expect(parsedDate.getDate()).toBe(14);
    expect(parsedDate.getHours()).toBe(8);
    expect(parsedDate.getMinutes()).toBe(50);
  });

  it('should return null if autoRun is false', () => {
    const input = {
      autoRun: false,
      nextTime: {
        time: '13:00:00',
        date: '2026-06-14',
      },
      runAgain: {
        repeatValue: 1,
        repeatUnit: 'D',
        allowedDays: {
          mon: true,
          tue: true,
          wed: true,
          thu: true,
          fri: true,
          sat: true,
          sun: true,
        },
      },
    };

    const result = scheduleOptionToSchedule(input);
    expect(result).toBeNull();
  });
});
