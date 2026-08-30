import { defineConfig } from '@hey-api/openapi-ts';

const localFile = './swagger.json';
// const apiInput = 'http://localhost:8200/swagger/v1/swagger.json';
export default defineConfig({
  input: localFile,
  output: 'projects/ngclient/src/app/core/openapi',
  plugins: [
    {
      name: '@hey-api/client-angular',
      throwOnError: true,
    },
    {
      name: '@hey-api/sdk',
      operations: { strategy: 'byTags' },
      responseStyle: 'data',
    },
  ],
});
