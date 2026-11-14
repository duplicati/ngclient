import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { ShipTabs } from '@ship-ui/core/ship-tabs';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';

@Component({
  selector: 'app-about',
  imports: [StatusBarComponent, ShipTabs, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AboutComponent {
  #router = inject(Router);
  #url = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects)
    ),
    { initialValue: this.#router.url }
  );

  activeTab = computed(() => {
    const segments = this.#router.parseUrl(this.#url()).root.children['primary']?.segments;
    return segments?.[0]?.path === 'about' && segments[1] ? `/about/${segments[1].path}` : null;
  });

  navigateToTab(path: string | null) {
    if (path && path !== this.activeTab()) void this.#router.navigateByUrl(path);
  }
}
