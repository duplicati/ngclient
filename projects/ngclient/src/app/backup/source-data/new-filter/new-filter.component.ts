import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipSelect } from '@ship-ui/core/ship-select';

type ExpressionDirection = '-' | '+';
type _ExpressionType =
  | 'Folder'
  | 'FolderName'
  | 'FileName'
  | 'Extension'
  | 'Regex'
  | 'FileGroup'
  | 'Expression'
  | 'File'
  | 'Unknown';

export type ExpressionType = `${ExpressionDirection}${_ExpressionType}`;
type ExpressionTypeMap = {
  key: string;
  value: ExpressionType;
};

type FileGroupTypeMap = {
  key: string;
  value: string;
};

type ExpressionTypeMapExtended = {
  key: string;
  value: ExpressionType;
  startsWith: string;
  endsWith: string;
};

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

const EXPRESSION_OPTIONS: ExpressionTypeMap[] = [
  {
    key: 'Excludes folders where name contains',
    value: '-FolderName',
  },
  {
    key: 'Includes folders where name contains',
    value: '+FolderName',
  },
  {
    key: 'Excludes folder',
    value: '-Folder',
  },
  {
    key: 'Includes folder',
    value: '+Folder',
  },
  {
    key: 'Excludes files where name contains',
    value: '-FileName',
  },
  {
    key: 'Includes files where name contains',
    value: '+FileName',
  },
  {
    key: 'Excludes file extension',
    value: '-Extension',
  },
  {
    key: 'Include file extension',
    value: '+Extension',
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
    key: 'Exclude file groups',
    value: '-FileGroup',
  },
  {
    key: 'Include file groups',
    value: '+FileGroup',
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

export type ParsedFilterPath = {
  type: ExpressionType;
  expression: string;
};

const getPathDelimiter = (osType?: string) => (osType === 'Windows' ? '\\' : '/');

const removeFolderSyntaxDelimiter = (path: string, pathDelimiter: string) => {
  let normalizedPath = path;

  while (
    normalizedPath.endsWith(pathDelimiter) &&
    normalizedPath !== pathDelimiter &&
    !/^[A-Za-z]:\\$/.test(normalizedPath)
  ) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  return normalizedPath;
};

export const parseFilterPath = (path: string, osType?: string): ParsedFilterPath => {
  const expression = path.slice(1);
  const direction: ExpressionDirection = path.startsWith('-') ? '-' : '+';
  const pathDelimiter = getPathDelimiter(osType);
  const isWindows = osType === 'Windows';
  const isShortCut = expression.startsWith('%');

  if (
    (isShortCut && expression.endsWith(pathDelimiter)) ||
    (isWindows && expression.slice(2).startsWith(pathDelimiter) && expression.endsWith(pathDelimiter)) ||
    (expression.startsWith(pathDelimiter) && expression.endsWith(pathDelimiter))
  ) {
    return {
      type: `${direction}Folder`,
      expression: removeFolderSyntaxDelimiter(expression, pathDelimiter),
    };
  }

  if (expression.startsWith('*') && expression.endsWith(`*${pathDelimiter}`)) {
    return { type: `${direction}FolderName`, expression: expression.slice(1, -2) };
  }

  if (expression.startsWith('[.*') && expression.endsWith(`[^\\${pathDelimiter}]*]`)) {
    return { type: `${direction}FileName`, expression: expression.slice(3, -7) };
  }

  if (expression.startsWith('{') && expression.endsWith('}')) {
    return { type: `${direction}FileGroup`, expression: expression.slice(1, -1) };
  }

  if (expression.startsWith('[') && expression.endsWith(']')) {
    return { type: `${direction}Regex`, expression: expression.slice(1, -1) };
  }

  if (expression.startsWith('*.')) {
    return { type: `${direction}Extension`, expression: expression.slice(2) };
  }

  return { type: `${direction}Expression`, expression };
};

export const serializeFilterPath = (
  type: ExpressionType,
  expression: string,
  osType?: string,
  startsWith = '',
  endsWith = ''
) => {
  const direction = type.slice(0, 1);

  if (type.endsWith('Folder')) {
    const pathDelimiter = getPathDelimiter(osType);
    const normalizedExpression = removeFolderSyntaxDelimiter(expression, pathDelimiter);

    return `${direction}${normalizedExpression}${normalizedExpression.endsWith(pathDelimiter) ? '' : pathDelimiter}`;
  }

  return `${direction}${startsWith}${expression}${endsWith}`;
};

@Component({
  selector: 'app-new-filter',
  imports: [FormsModule, ShipSelect, ShipFormField, ShipIcon],
  templateUrl: './new-filter.component.html',
  styleUrl: './new-filter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewFilterComponent {
  #injector = inject(Injector);

  path = input.required<string>();
  osType = input<string>();
  isNew = input<boolean>(false);
  pathChange = output<string>();
  remove = output<void>();

  internalPath = signal<string>('');
  pathType = signal<string>('-Expression');
  textInput = viewChild<ElementRef<HTMLInputElement>>('textInput');
  currentExpressionOption = computed(() => {
    const pathType = this.pathType();

    return this.expressionOptions().find((x) => x.value === pathType);
  });

  fileGroupOptions = signal<FileGroupTypeMap[]>(FILE_GROUP_OPTIONS);

  expressionOptions = computed(() => {
    const isWindows = this.osType() === 'Windows';
    const pathDelimiter = isWindows ? '\\' : '/';

    return EXPRESSION_OPTIONS.map((x): ExpressionTypeMapExtended => {
      if (x.value === '-Folder' || x.value === '+Folder') {
        return {
          ...x,
          startsWith: ``,
          endsWith: ``,
        };
      } else if (x.value === '-FolderName' || x.value === '+FolderName') {
        return {
          ...x,
          startsWith: `*`,
          endsWith: `*${pathDelimiter}`,
        };
      } else if (x.value === '-FileName' || x.value === '+FileName') {
        return {
          ...x,
          startsWith: `[.*`,
          endsWith: `[^\\${pathDelimiter}]*]`,
        };
      } else if (x.value === '-FileGroup' || x.value === '+FileGroup') {
        return {
          ...x,
          startsWith: `{`,
          endsWith: `}`,
        };
      } else if (x.value === '-Regex' || x.value === '+Regex') {
        return {
          ...x,
          startsWith: `[`,
          endsWith: `]`,
        };
      } else if (x.value === '-Extension' || x.value === '+Extension') {
        return {
          ...x,
          startsWith: `*.`,
          endsWith: ``,
        };
      } else {
        return {
          ...x,
          startsWith: ``,
          endsWith: ``,
        };
      }
    });
  });

  pathEffect = effect(() => {
    const newPath = this.path();
    const parsedPath = parseFilterPath(newPath, this.osType());

    this.pathType.set(parsedPath.type);
    this.internalPath.set(parsedPath.expression);

    // Focus the input if this is a newly added filter
    if (this.isNew()) {
      afterNextRender(
        () => {
          this.focusInput();
        },
        { injector: this.#injector }
      );
    }
  });

  focusInput() {
    const input = this.textInput()?.nativeElement;
    if (input) {
      input.focus();
      input.select();
    }
  }

  updateFilter() {
    let newPath = this.internalPath();
    const expressionOption = this.currentExpressionOption();

    if (newPath === '') return;
    if (newPath === '*') {
      newPath = '';
    }

    if (!expressionOption) return;

    this.pathChange.emit(
      serializeFilterPath(
        expressionOption.value,
        newPath,
        this.osType(),
        expressionOption.startsWith,
        expressionOption.endsWith
      )
    );
  }

  removeFilter() {
    this.remove.emit();
  }
}
