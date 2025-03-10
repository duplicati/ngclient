import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, signal } from '@angular/core';

@Component({
  selector: 'app-disconnected-dialog',
  imports: [DecimalPipe],
  template: `
    <header header>
      <h3 i18n>Reconnecting...</h3>
    </header>

    <div content>
      <p i18n>
        The connection to the server is lost, attempting again in
        <strong>0:{{ countdown() | number: '2.0-0' }}</strong>
      </p>
    </div>
  `,
  styleUrl: './disconnected-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisconnectedDialogComponent {
  reconnectTimer = signal(15000);
  countdown = signal(0);

  connectTimerEffect = effect(() => {
    const timer = this.reconnectTimer();
    this.countdown.set(timer / 1000);
  });

  interval = setInterval(() => {
    const timer = this.countdown();

    if (timer <= 1) {
      this.countdown.set(this.reconnectTimer() / 1000);
      return;
    }

    this.countdown.set(this.countdown() - 1);
  }, 1000);

  ngOnDestroy() {
    clearInterval(this.interval);
  }
}
