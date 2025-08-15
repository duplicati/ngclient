import { computed, Injectable } from '@angular/core';
import { IDynamicModule } from '../../../core/openapi';

/**
 * This is to use by default in the SingleDestinationComponent
 * when no other state is provided.
 */

export type OAuthUrls = {
  v1: string | undefined;
  v2: string | undefined;
};

@Injectable({
  providedIn: 'root',
})
export class SingleDestinationStateDefault {
  backendModules = computed<IDynamicModule[]>(() => []);
  serverSettingsOverride = computed<string | undefined>(() => undefined);
  backupServerOverride = computed<string | undefined>(() => undefined);
  oauthUrls = computed<OAuthUrls>(() => ({
    v1: undefined,
    v2: undefined,
  }));
}
