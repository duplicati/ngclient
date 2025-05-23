import { ChangeDetectionStrategy, Component, effect, ElementRef, input, signal, ViewChild } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { SparkleButtonComponent, SparkleIconComponent } from '@sparkle-ui/core';

@Component({
  selector: 'app-file-drop-textarea',
  templateUrl: './file-drop-textarea.component.html',
  styleUrls: ['./file-drop-textarea.component.scss'],
  standalone: true,
  imports: [FormsModule, SparkleIconComponent, SparkleButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: FileDropTextareaComponent,
      multi: true,
    },
  ],
})
export class FileDropTextareaComponent implements ControlValueAccessor {
  customId = input<string>();
  content = signal('');
  readonly = signal(false);
  placeholder = input<string | null>('Drop a file here or use the browse button');

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.readFile(input.files[0]);
    }
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.readFile(event.dataTransfer.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  private readFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      this.content.set(reader.result as string);
    };
    reader.readAsText(file);
  }

  triggerBrowse() {
    this.fileInputRef.nativeElement.click();
    return false;
  }

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  onChangeEffect = effect(() => {
    this.onChange(this.content());
  });

  writeValue(value: string): void {
    this.content.set(value);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.readonly.set(isDisabled);
  }
}
