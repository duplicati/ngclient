FROM oven/bun:1.4.4 AS base

# Create app directory
WORKDIR /app

RUN apt-get update && \
  apt-get install -y gettext-base && \
  rm -rf /var/lib/apt/lists/*

RUN bun --version

# Copy lock files
COPY package.json bun.lock ./

# Define the build-time variable with a default value
ARG WS_URL=wss://localhost:8080

# Set the build-time variable as an environment variable
ENV WS_URL=${WS_URL}

# Install app dependencies
RUN bun install --frozen-lockfile
RUN bun run ng -- version

ARG BUILD_ENV=dev
ENV BUILD_ENV=${BUILD_ENV}

# Bundle app source
COPY . /app
COPY projects/ngclient/src/environments/environment.prod.ts environment.prod.ts
COPY projects/ngclient/src/environments/environment.ts environment.ts

# Replace environment variables in the environment file
RUN export WS_URL="${WS_URL}" && envsubst < environment.prod.ts > projects/ngclient/src/environments/environment.prod.ts && rm environment.prod.ts
RUN export WS_URL="${WS_URL}" && envsubst < environment.ts > projects/ngclient/src/environments/environment.ts && rm environment.ts

# Use the environment variable to conditionally run the build command
RUN if [ "$BUILD_ENV" = "prod" ]; then \
  bun run build:prod; \
  else \
  bun run build:dev; \
  fi
