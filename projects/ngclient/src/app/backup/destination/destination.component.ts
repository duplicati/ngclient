import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  signal,
  viewChildren,
} from '@angular/core';
import { FormBuilder, FormGroup, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ShipAlert,
  ShipButton,
  ShipCard,
  ShipDialog,
  ShipDialogService,
  ShipDivider,
  ShipFormField,
  ShipIcon,
  ShipMenu,
  ShipProgressBar,
  ShipToggleCard,
} from '@ship-ui/core';
import { IDynamicModule } from '../../core/openapi';
import { ConnectionStringsState } from '../../core/states/connection-strings.state';
import { DestinationTypeOption } from '../../core/states/destinationconfig.state';
import { BackupState } from '../backup.state';
import { TestState, TestUrl } from '../source-data/target-url-dialog/test-url/test-url';
import { DestinationListItemComponent } from './destination-list-item/destination-list-item.component';
import { DestinationListComponent } from './destination-list/destination-list.component';
import { getConfigurationByKey, getConfigurationByUrl, getSimplePath } from './destination.config-utilities';
import { SingleDestinationComponent } from './single-destination/single-destination.component';

const fb = new FormBuilder();

export const createDestinationForm = (
  defaults = {
    destinations: [],
  }
) => {
  return fb.group({
    destinations: fb.array<DestinationFormGroup>(defaults.destinations),
  });
};

export const createDestinationFormGroup = ({
  key,
  customGroup,
  dynamicGroup,
  advancedGroup,
}: {
  key: string;
  customGroup: FormGroup;
  dynamicGroup: FormGroup;
  advancedGroup: FormGroup;
}) => {
  return fb.group({
    destinationType: fb.control<string>(key),
    custom: customGroup,
    dynamic: dynamicGroup,
    advanced: advancedGroup,
  });
};

export type DestinationFormGroup = ReturnType<typeof createDestinationFormGroup>;
export type DestinationFormGroupValue = ReturnType<typeof createDestinationFormGroup>['value'];

@Component({
  selector: 'app-destination',
  imports: [
    SingleDestinationComponent,
    DestinationListComponent,
    DestinationListItemComponent,
    TestUrl,

    FormsModule,
    ShipButton,
    ShipFormField,
    ShipMenu,
    ShipIcon,
    ShipDialog,
    ShipAlert,
    ShipCard,
    ShipDivider,
    ShipProgressBar,
    ShipToggleCard,
  ],
  templateUrl: './destination.component.html',
  styleUrl: './destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DestinationComponent {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #backupState = inject(BackupState);
  #dialog = inject(ShipDialogService);
  #connectionStringsState = inject(ConnectionStringsState);
  injector = inject(Injector);

  testUrlComponents = viewChildren<TestUrl>('testUrl');

  // We manage local test states for the list. BackupState's signal might be used for global valid status if we want,
  // but for the list we need individual states.
  testStates = signal<TestState[]>([]);

  targetUrls = this.#backupState.targetUrls;
  targetUrlModel = computed(() => this.targetUrls()[0]?.url ?? null);
  targetUrlCtrl = signal<string | null>(null);
  targetUrlInitial = signal<string | null>(null);
  currentEditingIndex = signal<number | null>(null);
  targetUrlDialogOpen = signal(false);
  showCustomList = signal(false);
  saveConnectionString = this.#backupState.saveConnectionString;
  isConnectionStringSaved = this.#backupState.isConnectionStringSaved;

  destinations = this.#connectionStringsState.destinations;
  isLoadingDestinations = this.#connectionStringsState.resourceDestinations.isLoading;

  isNew = this.#backupState.isNew;

  selectedDestinationType = computed(() => {
    const targetUrl = this.targetUrlModel();

    if (!targetUrl) return null;

    return getConfigurationByUrl(targetUrl) ?? null;
  });

  selectedDestinationTypeOption = computed(() => {
    const x = this.selectedDestinationType();
    return x
      ? ({
          key: x.customKey ?? x.key,
          customKey: x.customKey ?? null,
          displayName: x.displayName,
          description: x.description,
          icon: x.icon,
        } as DestinationTypeOption)
      : null;
  });

  getConnectionString(id: number | null) {
    const connectionString = this.#connectionStringsState.destinations().find((d) => d.ID === id);
    console.log('connection', connectionString);
    return connectionString;
  }

  getSimplePath(url: string | null) {
    if (!url) return '';
    return getSimplePath(url);
  }

  copyTargetUrl(index: number = 0) {
    const url = this.targetUrls()[index]?.url;
    if (url) navigator.clipboard.writeText(url);
  }

  openTargetUrlDialog(index: number = 0) {
    const targetUrl = this.targetUrls()[index]?.url ?? null;
    this.targetUrlCtrl.set(targetUrl);
    this.targetUrlInitial.set(targetUrl);
    this.currentEditingIndex.set(index);
    this.targetUrlDialogOpen.set(true);
  }

  closeTargetUrlDialog(submit = false) {
    this.targetUrlDialogOpen.set(false);

    const targetUrl = this.targetUrlCtrl();
    const initialTargetUrl = this.targetUrlInitial();

    if (!submit || targetUrl === initialTargetUrl || !targetUrl) return;

    const index = this.currentEditingIndex();
    if (index !== null) {
      const currentId = this.targetUrls()[index]?.connectionStringId ?? null;
      this.#backupState.updateTargetUrl(index, targetUrl, currentId);
    } else {
      // Should not happen if opened via button that sets index
      this.#backupState.setTargetUrl(targetUrl);
    }

    this.currentEditingIndex.set(null);
  }

  setDestination(key: IDynamicModule['Key']) {
    const config = getConfigurationByKey(key ?? '');
    if (!config) return;

    const url = config.mapper.default ? config.mapper.default(this.#backupState.backupName() ?? '') : `${key}://`;

    if (this.currentEditingIndex() !== null) {
      this.#backupState.updateTargetUrl(this.currentEditingIndex()!, url, null);
      this.updateTestState(this.currentEditingIndex()!, null);
      this.currentEditingIndex.set(null);
      this.showCustomList.set(false);
      return;
    }

    if (this.showCustomList()) {
      // Adding new
      this.#backupState.addTargetUrl(url, null);
      this.showCustomList.set(false);
      this.isAddingNew.set(false);
    } else {
      // Setting primary or fallback append (less likely used path but preserved for safety)
      this.#backupState.addTargetUrl(url, null);
      this.showCustomList.set(false);
      this.isAddingNew.set(false);
    }
  }

  // Sync test states with target urls length
  // We try to preserve existing states if possible, but indices might shift.
  // For now simple resizing/resetting of new ones.
  targetUrlsEffect = effect(
    () => {
      const urls = this.targetUrls();
      this.testStates.update((states) => {
        if (states.length === urls.length) return states;

        const newStates = [...states];
        if (newStates.length < urls.length) {
          // Add new null states
          for (let i = newStates.length; i < urls.length; i++) {
            newStates.push(null);
          }
        } else {
          // Truncate
          newStates.length = urls.length;
        }
        return newStates;
      });
    },
    { allowSignalWrites: true }
  );

  selectSavedDestination(option: any) {
    if (!option.BaseUrl) return;
    if (!option.BaseUrl) return;

    if (this.targetUrls().length === 0) {
      this.#backupState.setTargetUrl(option.BaseUrl, true, option.ID);
    } else {
      this.#backupState.addTargetUrl(option.BaseUrl, option.ID);
      this.showCustomList.set(false);
      this.isAddingNew.set(false);
    }
  }

  toggleCustomList() {
    this.currentEditingIndex.set(null);
    this.showCustomList.set(true);
  }

  isAddingNew = signal(false);

  startAddingNew() {
    this.isAddingNew.set(true);
  }

  changeDestination(index: number) {
    this.currentEditingIndex.set(index);
    this.showCustomList.set(true);
  }

  closeCustomList() {
    this.showCustomList.set(false);
    this.currentEditingIndex.set(null);
    this.isAddingNew.set(false);
  }

  removeDestination(index: number) {
    this.#backupState.removeTargetUrl(index);
  }

  updateTargetUrl(index: number, url: string | null) {
    if (!url) return;
    const currentId = this.targetUrls()[index]?.connectionStringId ?? null;
    this.#backupState.updateTargetUrl(index, url, currentId);

    // If we want to separate them if the user want to
    // this.#backupState.updateTargetUrl(index, url, null);

    // Reset test state for this index
    this.updateTestState(index, null);
  }

  updateTestState(index: number, state: TestState) {
    this.testStates.update((states) => {
      const newStates = [...states];
      newStates[index] = state;
      return newStates;
    });
  }

  goBack() {
    this.#router.navigate(['general'], { relativeTo: this.#route.parent });
  }

  async next() {
    const isNew = this.#backupState.isNew();

    if (!isNew) {
      this.#navigateToNext();
      return;
    }

    const components = this.testUrlComponents();
    const testStates = this.testStates(); // We use this to check initial state, but relying on component.testDestination is safer for latest ref

    // Sequential validation
    for (let i = 0; i < components.length; i++) {
      const component = components[i];

      // We can check if it's already successful to skip re-testing
      // logic: if testStates[i] is success, continue
      // BUT: user might have changed something? The component's internal logic should handle "if dirty, reset state".
      // If state is 'success', it means it's valid for the CURRENT url.

      const currentState = this.testStates()[i];

      if (currentState && typeof currentState !== 'string' && currentState.action === 'success') {
        continue;
      }

      // Test it
      // We pass false to autoCreateFolders because we want the prompt to happen if needed (handled by TestUrl component if we configured it so?
      // destination.component.html says: [askToCreate]="true".
      // TestUrl.testDestination(false) => folderHandling = askToCreate ? 'prompt' : 'error' => 'prompt'.
      // So it will prompt the user.

      const result = await component.testDestination(false);

      if (result?.action !== 'success') {
        // Stop here. The component shows the error.
        return;
      }
    }

    this.#navigateToNext();
  }

  #navigateToNext() {
    if (this.#backupState.shouldAutoSave()) {
      // In the new world we might want to ensure all connection string IDs are saved/updated?
      // But backupState submit handles saving logic for connection strings now (if we implemented it correctly there)
      // or at least logic exists.
      this.#backupState.submit(true);
    }

    this.#router.navigate(['source-data'], { relativeTo: this.#route.parent });
  }
}
