import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { ShipButtonGroup } from '@ship-ui/core/ship-button-group';
import { ShipIcon } from '@ship-ui/core/ship-icon';

export type DestinationSource = 'new' | 'saved';

/** Switches between specifying a destination and picking a saved one; shown only when there are saved destinations */
@Component({
  selector: 'app-destination-source-toggle',
  imports: [ShipButtonGroup, ShipIcon],
  template: `
    <sh-button-group class="type-b destination-source" [(value)]="value">
      <button type="button" value="new" i18n>
        <sh-icon>pencil-simple</sh-icon>
        Specify destination
      </button>

      <button type="button" value="saved" i18n>
        <sh-icon>bookmark-simple</sh-icon>
        Saved destinations
      </button>
    </sh-button-group>
  `,
  styles: `
    :host {
      display: block;
    }

    sh-button-group {
      display: flex;
      width: 100%;
    }

    button {
      flex: 1 1 0;
      justify-content: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DestinationSourceToggleComponent {
  value = model<string | null>('new');
}
