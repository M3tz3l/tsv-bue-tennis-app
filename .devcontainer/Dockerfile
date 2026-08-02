FROM mcr.microsoft.com/devcontainers/rust:latest

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

# Install Node.js 24 LTS (system-wide, works on both amd64 and arm64)
ARG NODE_VERSION=24.18.1
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then NODE_ARCH="x64"; \
    elif [ "$ARCH" = "arm64" ]; then NODE_ARCH="arm64"; \
    else echo "Unsupported architecture: $ARCH" && exit 1; fi && \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1 && \
    node --version && npm --version

# Install Playwright browser dependencies (for MCP server)
RUN npx -y playwright install-deps chromium

# Install MiMo-Code globally as the workspace user
# Rebuild sqlite3 native module from source to link against the container's glibc
USER vscode
RUN npm install -g @mimo-ai/cli

# Install OpenCode (terminal-based AI coding assistant)
RUN curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path \
    && echo 'export PATH="$HOME/.opencode/bin:$PATH"' >> ~/.bashrc

# Pre-install Playwright Chromium so the MCP server is ready immediately
RUN npx -y playwright install chromium
