FROM mcr.microsoft.com/devcontainers/rust:1.85-bookworm

# Install system dependencies for the Rust backend (SQLite via sqlx)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    libsqlite3-dev \
    pkg-config \
    xz-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS with checksum verification
ARG NODE_VERSION=20.19.0
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then NODE_ARCH="x64"; \
    elif [ "$ARCH" = "arm64" ]; then NODE_ARCH="arm64"; \
    else echo "Unsupported architecture: $ARCH" && exit 1; fi && \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o /tmp/node.tar.xz && \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o /tmp/SHASUMS256.txt && \
    grep "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" /tmp/SHASUMS256.txt | sha256sum -c - && \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 && \
    rm /tmp/node.tar.xz /tmp/SHASUMS256.txt && \
    node --version && npm --version

# Install Playwright browser dependencies (for MCP server)
RUN npx -y playwright install-deps chromium

# Install MiMo-Code globally as root (global prefix under /usr/local is root-owned)
RUN npm install -g @mimo-ai/cli

# Switch to vscode user for remaining setup
USER vscode
RUN mkdir -p /home/vscode/.local/state /home/vscode/.local/share/mimocode/log /home/vscode/.config/gh

# Pre-install Playwright Chromium so the MCP server is ready immediately
RUN npx -y playwright install chromium
