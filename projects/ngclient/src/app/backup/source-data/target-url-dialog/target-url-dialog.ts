import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { ShipButton } from '@ship-ui/core';
import { IDynamicModule } from '../../../core/openapi';
import { TestState } from '../../backup.state';
import { DestinationListItemComponent } from '../../destination/destination-list-item/destination-list-item.component';
import { DestinationListComponent } from '../../destination/destination-list/destination-list.component';
import { getConfigurationByKey } from '../../destination/destination.config-utilities';
import { SingleDestinationComponent } from '../../destination/single-destination/single-destination.component';
import { TestUrl } from './test-url/test-url';

@Component({
  selector: 'app-target-url-dialog',
  imports: [SingleDestinationComponent, DestinationListComponent, DestinationListItemComponent, ShipButton, TestUrl],
  templateUrl: './target-url-dialog.html',
  styleUrl: './target-url-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TargetUrlDialog {
  data = input<{ targetUrlModel: string | null }>();
  closed = output<string | null>();

  targetUrlModel = signal<string | null>(null);

  dataEffect = effect(() => {
    const data = this.data();

    data?.targetUrlModel && this.targetUrlModel.set(data.targetUrlModel);
  });

  testSignal = signal<TestState>('');

  setTargetUrl(targetUrl: string | null, resetLastTargetUrl = false) {
    this.targetUrlModel.set(targetUrl);
  }

  setDestination(key: IDynamicModule['Key']) {
    const config = getConfigurationByKey(key ?? '');
    if (!config) return;

    if (config.mapper.default) {
      const defaultUrl = config.mapper.default('');
      this.setTargetUrl(defaultUrl, true);
      return;
    }

    this.setTargetUrl(`${key}://`, true);
  }

  submit() {
    this.closed.emit(this.targetUrlModel());
  }

  removeDestination() {
    this.setTargetUrl(null, true);
  }
}
