# workspace-mcp

MCP server for managing multi-project, multi-version microservice workspaces.

## Install

```bash
# Requires Go >= 1.22
bash install.sh
```

Or specify install path:

```bash
bash install.sh /opt/bin
```

## Config

Edit `~/.workspace-mcp/projects.yaml`:

```yaml
projects:
  my-project:
    description: My Project
    versions:
      main:
        description: Production
        services:
          - name: my-service
            url: git@gitlab.com:my/repo.git
            branch: main
            description: What this service does
```

## Codeg Setup

Settings → MCP → Add:

| Field | Value |
|-------|-------|
| Server ID | `workspace` |
| Config (JSON) | `{"type":"stdio","command":"/usr/local/bin/workspace-mcp","args":[]}` |

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects with versions |
| `list_versions` | List versions of a project |
| `init_session` | Sync code + return service map and rules |
| `list_services` | List services in a project/version |
| `service_info` | Get details of a specific service |

## Usage Flow

```
/init → select project → select version → sync → AI works
```
