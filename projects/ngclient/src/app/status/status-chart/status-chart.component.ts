import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type StatusChartPoint = { time: number; value: number | null };

export type StatusChartSeries = {
  label: string;
  /** A CSS color, such as var(--primary-8) */
  color: string;
  fill?: boolean;
  points: StatusChartPoint[];
};

const WIDTH = 1000;
const HEIGHT = 200;

/**
 * A minimal line chart for the system status page.
 * The SVG is stretched to the container, so the lines use non-scaling strokes and the labels are HTML.
 */
@Component({
  selector: 'app-status-chart',
  templateUrl: './status-chart.component.html',
  styleUrl: './status-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class StatusChartComponent {
  series = input.required<StatusChartSeries[]>();
  windowMs = input.required<number>();
  /** A fixed maximum for the y axis; when not set, the axis scales to the data */
  max = input<number | null>(null);
  /** The smallest maximum used when scaling to the data */
  minMax = input<number>(1);
  /** A horizontal reference line, such as a throttle limit */
  limit = input<number | null>(null);
  formatValue = input<(value: number) => string>((value) => `${Math.round(value)}`);
  /** Samples further apart than this are not connected, as the page was not observing in between */
  maxGapMs = input<number>(5000);

  width = WIDTH;
  height = HEIGHT;

  #now = computed(() => {
    let latest = 0;
    for (const s of this.series()) {
      const last = s.points[s.points.length - 1];
      if (last && last.time > latest) latest = last.time;
    }
    return latest || Date.now();
  });

  yMax = computed(() => {
    const fixed = this.max();
    if (fixed != null) return fixed;

    let peak = this.limit() ?? 0;
    for (const s of this.series()) for (const p of s.points) if (p.value != null && p.value > peak) peak = p.value;

    return niceCeiling(Math.max(peak * 1.1, this.minMax()));
  });

  yTicks = computed(() => {
    const max = this.yMax();
    return [max, max / 2, 0].map((value) => ({ value, label: this.formatValue()(value) }));
  });

  xTicks = computed(() => {
    const minutes = this.windowMs() / 60_000;
    const steps =
      minutes <= 1 ? [60, 45, 30, 15, 0].map((s) => s / 60) : [1, 0.75, 0.5, 0.25, 0].map((f) => f * minutes);
    return steps.map((m) =>
      m === 0 ? $localize`now` : minutes <= 1 ? `-${Math.round(m * 60)}s` : `-${Math.round(m)}m`
    );
  });

  paths = computed(() => {
    const now = this.#now();
    const windowMs = this.windowMs();
    const yMax = this.yMax() || 1;
    const maxGapMs = this.maxGapMs();
    const x = (time: number) => WIDTH - ((now - time) / windowMs) * WIDTH;
    const y = (value: number) => HEIGHT - (Math.min(value, yMax) / yMax) * HEIGHT;

    return this.series().map((s) => {
      const segments: { x: number; y: number }[][] = [];
      let current: { x: number; y: number }[] = [];
      let lastTime: number | null = null;

      for (const p of s.points) {
        if (p.time < now - windowMs) continue;
        if (p.value == null || (lastTime !== null && p.time - lastTime > maxGapMs)) {
          if (current.length) segments.push(current);
          current = [];
        }
        if (p.value != null) current.push({ x: x(p.time), y: y(p.value) });
        lastTime = p.time;
      }
      if (current.length) segments.push(current);

      const line = segments
        .map((seg) => seg.map((pt, i) => `${i ? 'L' : 'M'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' '))
        .join(' ');
      const area = s.fill
        ? segments
            .filter((seg) => seg.length > 1)
            .map(
              (seg) =>
                `M${seg[0].x.toFixed(1)} ${HEIGHT} ` +
                seg.map((pt) => `L${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ') +
                ` L${seg[seg.length - 1].x.toFixed(1)} ${HEIGHT} Z`
            )
            .join(' ')
        : '';

      return { label: s.label, color: s.color, line, area };
    });
  });

  limitY = computed(() => {
    const limit = this.limit();
    if (limit == null || limit <= 0) return null;
    return HEIGHT - (Math.min(limit, this.yMax()) / (this.yMax() || 1)) * HEIGHT;
  });
}

/** Rounds up to 1, 2 or 5 times a power of ten */
export function niceCeiling(value: number) {
  if (value <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}
