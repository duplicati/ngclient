import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-custom-card',
    imports: [],
    templateUrl: './custom-card.component.html',
    styleUrl: './custom-card.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export default class CustomCardComponent {}
