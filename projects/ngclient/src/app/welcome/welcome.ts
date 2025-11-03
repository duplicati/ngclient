import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-welcome',
  imports: [RouterOutlet],
  templateUrl: './welcome.html',
  styleUrl: './welcome.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Welcome {}
