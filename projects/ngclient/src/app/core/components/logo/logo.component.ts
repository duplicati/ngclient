import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  selector: 'app-logo',
  imports: [],
  templateUrl: './logo.component.html',
  styleUrl: './logo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LogoComponent {
  customLogo = signal<string | null>(null);
  customName = signal<string | null>(null);

  ngOnInit() {
    const wnd = window as any;
    this.customLogo.set(wnd.BRANDING_LOGO);
    this.customName.set(wnd.BRANDING_NAME);
  }
}
