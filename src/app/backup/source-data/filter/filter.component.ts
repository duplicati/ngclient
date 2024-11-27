import { ChangeDetectionStrategy, Component, effect, input, output, signal, WritableSignal } from '@angular/core';
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
  | 'File';

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
    imports: [
        FormsModule,
        SparkleSelectComponent,
        SparkleIconComponent,
        SparkleFormFieldComponent,
        SparkleSelectComponent,
    ],
    templateUrl: './filter.component.html',
    styleUrl: './filter.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilterComponent {
  path = input.required<string>();
  pathChange = output<string>();
  remove = output<void>();

  expressionOptions = signal(EXPRESSION_OPTIONS);
  fileGroupOptions = signal(FILE_GROUP_OPTIONS);

  pathState = signal<FilterValue | null>(null);
  pathEffect = effect(
    () => {
      const pathPart = this.path();
      const stringWithoutDirection = pathPart.slice(1);
      const direction = pathPart.startsWith('-') ? '-' : '+';

      if (stringWithoutDirection.startsWith('/') && stringWithoutDirection.endsWith('/')) {
        return this.pathState.set({
          type: `${direction}Folder`,
          path: stringWithoutDirection,
          expression: stringWithoutDirection,
        });
      } else if (stringWithoutDirection.startsWith('*') && stringWithoutDirection.endsWith('*/')) {
        return this.pathState.set({
          type: `${direction}FolderNameIncludes`,
          path: stringWithoutDirection,
          expression: stringWithoutDirection.slice(1, -2),
        });
      } else if (stringWithoutDirection.startsWith('[.*') && stringWithoutDirection.endsWith(`[^\\/]*]`)) {
        return this.pathState.set({
          type: `${direction}FileNameIncludes`,
          path: stringWithoutDirection,
          expression: stringWithoutDirection.slice(3, -7),
        });
      } else if (stringWithoutDirection.startsWith('{') && stringWithoutDirection.endsWith('}')) {
        return this.pathState.set({
          type: `${direction}FileGroup`,
          path: stringWithoutDirection,
          expression: stringWithoutDirection.slice(1, -1),
        });
      } else if (stringWithoutDirection.startsWith('[') && stringWithoutDirection.endsWith(']')) {
        return this.pathState.set({
          type: `${direction}Regex`,
          path: stringWithoutDirection,
          expression: stringWithoutDirection.slice(1, -1),
        });
      } else if (stringWithoutDirection.startsWith('*.')) {
        return this.pathState.set({
          type: `${direction}Extension`,
          path: stringWithoutDirection,
          expression: stringWithoutDirection.slice(2),
        });
      } else {
        return this.pathState.set({
          type: `${direction}Expression`,
          path: stringWithoutDirection,
          expression: stringWithoutDirection,
        });
      }
    },
    {
      allowSignalWrites: true,
    }
  );

  // TODO map to path
  updateStateType(type: ExpressionType) {
    this.pathState.update((x) => {
      x!.type = type;
      x!.path = this.#mapToPath(x!);

      return x;
    });

    this.pathChange.emit(this.pathState()!.path);
  }

  updateStateExpression(expression: string) {
    this.pathState.update((x) => {
      x!.expression = expression;
      x!.path = this.#mapToPath(x!);

      return x;
    });

    this.pathChange.emit(this.pathState()!.path);
  }

  #mapToPath(value: FilterValue) {
    const direction = value.type.slice(0, 1);
    const valueType = value.type.slice(1);

    if (valueType === 'Folder') {
      const hasTrailingSlash = value.expression.endsWith('/');
      const hasLeadingSlash = value.expression.startsWith('/');

      if (hasTrailingSlash && hasLeadingSlash) {
        return `${direction}${value.expression}`;
      }

      if (hasTrailingSlash) {
        return `${direction}${value.expression}/`;
      }

      if (hasLeadingSlash) {
        return `${direction}/${value.expression}`;
      }

      return `${direction}/${value.expression}/`;
    }

    if (valueType === 'FolderNameIncludes') {
      return `${direction}*${value.expression}*/`;
    }

    if (valueType === 'FileNameIncludes') {
      return `${direction}[.*${value.expression}[^\\/]*]`;
    }

    if (valueType === 'FileGroup') {
      return `${direction}{${value.expression}}`;
    }

    if (valueType === 'Regex') {
      return `${direction}[${value.expression}]`;
    }

    if (valueType === 'Extension') {
      return `${direction}*.${value.expression}`;
    }

    // Expression
    return `${direction}${value.expression}`;
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
