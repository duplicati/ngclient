import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SparkleFormFieldComponent, SparkleIconComponent, SparkleSelectComponent } from '@sparkle-ui/core';

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

type ExpressionType = `${ExpressionDirection}${_ExpressionType}`;
type ExpressionTypeMap = {
  key: string;
  value: ExpressionType;
};

type ExpressionTypeMapExtended = {
  key: string;
  value: ExpressionType;
  startsWith: string;
  endsWith: string;
};

const EXPRESSION_OPTIONS: ExpressionTypeMap[] = [
  {
    key: 'Excludes folders where name contains',
    value: '-FolderName',
  },
  {
    key: 'Excludes folder',
    value: '-Folder',
  },
  {
    key: 'Excludes files where name contains',
    value: '-FileName',
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

@Component({
  selector: 'app-new-filter',
  imports: [FormsModule, SparkleSelectComponent, SparkleFormFieldComponent, SparkleIconComponent],
  templateUrl: './new-filter.component.html',
  styleUrl: './new-filter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewFilterComponent {
  path = input.required<string>();
  osType = input<string>();
  pathChange = output<string>();
  remove = output<void>();

  internalPath = signal<string>('');
  pathType = signal<string>('-Expression');
  currentExpressionOption = computed(() => {
    const pathType = this.pathType();

    return this.expressionOptions().find((x) => x.value === pathType);
  });

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
    const x = newPath.slice(1);
    const direction = newPath.startsWith('-') ? '-' : '+';
    const isWindows = this.osType() === 'Windows';
    const pathDelimiter = isWindows ? '\\' : '/';
    const isShortCut = x.startsWith('%');

    if (
      (isShortCut && x.endsWith(pathDelimiter)) ||
      (isWindows && x.slice(2).startsWith(pathDelimiter) && x.endsWith(pathDelimiter)) ||
      (x.startsWith(pathDelimiter) && x.endsWith(pathDelimiter))
    ) {
      this.pathType.set(`${direction}Folder`);
      this.internalPath.set(x);
    } else if (x.startsWith('*') && x.endsWith(`*${pathDelimiter}`)) {
      this.pathType.set(`${direction}FolderName`);
      this.internalPath.set(x.slice(1, -2));
    } else if (x.startsWith('[.*') && x.endsWith(`[^\\${pathDelimiter}]*]`)) {
      this.pathType.set(`${direction}FileName`);
      this.internalPath.set(x.slice(3, -7));
    } else if (x.startsWith('{') && x.endsWith('}')) {
      this.pathType.set(`${direction}FileGroup`);
      this.internalPath.set(x.slice(1, -1));
    } else if (x.startsWith('[') && x.endsWith(']')) {
      this.pathType.set(`${direction}Regex`);
      this.internalPath.set(x.slice(1, -1));
    } else if (x.startsWith('*.')) {
      this.pathType.set(`${direction}Extension`);
      this.internalPath.set(x.slice(2));
    } else {
      this.pathType.set(`${direction}Expression`);
      this.internalPath.set(x);
    }
  });

  updateFilter() {
    const newPath = this.internalPath();
    const expressionOption = this.currentExpressionOption();

    if (newPath === '') return;

    this.pathChange.emit(
      `${expressionOption?.value.slice(0, 1)}${expressionOption?.startsWith ?? ''}${newPath}${expressionOption?.endsWith ?? ''}`
    );
  }

  removeFilter() {
    this.remove.emit();
  }
}
