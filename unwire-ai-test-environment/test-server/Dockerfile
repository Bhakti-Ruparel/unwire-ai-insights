# Unwire AI Test Server
# Simulates a real customer production server with:
# - Node.js application running
# - Docker CLI for container management
# - SSH access for debugging
# - System monitoring tools
# - The Unwire AI agent ready to install

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# ─── System packages ──────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    openssh-server \
    nginx \
    python3 \
    python3-pip \
    postgresql-client \
    redis-tools \
    htop \
    net-tools \
    procps \
    stress-ng \
    sysstat \
    sudo \
    vim \
    jq \
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# ─── Node.js 20 ───────────────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ─── Docker CLI (for container management) ────────────────────────────────
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# ─── SSH setup ─────────────────────────────────────────────────────────────
RUN mkdir -p /run/sshd \
    && echo 'root:unwire-test' | chpasswd \
    && sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config \
    && sed -i 's/#PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config

# ─── Create application directory structure ────────────────────────────────
RUN mkdir -p /opt/apps/express-demo \
    && mkdir -p /opt/unwire/deployments \
    && mkdir -p /scripts \
    && mkdir -p /etc/unwire-agent \
    && mkdir -p /var/log/apps

# ─── Sample Express app will be mounted via docker-compose volume ──────────
# The sample-apps/ folder is mounted to /opt/apps at runtime

# ─── Install functional test agent (Node.js based) ────────────────────────
COPY agent/unwire-agent.js /usr/local/lib/unwire-agent.js
RUN echo '#!/bin/bash\nnode /usr/local/lib/unwire-agent.js "$@"' > /usr/local/bin/unwire-agent \
    && chmod +x /usr/local/bin/unwire-agent

# ─── Entrypoint ───────────────────────────────────────────────────────────
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Scripts will be mounted via volume — set permissions
RUN echo '#!/bin/bash\nchmod +x /scripts/*.sh 2>/dev/null; exec "$@"' > /docker-entrypoint-init.sh \
    && chmod +x /docker-entrypoint-init.sh

EXPOSE 22 4000 9898

ENTRYPOINT ["/entrypoint.sh"]
