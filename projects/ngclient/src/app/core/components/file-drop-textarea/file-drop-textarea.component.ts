import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { disabled, form, FormField } from '@angular/forms/signals';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';

@Component({
  selector: 'app-file-drop-textarea',
  templateUrl: './file-drop-textarea.component.html',
  styleUrls: ['./file-drop-textarea.component.scss'],
  standalone: true,
  imports: [FormField, ShipIcon, ShipButton],
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
  readonly = signal(false);
  textForm = form(signal({ content: '' }), (fields) => disabled(fields.content, () => this.readonly()));
  content = this.textForm.content().value;
  contentEdit = output<string>();
  placeholder = input<string | null>($localize`Drop a file here or use the browse button`);

  fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

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
    if (this.readonly()) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (this.readonly()) return;
      this.updateContent(reader.result as string);
    };
    reader.readAsText(file);
  }

  triggerBrowse() {
    if (this.readonly()) return false;
    this.fileInputRef()?.nativeElement.click();
    return false;
  }

  updateContent(value: string) {
    this.content.set(value);
    this.contentEdit.emit(value);
  }

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  onChangeEffect = effect(() => {
    this.onChange(this.content());
  });

  writeValue(value: string): void {
    this.content.set(value ?? '');
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
