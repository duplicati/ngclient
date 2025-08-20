import { InjectionToken } from '@angular/core';
import { SingleDestinationStateDefault } from './single-destination-default.state';

export const SINGLE_DESTINATION_STATE = new InjectionToken<SingleDestinationStateDefault>('SingleDestinationState', {
  providedIn: 'root',
  factory: () => new SingleDestinationStateDefault(),
});
