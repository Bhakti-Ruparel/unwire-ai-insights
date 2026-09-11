/**
 * softwareRegistry.ts
 *
 * Curated registry of installable software with OS-specific commands.
 * Only software in this registry can be installed — prevents arbitrary command execution.
 *
 * Each entry defines:
 *   - Metadata (name, description, category, icon)
 *   - Version options
 *   - OS-specific install/uninstall/update commands
 *   - Health check command
 */

export type SoftwareCategory = "databases" | "backend" | "frontend" | "devops" | "monitoring" | "languages";
export type OSType = "linux" | "windows" | "darwin";

export interface SoftwareCommand {
  install: string;
  uninstall: string;
  update: string;
  healthCheck: string;
  startService?: string;
  stopService?: string;
}

export interface SoftwareEntry {
  id: string;
  name: string;
  description: string;
  category: SoftwareCategory;
  icon: string;
  versions: string[];
  defaultVersion: string;
  commands: Record<OSType, SoftwareCommand>;
  tags: string[];
  website?: string;
}

// ─── Registry ─────────────────────────────────────────────────────────────

export const SOFTWARE_REGISTRY: SoftwareEntry[] = [
  // ── Databases ───────────────────────────────────────────────────────────
  {
    id: "postgresql",
    name: "PostgreSQL",
    description: "Advanced open-source relational database",
    category: "databases",
    icon: "🐘",
    versions: ["16", "15", "14"],
    defaultVersion: "16",
    tags: ["database", "sql", "relational", "postgres"],
    website: "https://postgresql.org",
    commands: {
      linux: {
        install: "sudo apt-get update && sudo apt-get install -y postgresql-{VERSION} postgresql-client-{VERSION}",
        uninstall: "sudo apt-get remove -y postgresql-{VERSION} && sudo apt-get autoremove -y",
        update: "sudo apt-get update && sudo apt-get upgrade -y postgresql-{VERSION}",
        healthCheck: "sudo systemctl is-active postgresql",
        startService: "sudo systemctl start postgresql",
        stopService: "sudo systemctl stop postgresql",
      },
      darwin: {
        install: "brew install postgresql@{VERSION} && brew services start postgresql@{VERSION}",
        uninstall: "brew uninstall postgresql@{VERSION}",
        update: "brew upgrade postgresql@{VERSION}",
        healthCheck: "brew services list | grep postgresql",
        startService: "brew services start postgresql@{VERSION}",
        stopService: "brew services stop postgresql@{VERSION}",
      },
      windows: {
        install: "winget install PostgreSQL.PostgreSQL.{VERSION} --silent",
        uninstall: "winget uninstall PostgreSQL.PostgreSQL.{VERSION}",
        update: "winget upgrade PostgreSQL.PostgreSQL.{VERSION}",
        healthCheck: "sc query postgresql-x64-{VERSION}",
        startService: "net start postgresql-x64-{VERSION}",
        stopService: "net stop postgresql-x64-{VERSION}",
      },
    },
  },
  {
    id: "mysql",
    name: "MySQL",
    description: "Popular open-source relational database",
    category: "databases",
    icon: "🐬",
    versions: ["8.0", "5.7"],
    defaultVersion: "8.0",
    tags: ["database", "sql", "relational", "mysql"],
    commands: {
      linux: {
        install: "sudo apt-get update && sudo apt-get install -y mysql-server",
        uninstall: "sudo apt-get remove -y mysql-server && sudo apt-get autoremove -y",
        update: "sudo apt-get update && sudo apt-get upgrade -y mysql-server",
        healthCheck: "sudo systemctl is-active mysql",
        startService: "sudo systemctl start mysql",
        stopService: "sudo systemctl stop mysql",
      },
      darwin: {
        install: "brew install mysql && brew services start mysql",
        uninstall: "brew uninstall mysql",
        update: "brew upgrade mysql",
        healthCheck: "brew services list | grep mysql",
      },
      windows: {
        install: "winget install Oracle.MySQL --silent",
        uninstall: "winget uninstall Oracle.MySQL",
        update: "winget upgrade Oracle.MySQL",
        healthCheck: "sc query MySQL80",
      },
    },
  },
  {
    id: "redis",
    name: "Redis",
    description: "In-memory data store, cache, and message broker",
    category: "databases",
    icon: "🔴",
    versions: ["7.2", "7.0", "6.2"],
    defaultVersion: "7.2",
    tags: ["cache", "database", "nosql", "redis", "queue"],
    commands: {
      linux: {
        install: "sudo apt-get update && sudo apt-get install -y redis-server",
        uninstall: "sudo apt-get remove -y redis-server && sudo apt-get autoremove -y",
        update: "sudo apt-get update && sudo apt-get upgrade -y redis-server",
        healthCheck: "redis-cli ping",
        startService: "sudo systemctl start redis-server",
        stopService: "sudo systemctl stop redis-server",
      },
      darwin: {
        install: "brew install redis && brew services start redis",
        uninstall: "brew uninstall redis",
        update: "brew upgrade redis",
        healthCheck: "redis-cli ping",
      },
      windows: {
        install: "winget install Redis.Redis --silent",
        uninstall: "winget uninstall Redis.Redis",
        update: "winget upgrade Redis.Redis",
        healthCheck: "redis-cli ping",
      },
    },
  },
  {
    id: "mongodb",
    name: "MongoDB",
    description: "Document-oriented NoSQL database",
    category: "databases",
    icon: "🍃",
    versions: ["7.0", "6.0"],
    defaultVersion: "7.0",
    tags: ["database", "nosql", "document", "mongodb", "mongo"],
    commands: {
      linux: {
        install: "curl -fsSL https://www.mongodb.org/static/pgp/server-{VERSION}.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-{VERSION}.gpg && echo 'deb [signed-by=/usr/share/keyrings/mongodb-server-{VERSION}.gpg] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/{VERSION} main' | sudo tee /etc/apt/sources.list.d/mongodb-org-{VERSION}.list && sudo apt-get update && sudo apt-get install -y mongodb-org",
        uninstall: "sudo apt-get remove -y mongodb-org && sudo apt-get autoremove -y",
        update: "sudo apt-get update && sudo apt-get upgrade -y mongodb-org",
        healthCheck: "mongosh --eval 'db.runCommand({ping:1})' --quiet",
        startService: "sudo systemctl start mongod",
        stopService: "sudo systemctl stop mongod",
      },
      darwin: {
        install: "brew tap mongodb/brew && brew install mongodb-community@{VERSION} && brew services start mongodb-community",
        uninstall: "brew uninstall mongodb-community@{VERSION}",
        update: "brew upgrade mongodb-community@{VERSION}",
        healthCheck: "mongosh --eval 'db.runCommand({ping:1})' --quiet",
      },
      windows: {
        install: "winget install MongoDB.Server --silent",
        uninstall: "winget uninstall MongoDB.Server",
        update: "winget upgrade MongoDB.Server",
        healthCheck: "mongosh --eval \"db.runCommand({ping:1})\" --quiet",
      },
    },
  },
  {
    id: "mariadb",
    name: "MariaDB",
    description: "Community-developed fork of MySQL",
    category: "databases",
    icon: "🦭",
    versions: ["11.4", "10.11"],
    defaultVersion: "11.4",
    tags: ["database", "sql", "relational", "mariadb"],
    commands: {
      linux: {
        install: "sudo apt-get update && sudo apt-get install -y mariadb-server",
        uninstall: "sudo apt-get remove -y mariadb-server && sudo apt-get autoremove -y",
        update: "sudo apt-get update && sudo apt-get upgrade -y mariadb-server",
        healthCheck: "sudo systemctl is-active mariadb",
        startService: "sudo systemctl start mariadb",
        stopService: "sudo systemctl stop mariadb",
      },
      darwin: { install: "brew install mariadb && brew services start mariadb", uninstall: "brew uninstall mariadb", update: "brew upgrade mariadb", healthCheck: "brew services list | grep mariadb" },
      windows: { install: "winget install MariaDB.Server --silent", uninstall: "winget uninstall MariaDB.Server", update: "winget upgrade MariaDB.Server", healthCheck: "sc query MariaDB" },
    },
  },

  // ── Languages & Runtimes ────────────────────────────────────────────────
  {
    id: "nodejs",
    name: "Node.js",
    description: "JavaScript runtime built on Chrome's V8 engine",
    category: "languages",
    icon: "🟢",
    versions: ["22", "20", "18"],
    defaultVersion: "20",
    tags: ["javascript", "node", "runtime", "npm"],
    commands: {
      linux: { install: "curl -fsSL https://deb.nodesource.com/setup_{VERSION}.x | sudo -E bash - && sudo apt-get install -y nodejs", uninstall: "sudo apt-get remove -y nodejs && sudo apt-get autoremove -y", update: "curl -fsSL https://deb.nodesource.com/setup_{VERSION}.x | sudo -E bash - && sudo apt-get install -y nodejs", healthCheck: "node --version" },
      darwin: { install: "brew install node@{VERSION}", uninstall: "brew uninstall node@{VERSION}", update: "brew upgrade node@{VERSION}", healthCheck: "node --version" },
      windows: { install: "winget install OpenJS.NodeJS.LTS --silent", uninstall: "winget uninstall OpenJS.NodeJS.LTS", update: "winget upgrade OpenJS.NodeJS.LTS", healthCheck: "node --version" },
    },
  },
  {
    id: "python",
    name: "Python",
    description: "General-purpose programming language",
    category: "languages",
    icon: "🐍",
    versions: ["3.12", "3.11", "3.10"],
    defaultVersion: "3.12",
    tags: ["python", "pip", "runtime"],
    commands: {
      linux: { install: "sudo apt-get update && sudo apt-get install -y python{VERSION} python3-pip python3-venv", uninstall: "sudo apt-get remove -y python{VERSION}", update: "sudo apt-get upgrade -y python{VERSION}", healthCheck: "python3 --version" },
      darwin: { install: "brew install python@{VERSION}", uninstall: "brew uninstall python@{VERSION}", update: "brew upgrade python@{VERSION}", healthCheck: "python3 --version" },
      windows: { install: "winget install Python.Python.{VERSION} --silent", uninstall: "winget uninstall Python.Python.{VERSION}", update: "winget upgrade Python.Python.{VERSION}", healthCheck: "python --version" },
    },
  },
  {
    id: "go",
    name: "Go",
    description: "Statically typed compiled language by Google",
    category: "languages",
    icon: "🔵",
    versions: ["1.22", "1.21"],
    defaultVersion: "1.22",
    tags: ["golang", "go", "runtime"],
    commands: {
      linux: { install: "wget -qO- https://go.dev/dl/go{VERSION}.linux-amd64.tar.gz | sudo tar -xz -C /usr/local && echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee -a /etc/profile", uninstall: "sudo rm -rf /usr/local/go", update: "sudo rm -rf /usr/local/go && wget -qO- https://go.dev/dl/go{VERSION}.linux-amd64.tar.gz | sudo tar -xz -C /usr/local", healthCheck: "/usr/local/go/bin/go version" },
      darwin: { install: "brew install go", uninstall: "brew uninstall go", update: "brew upgrade go", healthCheck: "go version" },
      windows: { install: "winget install GoLang.Go --silent", uninstall: "winget uninstall GoLang.Go", update: "winget upgrade GoLang.Go", healthCheck: "go version" },
    },
  },
  {
    id: "java",
    name: "Java (OpenJDK)",
    description: "Java Development Kit — OpenJDK distribution",
    category: "languages",
    icon: "☕",
    versions: ["21", "17", "11"],
    defaultVersion: "21",
    tags: ["java", "jdk", "openjdk", "runtime"],
    commands: {
      linux: { install: "sudo apt-get update && sudo apt-get install -y openjdk-{VERSION}-jdk", uninstall: "sudo apt-get remove -y openjdk-{VERSION}-jdk", update: "sudo apt-get upgrade -y openjdk-{VERSION}-jdk", healthCheck: "java --version" },
      darwin: { install: "brew install openjdk@{VERSION}", uninstall: "brew uninstall openjdk@{VERSION}", update: "brew upgrade openjdk@{VERSION}", healthCheck: "java --version" },
      windows: { install: "winget install EclipseAdoptium.Temurin.{VERSION}.JDK --silent", uninstall: "winget uninstall EclipseAdoptium.Temurin.{VERSION}.JDK", update: "winget upgrade EclipseAdoptium.Temurin.{VERSION}.JDK", healthCheck: "java --version" },
    },
  },
  // ── Backend / Web Servers ───────────────────────────────────────────────
  {
    id: "nginx",
    name: "Nginx",
    description: "High-performance HTTP and reverse proxy server",
    category: "frontend",
    icon: "🌐",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["nginx", "web", "proxy", "server", "http"],
    commands: {
      linux: { install: "sudo apt-get update && sudo apt-get install -y nginx", uninstall: "sudo apt-get remove -y nginx && sudo apt-get autoremove -y", update: "sudo apt-get upgrade -y nginx", healthCheck: "sudo systemctl is-active nginx", startService: "sudo systemctl start nginx", stopService: "sudo systemctl stop nginx" },
      darwin: { install: "brew install nginx && brew services start nginx", uninstall: "brew uninstall nginx", update: "brew upgrade nginx", healthCheck: "brew services list | grep nginx" },
      windows: { install: "winget install Nginx.Nginx --silent", uninstall: "winget uninstall Nginx.Nginx", update: "winget upgrade Nginx.Nginx", healthCheck: "tasklist /fi \"imagename eq nginx.exe\"" },
    },
  },
  {
    id: "pm2",
    name: "PM2",
    description: "Production process manager for Node.js",
    category: "devops",
    icon: "⚡",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["pm2", "process", "manager", "node", "daemon"],
    commands: {
      linux: { install: "npm install -g pm2", uninstall: "npm uninstall -g pm2", update: "npm update -g pm2", healthCheck: "pm2 --version" },
      darwin: { install: "npm install -g pm2", uninstall: "npm uninstall -g pm2", update: "npm update -g pm2", healthCheck: "pm2 --version" },
      windows: { install: "npm install -g pm2", uninstall: "npm uninstall -g pm2", update: "npm update -g pm2", healthCheck: "pm2 --version" },
    },
  },
  // ── DevOps ──────────────────────────────────────────────────────────────
  {
    id: "docker",
    name: "Docker",
    description: "Container platform for building and running applications",
    category: "devops",
    icon: "🐳",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["docker", "container", "devops"],
    commands: {
      linux: { install: "curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER", uninstall: "sudo apt-get remove -y docker-ce docker-ce-cli containerd.io", update: "sudo apt-get update && sudo apt-get upgrade -y docker-ce", healthCheck: "docker --version && docker ps", startService: "sudo systemctl start docker", stopService: "sudo systemctl stop docker" },
      darwin: { install: "brew install --cask docker", uninstall: "brew uninstall --cask docker", update: "brew upgrade --cask docker", healthCheck: "docker --version" },
      windows: { install: "winget install Docker.DockerDesktop --silent", uninstall: "winget uninstall Docker.DockerDesktop", update: "winget upgrade Docker.DockerDesktop", healthCheck: "docker --version" },
    },
  },
  {
    id: "docker-compose",
    name: "Docker Compose",
    description: "Multi-container Docker application orchestration",
    category: "devops",
    icon: "🐳",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["docker", "compose", "orchestration"],
    commands: {
      linux: { install: "sudo apt-get update && sudo apt-get install -y docker-compose-plugin", uninstall: "sudo apt-get remove -y docker-compose-plugin", update: "sudo apt-get upgrade -y docker-compose-plugin", healthCheck: "docker compose version" },
      darwin: { install: "brew install docker-compose", uninstall: "brew uninstall docker-compose", update: "brew upgrade docker-compose", healthCheck: "docker compose version" },
      windows: { install: "echo Docker Compose is included with Docker Desktop", uninstall: "echo Cannot uninstall separately", update: "echo Update Docker Desktop", healthCheck: "docker compose version" },
    },
  },
  {
    id: "terraform",
    name: "Terraform",
    description: "Infrastructure as Code tool by HashiCorp",
    category: "devops",
    icon: "🏗️",
    versions: ["1.9", "1.8"],
    defaultVersion: "1.9",
    tags: ["terraform", "iac", "infrastructure", "hashicorp"],
    commands: {
      linux: { install: "wget -qO- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg && echo 'deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com jammy main' | sudo tee /etc/apt/sources.list.d/hashicorp.list && sudo apt-get update && sudo apt-get install -y terraform", uninstall: "sudo apt-get remove -y terraform", update: "sudo apt-get update && sudo apt-get upgrade -y terraform", healthCheck: "terraform --version" },
      darwin: { install: "brew install terraform", uninstall: "brew uninstall terraform", update: "brew upgrade terraform", healthCheck: "terraform --version" },
      windows: { install: "winget install Hashicorp.Terraform --silent", uninstall: "winget uninstall Hashicorp.Terraform", update: "winget upgrade Hashicorp.Terraform", healthCheck: "terraform --version" },
    },
  },
  {
    id: "kubectl",
    name: "kubectl",
    description: "Kubernetes command-line tool",
    category: "devops",
    icon: "☸️",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["kubernetes", "k8s", "kubectl", "container", "orchestration"],
    commands: {
      linux: { install: "curl -LO 'https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl' && sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && rm kubectl", uninstall: "sudo rm /usr/local/bin/kubectl", update: "curl -LO 'https://dl.k8s.io/release/$(curl -Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl' && sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && rm kubectl", healthCheck: "kubectl version --client" },
      darwin: { install: "brew install kubectl", uninstall: "brew uninstall kubectl", update: "brew upgrade kubectl", healthCheck: "kubectl version --client" },
      windows: { install: "winget install Kubernetes.kubectl --silent", uninstall: "winget uninstall Kubernetes.kubectl", update: "winget upgrade Kubernetes.kubectl", healthCheck: "kubectl version --client" },
    },
  },
  // ── Monitoring ──────────────────────────────────────────────────────────
  {
    id: "prometheus",
    name: "Prometheus",
    description: "Systems monitoring and alerting toolkit",
    category: "monitoring",
    icon: "🔥",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["prometheus", "monitoring", "metrics", "alerting"],
    commands: {
      linux: { install: "sudo apt-get update && sudo apt-get install -y prometheus", uninstall: "sudo apt-get remove -y prometheus", update: "sudo apt-get upgrade -y prometheus", healthCheck: "sudo systemctl is-active prometheus", startService: "sudo systemctl start prometheus", stopService: "sudo systemctl stop prometheus" },
      darwin: { install: "brew install prometheus && brew services start prometheus", uninstall: "brew uninstall prometheus", update: "brew upgrade prometheus", healthCheck: "brew services list | grep prometheus" },
      windows: { install: "echo Download from https://prometheus.io/download/", uninstall: "echo Manual removal required", update: "echo Download latest version", healthCheck: "curl -s localhost:9090/-/healthy" },
    },
  },
  {
    id: "grafana",
    name: "Grafana",
    description: "Analytics and interactive visualization platform",
    category: "monitoring",
    icon: "📊",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["grafana", "monitoring", "visualization", "dashboard"],
    commands: {
      linux: { install: "sudo apt-get install -y apt-transport-https software-properties-common && wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | sudo tee /etc/apt/keyrings/grafana.gpg > /dev/null && echo 'deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main' | sudo tee /etc/apt/sources.list.d/grafana.list && sudo apt-get update && sudo apt-get install -y grafana", uninstall: "sudo apt-get remove -y grafana", update: "sudo apt-get upgrade -y grafana", healthCheck: "sudo systemctl is-active grafana-server", startService: "sudo systemctl start grafana-server", stopService: "sudo systemctl stop grafana-server" },
      darwin: { install: "brew install grafana && brew services start grafana", uninstall: "brew uninstall grafana", update: "brew upgrade grafana", healthCheck: "brew services list | grep grafana" },
      windows: { install: "winget install GrafanaLabs.Grafana --silent", uninstall: "winget uninstall GrafanaLabs.Grafana", update: "winget upgrade GrafanaLabs.Grafana", healthCheck: "sc query Grafana" },
    },
  },
  {
    id: "certbot",
    name: "Certbot (Let's Encrypt)",
    description: "Automated SSL certificate management",
    category: "devops",
    icon: "🔒",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["ssl", "https", "letsencrypt", "certbot", "certificate"],
    commands: {
      linux: { install: "sudo apt-get update && sudo apt-get install -y certbot python3-certbot-nginx", uninstall: "sudo apt-get remove -y certbot", update: "sudo apt-get upgrade -y certbot", healthCheck: "certbot --version" },
      darwin: { install: "brew install certbot", uninstall: "brew uninstall certbot", update: "brew upgrade certbot", healthCheck: "certbot --version" },
      windows: { install: "winget install EFF.Certbot --silent", uninstall: "winget uninstall EFF.Certbot", update: "winget upgrade EFF.Certbot", healthCheck: "certbot --version" },
    },
  },
  {
    id: "git",
    name: "Git",
    description: "Distributed version control system",
    category: "devops",
    icon: "📦",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["git", "version control", "scm"],
    commands: {
      linux: { install: "sudo apt-get update && sudo apt-get install -y git", uninstall: "sudo apt-get remove -y git", update: "sudo apt-get upgrade -y git", healthCheck: "git --version" },
      darwin: { install: "brew install git", uninstall: "brew uninstall git", update: "brew upgrade git", healthCheck: "git --version" },
      windows: { install: "winget install Git.Git --silent", uninstall: "winget uninstall Git.Git", update: "winget upgrade Git.Git", healthCheck: "git --version" },
    },
  },
  // ── Docker Applications (one-click deploy) ──────────────────────────────
  {
    id: "n8n",
    name: "n8n",
    description: "Workflow automation platform — self-hosted Zapier alternative",
    category: "devops",
    icon: "⚙️",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["n8n", "automation", "workflow", "integration", "zapier"],
    website: "https://n8n.io",
    commands: {
      linux: {
        install: "docker pull n8nio/n8n:latest && docker run -d --name n8n --restart unless-stopped -p 5678:5678 -v n8n_data:/home/node/.n8n -e N8N_HOST=0.0.0.0 -e N8N_PORT=5678 -e N8N_PROTOCOL=http n8nio/n8n:latest",
        uninstall: "docker stop n8n && docker rm n8n && docker volume rm n8n_data",
        update: "docker pull n8nio/n8n:latest && docker stop n8n && docker rm n8n && docker run -d --name n8n --restart unless-stopped -p 5678:5678 -v n8n_data:/home/node/.n8n -e N8N_HOST=0.0.0.0 -e N8N_PORT=5678 n8nio/n8n:latest",
        healthCheck: "curl -sf http://localhost:5678/healthz || docker ps --filter name=n8n --format '{{.Status}}'",
        startService: "docker start n8n",
        stopService: "docker stop n8n",
      },
      darwin: {
        install: "docker pull n8nio/n8n:latest && docker run -d --name n8n --restart unless-stopped -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n:latest",
        uninstall: "docker stop n8n && docker rm n8n",
        update: "docker pull n8nio/n8n:latest && docker stop n8n && docker rm n8n && docker run -d --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n:latest",
        healthCheck: "curl -sf http://localhost:5678/healthz",
      },
      windows: {
        install: "docker pull n8nio/n8n:latest && docker run -d --name n8n --restart unless-stopped -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n:latest",
        uninstall: "docker stop n8n && docker rm n8n",
        update: "docker pull n8nio/n8n:latest && docker stop n8n && docker rm n8n && docker run -d --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n:latest",
        healthCheck: "docker ps --filter name=n8n --format \"{{.Status}}\"",
      },
    },
  },
  {
    id: "nocodb",
    name: "NocoDB",
    description: "Open-source Airtable alternative — turns any database into a smart spreadsheet",
    category: "backend",
    icon: "📊",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["nocodb", "airtable", "database", "spreadsheet", "no-code"],
    website: "https://nocodb.com",
    commands: {
      linux: {
        install: "docker pull nocodb/nocodb:latest && docker run -d --name nocodb --restart unless-stopped -p 8080:8080 -v nocodb_data:/usr/app/data nocodb/nocodb:latest",
        uninstall: "docker stop nocodb && docker rm nocodb && docker volume rm nocodb_data",
        update: "docker pull nocodb/nocodb:latest && docker stop nocodb && docker rm nocodb && docker run -d --name nocodb --restart unless-stopped -p 8080:8080 -v nocodb_data:/usr/app/data nocodb/nocodb:latest",
        healthCheck: "curl -sf http://localhost:8080/api/v1/health || docker ps --filter name=nocodb --format '{{.Status}}'",
        startService: "docker start nocodb",
        stopService: "docker stop nocodb",
      },
      darwin: {
        install: "docker pull nocodb/nocodb:latest && docker run -d --name nocodb -p 8080:8080 -v nocodb_data:/usr/app/data nocodb/nocodb:latest",
        uninstall: "docker stop nocodb && docker rm nocodb",
        update: "docker pull nocodb/nocodb:latest && docker stop nocodb && docker rm nocodb && docker run -d --name nocodb -p 8080:8080 -v nocodb_data:/usr/app/data nocodb/nocodb:latest",
        healthCheck: "curl -sf http://localhost:8080/api/v1/health",
      },
      windows: {
        install: "docker pull nocodb/nocodb:latest && docker run -d --name nocodb -p 8080:8080 -v nocodb_data:/usr/app/data nocodb/nocodb:latest",
        uninstall: "docker stop nocodb && docker rm nocodb",
        update: "docker pull nocodb/nocodb:latest && docker stop nocodb && docker rm nocodb && docker run -d --name nocodb -p 8080:8080 -v nocodb_data:/usr/app/data nocodb/nocodb:latest",
        healthCheck: "docker ps --filter name=nocodb --format \"{{.Status}}\"",
      },
    },
  },
  {
    id: "portainer",
    name: "Portainer",
    description: "Docker management UI — manage containers, images, and volumes visually",
    category: "devops",
    icon: "🐋",
    versions: ["latest"],
    defaultVersion: "latest",
    tags: ["portainer", "docker", "container", "management", "ui"],
    website: "https://portainer.io",
    commands: {
      linux: {
        install: "docker volume create portainer_data && docker run -d --name portainer --restart unless-stopped -p 9000:9000 -p 9443:9443 -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce:latest",
        uninstall: "docker stop portainer && docker rm portainer && docker volume rm portainer_data",
        update: "docker pull portainer/portainer-ce:latest && docker stop portainer && docker rm portainer && docker run -d --name portainer --restart unless-stopped -p 9000:9000 -p 9443:9443 -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce:latest",
        healthCheck: "curl -sf http://localhost:9000/api/system/status || docker ps --filter name=portainer --format '{{.Status}}'",
        startService: "docker start portainer",
        stopService: "docker stop portainer",
      },
      darwin: {
        install: "docker volume create portainer_data && docker run -d --name portainer -p 9000:9000 -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce:latest",
        uninstall: "docker stop portainer && docker rm portainer",
        update: "docker pull portainer/portainer-ce:latest && docker stop portainer && docker rm portainer && docker run -d --name portainer -p 9000:9000 -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce:latest",
        healthCheck: "curl -sf http://localhost:9000/api/system/status",
      },
      windows: {
        install: "docker volume create portainer_data && docker run -d --name portainer -p 9000:9000 -v //./pipe/docker_engine://./pipe/docker_engine -v portainer_data:/data portainer/portainer-ce:latest",
        uninstall: "docker stop portainer && docker rm portainer",
        update: "docker pull portainer/portainer-ce:latest && docker stop portainer && docker rm portainer && docker run -d --name portainer -p 9000:9000 -v //./pipe/docker_engine://./pipe/docker_engine -v portainer_data:/data portainer/portainer-ce:latest",
        healthCheck: "docker ps --filter name=portainer --format \"{{.Status}}\"",
      },
    },
  },
];

// ─── Lookup functions ─────────────────────────────────────────────────────

export function getSoftwareById(id: string): SoftwareEntry | undefined {
  return SOFTWARE_REGISTRY.find((s) => s.id === id);
}

export function searchSoftware(query: string): SoftwareEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return SOFTWARE_REGISTRY;
  return SOFTWARE_REGISTRY.filter((s) =>
    s.name.toLowerCase().includes(q) ||
    s.id.includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.tags.some((t) => t.includes(q))
  );
}

export function getSoftwareByCategory(category: SoftwareCategory): SoftwareEntry[] {
  return SOFTWARE_REGISTRY.filter((s) => s.category === category);
}

export function getCategories(): SoftwareCategory[] {
  return ["databases", "backend", "frontend", "devops", "monitoring", "languages"];
}

/**
 * Resolve the install command for a specific software + OS + version.
 * Returns null if the software is not in the registry (prevents arbitrary execution).
 */
export function resolveCommand(
  softwareId: string,
  action: "install" | "uninstall" | "update" | "healthCheck" | "startService" | "stopService",
  os: OSType,
  version?: string
): string | null {
  const entry = getSoftwareById(softwareId);
  if (!entry) return null;

  const cmds = entry.commands[os];
  if (!cmds) return null;

  const cmd = cmds[action];
  if (!cmd) return null;

  const ver = version ?? entry.defaultVersion;
  return cmd.replace(/\{VERSION\}/g, ver);
}
