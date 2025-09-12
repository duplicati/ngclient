import { defineConfig } from '@hey-api/openapi-ts';

const localFile = false; // && './swagger-orgid-tokens.json';
const apiInput = 'http://localhost:8200/swagger/v1/swagger.json';
export default defineConfig({
  input: localFile || apiInput,
  output: 'projects/ngclient/src/app/core/openapi',
  plugins: [
    'legacy/angular',
    {
      asClass: true,
      name: '@hey-api/sdk',
    },
  ],
});
