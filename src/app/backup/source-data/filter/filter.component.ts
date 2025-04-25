import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  WritableSignal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SparkleFormFieldComponent, SparkleIconComponent, SparkleSelectComponent } from '@sparkle-ui/core';

type ExpressionDirection = '-' | '+';
type _ExpressionType =
  | 'Folder'
  | 'FolderNameIncludes'
  | 'FileNameIncludes'
  | 'Extension'
  | 'Regex'
  | 'FileGroup'
  | 'Expression'
  | 'File'
  | 'Unknown';

type ExpressionType = `${ExpressionDirection}${_ExpressionType}`;

export type FilterValue = {
  type: ExpressionType;
  path: string;
  expression: string;
};
export type FilterValueState = WritableSignal<FilterValue>;

type ExpressionTypeMap = {
  key: string;
  value: ExpressionType;
};

type FileGroupTypeMap = {
  key: string;
  value: string;
};

const EXPRESSION_OPTIONS: ExpressionTypeMap[] = [
  {
    key: 'Excludes folders where name contains',
    value: '-FolderNameIncludes',
  },
  {
    key: 'Excludes folder',
    value: '-Folder',
  },
  {
    key: 'Excludes files where name contains',
    value: '-FileNameIncludes',
  },
  {
    key: 'Excludes file extension',
    value: '-Extension',
  },
  {
    key: 'Excludes files where name matches regex',
    value: '-Regex',
  },
  {
    key: 'Includes files where name matches regex',
    value: '+Regex',
  },
  {
    key: 'Excludes file group',
    value: '-FileGroup',
  },
  {
    key: 'Includes expression',
    value: '+Expression',
  },
  {
    key: 'Excludes expression',
    value: '-Expression',
  },
  {
    key: 'None',
    value: '-Unknown',
  },
] as const;

const FILE_GROUP_OPTIONS: FileGroupTypeMap[] = [
  {
    key: 'Applications',
    value: 'Applications',
  },
  {
    key: 'CacheFiles',
    value: 'Cache Files',
  },
  {
    key: 'TemporaryFiles',
    value: 'Temporary Files',
  },
  {
    key: 'OperatingSystem',
    value: 'Operating System',
  },
  {
    key: 'SystemFiles',
    value: 'System Files',
  },
  {
    key: 'DefaultExcludes',
    value: 'Standard Excludes',
  },
];

@Component({
  selector: 'app-filter',
  imports: [FormsModule, SparkleIconComponent, SparkleFormFieldComponent, SparkleSelectComponent],
  templateUrl: './filter.component.html',
  styleUrl: './filter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterComponent {
  path = input.required<string>();
  osType = input<string>();
  pathChange = output<string>();
  remove = output<void>();

  expressionOptions = signal(EXPRESSION_OPTIONS);
  fileGroupOptions = signal(FILE_GROUP_OPTIONS);

  pathState = signal<FilterValue | null>(null);
  typeState = computed(() => {
    const pathState = this.pathState();

    if (!pathState) return null;

    return pathState.type;
  });
  pathEffect = effect(() => {
    const pathPart = this.path();
    const x = pathPart.slice(1);
    const direction = pathPart.startsWith('-') ? '-' : '+';
    const isWindows = this.osType() === 'Windows';
    const pathDelimiter = isWindows ? '\\' : '/';
    const isShortCut = x.startsWith('%');

    if (x === '') {
      return;
      // this.pathState.set({
      //   type: '-Unknown',
      //   path: '___none___',
      //   expression: '',
      // });
    }

    if (
      (isShortCut && x.endsWith(pathDelimiter)) ||
      (isWindows && x.slice(2).startsWith('\\') && x.endsWith('\\')) ||
      (x.startsWith(pathDelimiter) && x.endsWith(pathDelimiter))
    ) {
      return this.pathState.set({
        type: `${direction}Folder`,
        path: x,
        expression: x,
      });
    } else if (x.startsWith('*') && x.endsWith(`*${pathDelimiter}`)) {
      return this.pathState.set({
        type: `${direction}FolderNameIncludes`,
        path: x,
        expression: x.slice(1, -2),
      });
    } else if (x.startsWith('[.*') && x.endsWith(`[^\\${pathDelimiter}]*]`)) {
      return this.pathState.set({
        type: `${direction}FileNameIncludes`,
        path: x,
        expression: x.slice(3, -7),
      });
    } else if (x.startsWith('{') && x.endsWith('}')) {
      return this.pathState.set({
        type: `${direction}FileGroup`,
        path: x,
        expression: x.slice(1, -1),
      });
    } else if (x.startsWith('[') && x.endsWith(']')) {
      return this.pathState.set({
        type: `${direction}Regex`,
        path: x,
        expression: x.slice(1, -1),
      });
    } else if (x.startsWith('*.')) {
      return this.pathState.set({
        type: `${direction}Extension`,
        path: x,
        expression: x.slice(2),
      });
    } else {
      return this.pathState.set({
        type: `${direction}Expression`,
        path: x,
        expression: x,
      });
    }
  });

  // TODO map to path
  updateStateType(type: ExpressionType) {
    this.pathState.update((x) => {
      x!.type = type;
      x!.path = this.#mapToPath(x!);

      return x;
    });

    this.#emitPathChange();
  }

  updateStateExpression(expression: string) {
    this.pathState.update((x) => {
      x!.expression = expression;
      x!.path = this.#mapToPath(x!);

      return x;
    });

    if (this.pathState()!.path === '' || this.pathState()!.path === '-') {
      return;
    }

    this.#emitPathChange();
  }

  #emitPathChange() {
    setTimeout(() => this.pathChange.emit(this.pathState()!.path));
  }

  #mapToPath(value: FilterValue) {
    const dir = value.type.slice(0, 1);
    const valueType = value.type.slice(1);
    const isWindows = this.osType() === 'Windows';
    const pathDelimiter = isWindows ? '\\' : '/';
    const shouldHandleWindows = isWindows && !value.expression.startsWith('%');
    const expression = shouldHandleWindows ? value.expression.slice(2) : value.expression;
    const isShortCut = value.path.startsWith('%');

    if (valueType === '') {
      return '';
    }

    if (valueType === 'Unknown') {
      return `${dir}${value.expression}`;
    }

    if (valueType === 'Folder') {
      const hasLeadingSlash = isShortCut || expression.startsWith(pathDelimiter);
      const hasTrailingSlash = expression.endsWith(pathDelimiter);

      console.log('hasTrailingSlash', hasTrailingSlash);
      console.log('hasLeadingSlash', hasLeadingSlash);

      if (hasTrailingSlash && hasLeadingSlash) {
        return `${dir}${value.expression}`;
      }

      if (hasLeadingSlash) {
        return `${dir}${pathDelimiter}${value.expression}`;
      }

      if (hasTrailingSlash) {
        return `${dir}${value.expression}${pathDelimiter}`;
      }

      return `${dir}${pathDelimiter}${value.expression}${pathDelimiter}`;
    }

    if (valueType === 'FolderNameIncludes') {
      return `${dir}*${value.expression}*${pathDelimiter}`;
    }

    if (valueType === 'FileNameIncludes') {
      return `${dir}[.*${value.expression}[^\\${pathDelimiter}]*]`;
    }

    if (valueType === 'FileGroup') {
      return `${dir}{${value.expression}}`;
    }

    if (valueType === 'Regex') {
      return `${dir}[${value.expression}]`;
    }

    if (valueType === 'Extension') {
      return `${dir}*.${value.expression}`;
    }

    // Expression
    return `${dir}${value.expression}`;
  }

  removeFilter() {
    this.remove.emit();
  }

  displayFn(val: ExpressionTypeMap['value'] | FileGroupTypeMap['value']) {
    const option = EXPRESSION_OPTIONS.find((x) => x.value === val);

    if (!option) return '';

    return option.key;
  }
}
