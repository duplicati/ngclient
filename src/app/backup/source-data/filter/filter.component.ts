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

// {
//   "FilterGroups": {
//       "None": [],
//       "SystemFiles": [
//           "*.dbfseventsd",
//           "*.fseventsd",
//           "/.vol/",
//           "/afs/",
//           "/automount/",
//           "/cores/",
//           "/dev/",
//           "/net/",
//           "/Network/",
//           "/private/Network/",
//           "/private/var/automount/",
//           "/private/var/db/dhcpclient/",
//           "/private/var/db/fseventsd/",
//           "/private/var/folders/",
//           "/private/var/run/",
//           "/private/var/spool/postfix/",
//           "/private/var/vm/"
//       ],
//       "OperatingSystem": [
//           "*/Library/Logs/",
//           "/bin/",
//           "/mach.sym",
//           "/mach_kernel",
//           "/Network/",
//           "/Previous Systems*",
//           "/sbin/",
//           "/System/",
//           "/Volumes/"
//       ],
//       "CacheFiles": [
//           "*.hotfiles.btree*",
//           "*.Spotlight-*/",
//           "*/Application Support/Google/Chrome/Default/Cookies",
//           "*/Application Support/Google/Chrome/Default/Cookies-journal",
//           "*/backups.backupdb/",
//           "*/cookies.sqlite-*",
//           "*/Duplicati/control_dir_v2/",
//           "*/Google/Chrome/*cache*",
//           "*/Google/Chrome/*Current*",
//           "*/Google/Chrome/*LOCK*",
//           "*/Google/Chrome/Safe Browsing*",
//           "*/iP* Software Updates/",
//           "*/iPhoto Library/iPod Photo Cache*",
//           "*/iPhoto Library/iPod Photo Cache/",
//           "*/iTunes/Album Artwork/Cache/",
//           "*/Library/Application Support/SyncServices/",
//           "*/Library/Caches/",
//           "*/Library/Calendars/*/Info.plist",
//           "*/Library/Calendars/Calendar Cache",
//           "*/Library/Cookies/com.apple.appstore.plist",
//           "*/Library/Cookies/Cookies.binarycookies",
//           "*/Library/Mail/*/Info.plist",
//           "*/Library/Mail/AvailableFeeds/",
//           "*/Library/Mail/Envelope Index",
//           "*/Library/Mirrors/",
//           "*/Library/PubSub/Database/",
//           "*/Library/PubSub/Downloads/",
//           "*/Library/PubSub/Feeds/",
//           "*/Library/Safari/HistoryIndex.sk",
//           "*/Library/Safari/Icons.db",
//           "*/Library/Safari/WebpageIcons.db",
//           "*/Library/Saved Application State/",
//           "*/Mozilla/Firefox/*cache*",
//           "*/permissions.sqlite-*",
//           "*MobileBackups/",
//           "/Desktop DB",
//           "/Desktop DF",
//           "/System/Library/Extensions/Caches/"
//       ],
//       "TemporaryFiles": [
//           "*.Trash*",
//           "*/lost+found/",
//           "*/Microsoft User Data/Entourage Temp/",
//           "*/Network Trash Folder/",
//           "*/Trash/",
//           "*/VM Storage",
//           "/private/tmp/",
//           "/private/var/tmp/",
//           "/tmp/",
//           "/var/"
//       ],
//       "Applications": [
//           "/Applications/",
//           "/Library/",
//           "/opt/",
//           "/usr/"
//       ],
//       "DefaultExcludes": [
//           "*.dbfseventsd",
//           "*.fseventsd",
//           "*.hotfiles.btree*",
//           "*.Spotlight-*/",
//           "*.Trash*",
//           "*/Application Support/Google/Chrome/Default/Cookies",
//           "*/Application Support/Google/Chrome/Default/Cookies-journal",
//           "*/backups.backupdb/",
//           "*/cookies.sqlite-*",
//           "*/Duplicati/control_dir_v2/",
//           "*/Google/Chrome/*cache*",
//           "*/Google/Chrome/*Current*",
//           "*/Google/Chrome/*LOCK*",
//           "*/Google/Chrome/Safe Browsing*",
//           "*/iP* Software Updates/",
//           "*/iPhoto Library/iPod Photo Cache*",
//           "*/iPhoto Library/iPod Photo Cache/",
//           "*/iTunes/Album Artwork/Cache/",
//           "*/Library/Application Support/SyncServices/",
//           "*/Library/Caches/",
//           "*/Library/Calendars/*/Info.plist",
//           "*/Library/Calendars/Calendar Cache",
//           "*/Library/Cookies/com.apple.appstore.plist",
//           "*/Library/Cookies/Cookies.binarycookies",
//           "*/Library/Logs/",
//           "*/Library/Mail/*/Info.plist",
//           "*/Library/Mail/AvailableFeeds/",
//           "*/Library/Mail/Envelope Index",
//           "*/Library/Mirrors/",
//           "*/Library/PubSub/Database/",
//           "*/Library/PubSub/Downloads/",
//           "*/Library/PubSub/Feeds/",
//           "*/Library/Safari/HistoryIndex.sk",
//           "*/Library/Safari/Icons.db",
//           "*/Library/Safari/WebpageIcons.db",
//           "*/Library/Saved Application State/",
//           "*/lost+found/",
//           "*/Microsoft User Data/Entourage Temp/",
//           "*/Mozilla/Firefox/*cache*",
//           "*/Network Trash Folder/",
//           "*/permissions.sqlite-*",
//           "*/Trash/",
//           "*/VM Storage",
//           "*MobileBackups/",
//           "/.vol/",
//           "/afs/",
//           "/Applications/",
//           "/automount/",
//           "/bin/",
//           "/cores/",
//           "/Desktop DB",
//           "/Desktop DF",
//           "/dev/",
//           "/Library/",
//           "/mach.sym",
//           "/mach_kernel",
//           "/net/",
//           "/Network/",
//           "/opt/",
//           "/Previous Systems*",
//           "/private/Network/",
//           "/private/tmp/",
//           "/private/var/automount/",
//           "/private/var/db/dhcpclient/",
//           "/private/var/db/fseventsd/",
//           "/private/var/folders/",
//           "/private/var/run/",
//           "/private/var/spool/postfix/",
//           "/private/var/tmp/",
//           "/private/var/vm/",
//           "/sbin/",
//           "/System/",
//           "/tmp/",
//           "/usr/",
//           "/var/",
//           "/Volumes/"
//       ],
//       "DefaultIncludes": []
//   }
// }

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
  standalone: true,
  imports: [
    FormsModule,
    SparkleSelectComponent,
    SparkleIconComponent,
    SparkleFormFieldComponent,
    SparkleSelectComponent,
  ],
  templateUrl: './filter.component.html',
  styleUrl: './filter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
