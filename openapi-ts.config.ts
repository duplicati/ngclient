import { defineConfig } from '@hey-api/openapi-ts';

const localFile = false; // && './swagger-orgid-tokens.json';
const apiInput = 'http://localhost:8200/swagger/v1/swagger.json';
export default defineConfig({
  client: 'angular',
  input: localFile || apiInput,
  output: 'src/app/core/openapi',
  schemas: true,
  services: {
    asClass: true,
  },
});
