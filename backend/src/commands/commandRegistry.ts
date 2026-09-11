/**
 * commandRegistry.ts
 *
 * Predefined server commands — the ONLY commands that can be executed.
 * Each command has: risk level, OS support, parameterization, and category.
 * This is the security boundary — nothing outside this registry runs.
 */

export type RiskLevel = "low" | "medium" | "high";
export type CommandCategory = "docker" | "database" | "nginx" | "system" | "git" | "pm2" | "redis" | "node";

export interface CommandParam {
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
}

export interface RegisteredCommand {
  id: string;
  name: string;
  description: string;
  category: CommandCategory;
  command: string;                  // Use {param} for parameterized commands
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  supportedOS: ("linux" | "darwin" | "windows")[];
  params?: CommandParam[];
  icon?: string;
}

// ─── Command Registry ─────────────────────────────────────────────────────

export const COMMAND_REGISTRY: RegisteredCommand[] = [
  // ── Docker ──────────────────────────────────────────────────────────────
  { id: "docker-ps", name: "List Containers", description: "Show all running Docker containers", category: "docker", command: "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Image}}'", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "🐳" },
  { id: "docker-ps-all", name: "List All Containers", description: "Show all containers including stopped", category: "docker", command: "docker ps -a --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Image}}'", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "🐳" },
  { id: "docker-stats", name: "Container Stats", description: "Real-time CPU/memory usage of containers", category: "docker", command: "docker stats --no-stream --format 'table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.NetIO}}'", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "📊" },
  { id: "docker-logs", name: "Container Logs", description: "View last 50 lines of container logs", category: "docker", command: "docker logs --tail 50 {container}", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "📋", params: [{ name: "container", label: "Container Name", placeholder: "my-app", required: true }] },
  { id: "docker-restart", name: "Restart Container", description: "Restart a running container", category: "docker", command: "docker restart {container}", riskLevel: "medium", requiresConfirmation: true, supportedOS: ["linux", "darwin"], icon: "🔄", params: [{ name: "container", label: "Container Name", placeholder: "my-app", required: true }] },
  { id: "docker-stop", name: "Stop Container", description: "Stop a running container", category: "docker", command: "docker stop {container}", riskLevel: "medium", requiresConfirmation: true, supportedOS: ["linux", "darwin"], icon: "⏹️", params: [{ name: "container", label: "Container Name", placeholder: "my-app", required: true }] },
  { id: "docker-start", name: "Start Container", description: "Start a stopped container", category: "docker", command: "docker start {container}", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "▶️", params: [{ name: "container", label: "Container Name", placeholder: "my-app", required: true }] },
  { id: "docker-images", name: "List Images", description: "Show all Docker images", category: "docker", command: "docker images --format 'table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}\\t{{.CreatedSince}}'", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "📦" },
  { id: "docker-prune", name: "Cleanup Unused", description: "Remove unused containers, images, and volumes", category: "docker", command: "docker system prune -f", riskLevel: "high", requiresConfirmation: true, supportedOS: ["linux", "darwin"], icon: "🗑️" },

  // ── Database ────────────────────────────────────────────────────────────
  { id: "pg-status", name: "PostgreSQL Status", description: "Check PostgreSQL service status", category: "database", command: "systemctl status postgresql --no-pager", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux"], icon: "🐘" },
  { id: "pg-version", name: "PostgreSQL Version", description: "Show PostgreSQL version", category: "database", command: "psql --version", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "🐘" },
  { id: "pg-restart", name: "Restart PostgreSQL", description: "Restart the PostgreSQL service", category: "database", command: "sudo systemctl restart postgresql", riskLevel: "medium", requiresConfirmation: true, supportedOS: ["linux"], icon: "🐘" },
  { id: "redis-status", name: "Redis Status", description: "Check Redis connection", category: "redis", command: "redis-cli ping", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "🔴" },
  { id: "redis-info", name: "Redis Info", description: "Show Redis server information", category: "redis", command: "redis-cli info server | head -20", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "🔴" },
  { id: "redis-restart", name: "Restart Redis", description: "Restart Redis service", category: "redis", command: "sudo systemctl restart redis-server", riskLevel: "medium", requiresConfirmation: true, supportedOS: ["linux"], icon: "🔴" },

  // ── Nginx ───────────────────────────────────────────────────────────────
  { id: "nginx-status", name: "Nginx Status", description: "Check Nginx service status", category: "nginx", command: "systemctl status nginx --no-pager", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux"], icon: "🌐" },
  { id: "nginx-test", name: "Test Config", description: "Validate Nginx configuration", category: "nginx", command: "sudo nginx -t", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux"], icon: "✅" },
  { id: "nginx-restart", name: "Restart Nginx", description: "Restart Nginx web server", category: "nginx", command: "sudo systemctl restart nginx", riskLevel: "medium", requiresConfirmation: true, supportedOS: ["linux"], icon: "🔄" },
  { id: "nginx-reload", name: "Reload Nginx", description: "Reload config without downtime", category: "nginx", command: "sudo systemctl reload nginx", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux"], icon: "🔄" },
  { id: "nginx-logs-error", name: "Nginx Error Logs", description: "View last 30 error log entries", category: "nginx", command: "sudo tail -30 /var/log/nginx/error.log", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux"], icon: "📋" },
  { id: "nginx-logs-access", name: "Nginx Access Logs", description: "View last 30 access log entries", category: "nginx", command: "sudo tail -30 /var/log/nginx/access.log", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux"], icon: "📋" },

  // ── System ──────────────────────────────────────────────────────────────
  { id: "sys-cpu", name: "CPU Usage", description: "Show CPU usage per core", category: "system", command: "top -bn1 | head -20", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "💻" },
  { id: "sys-memory", name: "Memory Usage", description: "Show RAM usage", category: "system", command: "free -mh", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux"], icon: "🧠" },
  { id: "sys-disk", name: "Disk Usage", description: "Show disk space", category: "system", command: "df -h", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "💾" },
  { id: "sys-uptime", name: "Uptime", description: "Show server uptime", category: "system", command: "uptime", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "⏱️" },
  { id: "sys-processes", name: "Running Processes", description: "Show top processes by CPU", category: "system", command: "ps aux --sort=-%cpu | head -15", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux"], icon: "📊" },
  { id: "sys-network", name: "Network Connections", description: "Show active network connections", category: "system", command: "ss -tuln | head -20", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux"], icon: "🌐" },
  { id: "sys-os", name: "OS Information", description: "Show operating system details", category: "system", command: "cat /etc/os-release 2>/dev/null || uname -a", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "🖥️" },
  { id: "sys-services", name: "Running Services", description: "List active systemd services", category: "system", command: "systemctl list-units --type=service --state=running --no-pager | head -25", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux"], icon: "⚙️" },

  // ── Git ─────────────────────────────────────────────────────────────────
  { id: "git-status", name: "Git Status", description: "Check git status in a directory", category: "git", command: "cd {directory} && git status", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "📦", params: [{ name: "directory", label: "Directory", placeholder: "/opt/apps/my-project", required: true }] },
  { id: "git-pull", name: "Git Pull", description: "Pull latest changes", category: "git", command: "cd {directory} && git pull", riskLevel: "medium", requiresConfirmation: true, supportedOS: ["linux", "darwin"], icon: "⬇️", params: [{ name: "directory", label: "Directory", placeholder: "/opt/apps/my-project", required: true }] },
  { id: "git-log", name: "Git Log", description: "Show recent commits", category: "git", command: "cd {directory} && git log --oneline -10", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "📜", params: [{ name: "directory", label: "Directory", placeholder: "/opt/apps/my-project", required: true }] },

  // ── PM2 / Node ──────────────────────────────────────────────────────────
  { id: "pm2-list", name: "PM2 Processes", description: "List all PM2 managed processes", category: "pm2", command: "pm2 list", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin"], icon: "⚡" },
  { id: "pm2-restart-all", name: "PM2 Restart All", description: "Restart all PM2 processes", category: "pm2", command: "pm2 restart all", riskLevel: "medium", requiresConfirmation: true, supportedOS: ["linux", "darwin"], icon: "🔄" },
  { id: "node-version", name: "Node.js Version", description: "Check installed Node.js version", category: "node", command: "node --version && npm --version", riskLevel: "low", requiresConfirmation: false, supportedOS: ["linux", "darwin", "windows"], icon: "🟢" },
];

// ─── Lookup functions ─────────────────────────────────────────────────────

export function getCommandById(id: string): RegisteredCommand | undefined {
  return COMMAND_REGISTRY.find(c => c.id === id);
}

export function searchCommands(query: string): RegisteredCommand[] {
  if (!query) return COMMAND_REGISTRY;
  const q = query.toLowerCase();
  return COMMAND_REGISTRY.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.id.includes(q) ||
    c.description.toLowerCase().includes(q) ||
    c.category.includes(q)
  );
}

export function getCommandsByCategory(category: CommandCategory): RegisteredCommand[] {
  return COMMAND_REGISTRY.filter(c => c.category === category);
}

export function getCategories(): CommandCategory[] {
  return [...new Set(COMMAND_REGISTRY.map(c => c.category))];
}

/**
 * Resolve command with parameters substituted.
 * Returns null if a required param is missing.
 */
export function resolveCommandString(id: string, params: Record<string, string>): string | null {
  const cmd = getCommandById(id);
  if (!cmd) return null;

  let resolved = cmd.command;
  if (cmd.params) {
    for (const p of cmd.params) {
      const value = params[p.name];
      if (p.required && !value) return null;
      if (value) resolved = resolved.replace(`{${p.name}}`, value);
    }
  }
  return resolved;
}
