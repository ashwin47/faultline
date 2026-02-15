FROM python:3.13-slim

# Install system dependencies + Node.js (needed for MCP stdio servers)
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Create non-root user
RUN groupadd --system agent && useradd --system --gid agent --create-home agent

WORKDIR /app

# Install Python dependencies (cache layer)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application code
COPY agent/ agent/

# Set ownership
RUN chown -R agent:agent /app

USER agent

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "agent.main:app", "--host", "0.0.0.0", "--port", "8000"]
