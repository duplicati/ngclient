import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SparkleIconComponent, SparkleListComponent } from '@sparkle-ui/core';
import { SysinfoState } from '../../core/states/sysinfo.state';

@Component({
  selector: 'app-server-settings',
  imports: [SparkleListComponent, SparkleIconComponent, NgTemplateOutlet],
  templateUrl: './system-info.component.html',
  styleUrl: './system-info.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SystemInfoComponent {
  #sysInfo = inject(SysinfoState);

  treeStructure = computed(() => {
    const sysInfo = this.#sysInfo.systemInfo();

    return this.processObject(sysInfo, 0);
  });

  toggleNode(node: any) {
    node.isOpen.update((isOpen: any) => !isOpen);
  }

  private processObject(obj: any, level: number): any {
    const children = [];

    for (const key in obj) {
      if (typeof obj[key] === 'object') {
        children.push({
          id: key,
          text: key,
          children: this.processObject(obj[key], level + 1),
          level: level,
          isOpen: signal(false),
        });
      } else {
        children.push({
          id: key,
          text: `${key}: ${obj[key]}`,
          children: [],
          level: level,
          isOpen: signal(false),
        });
      }
    }

    return children;
  }
}
