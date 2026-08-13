import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipMenu } from '@ship-ui/core/ship-menu';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import ToggleCardComponent from '../../../core/components/toggle-card/toggle-card.component';
import { NewFilterComponent } from '../../source-data/new-filter/new-filter.component';

@Component({
  selector: 'app-filters',
  imports: [
    FormsModule,
    ShipButton,
    ShipIcon,
    ShipMenu,
    ShipFormField,
    ShipTooltip,
    ToggleCardComponent,
    NewFilterComponent,
  ],
  templateUrl: './filters.component.html',
  styleUrl: './filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FiltersComponent {
  #injector = inject(Injector);

  filters = model.required<string[]>();
  osType = input<string>('');
  disableToggle = input<boolean>(true);

  bulkFilterEditMode = signal(false);
  bulkFilters = signal('');
  lastAddedIndex = signal<number | null>(null);

  filtersContainer = viewChild.required<ElementRef<HTMLDivElement>>('filtersContainer');

  hasFilters = computed(() => this.filters().length > 0);

  wrongConfiguration = computed(() => {
    const filters = this.filters();
    if (filters.length === 0) return false;

    const excludeAllIndex = filters.findIndex((f) => f === '-*' || f === '-*.*' || f === '-**');
    if (excludeAllIndex === -1) return false;

    const firstIncludeIndex = filters.findIndex((f) => f.startsWith('+'));

    // Triggers if there is no include rule, or the exclude-all rule comes before the first include rule
    return firstIncludeIndex === -1 || excludeAllIndex < firstIncludeIndex;
  });

  toggleBulkFilterEdit() {
    if (this.bulkFilterEditMode()) {
      this.bulkFilterEditMode.set(false);
    } else {
      this.bulkFilters.set(this.filters().join('\n'));
      this.bulkFilterEditMode.set(true);
    }
  }

  saveBulkFilterEdit() {
    const newFilters = this.bulkFilters()
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f !== '' && (f.startsWith('-') || f.startsWith('+')));

    // Remove duplicates while preserving order
    const uniqueFilters = [...new Set(newFilters)];
    this.filters.set(uniqueFilters);
    this.bulkFilterEditMode.set(false);
  }

  addFilter() {
    const currentFilters = this.filters();
    const newIndex = currentFilters.length;
    this.filters.set([...currentFilters, '-*.lock']);
    this.lastAddedIndex.set(newIndex);

    // Scroll to the new filter after the view updates
    afterNextRender(
      () => {
        this.scrollToFilter(newIndex);
      },
      { injector: this.#injector }
    );
  }

  scrollToFilter(index: number) {
    const container = this.filtersContainer()?.nativeElement;
    if (!container) return;

    const filterElements = container.querySelectorAll('app-new-filter');
    if (filterElements[index]) {
      filterElements[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  updateFilterAt(newFilter: string, index: number) {
    const currentFilters = this.filters();
    const updated = [...currentFilters];
    updated[index] = newFilter;
    this.filters.set(updated);
    this.lastAddedIndex.set(null);
  }

  removeFilterAt(index: number) {
    const currentFilters = this.filters();
    const updated = currentFilters.filter((_, i) => i !== index);
    this.filters.set(updated);
    this.lastAddedIndex.set(null);
  }
}
