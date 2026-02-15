# =============================================================================
# Stage 1: Build frontend assets (Vue + Vite)
# =============================================================================
FROM node:25-slim AS frontend-build

RUN npm install -g pnpm

WORKDIR /app

# Install JS dependencies first (cache layer)
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy frontend source + build configs
COPY frontend/ frontend/
COPY vite.config.ts tsconfig.json tailwind.config.js postcss.config.js ./
COPY config/vite.json config/vite.json
COPY public/ public/

# Build frontend assets → public/vite/
RUN pnpm build

# =============================================================================
# Stage 2: Install Ruby gems
# =============================================================================
FROM ruby:3.4-slim AS gem-build

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
      build-essential \
      libpq-dev \
      libyaml-dev \
      git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Gemfile Gemfile.lock ./
RUN bundle config set --local without 'development test' && \
    bundle install --jobs 4 --retry 3

# =============================================================================
# Stage 3: Production image
# =============================================================================
FROM ruby:3.4-slim AS production

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
      libpq5 \
      curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system rails && useradd --system --gid rails rails

WORKDIR /app

# Copy gems from build stage
COPY --from=gem-build /usr/local/bundle /usr/local/bundle

# Copy application code
COPY . .

# Copy built frontend assets from node build stage
COPY --from=frontend-build /app/public/vite public/vite

# Remove files not needed in production
RUN rm -rf frontend tmp/pids tmp/cache \
    && mkdir -p tmp/pids tmp/cache log

# Set ownership
RUN chown -R rails:rails /app

USER rails

ENV RAILS_ENV=production \
    RAILS_LOG_TO_STDOUT=true \
    RAILS_SERVE_STATIC_FILES=true \
    BUNDLE_WITHOUT=development:test

EXPOSE 3000

# Precompile bootsnap cache
RUN bundle exec bootsnap precompile --gemfile app/ lib/

# Default command (overridden by docker-compose for worker)
CMD ["bin/rails", "server", "-b", "0.0.0.0"]
