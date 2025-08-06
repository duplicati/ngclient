import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ShipTabsComponent } from '@ship-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';

@Component({
  selector: 'app-about',
  imports: [StatusBarComponent, ShipTabsComponent, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AboutComponent {}
