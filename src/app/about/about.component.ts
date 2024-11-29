import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SparkleTabsComponent } from '@sparkle-ui/core';

@Component({
  selector: 'app-about',
  imports: [SparkleTabsComponent, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AboutComponent {}
