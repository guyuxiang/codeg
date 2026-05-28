package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"gopkg.in/yaml.v3"
)

// ── YAML Config Types ──

type Config struct {
	Rules    []string           `yaml:"rules"`
	Projects map[string]Project `yaml:"projects"`
}
type Project struct {
	Description string             `yaml:"description"`
	Rules       []string           `yaml:"rules"`
	Versions    map[string]Version `yaml:"versions"`
}
type Version struct {
	Description string    `yaml:"description"`
	Services    []Service `yaml:"services"`
}
type Service struct {
	Name        string `yaml:"name"`
	URL         string `yaml:"url"`
	Branch      string `yaml:"branch"`
	Description string `yaml:"description"`
}

// ── Path resolving ──

var configPath string
var dataRoot string

func init() {
	// Unified config: always ~/.codeg/projects.yaml (shared with Codeg)
	if d := os.Getenv("CODEG_HOME"); d != "" {
		configPath = filepath.Join(d, "projects.yaml")
	} else if home, err := os.UserHomeDir(); err == nil {
		configPath = filepath.Join(home, ".codeg", "projects.yaml")
	} else {
		configPath = "./projects.yaml"
	}
	// Ensure the file exists (create empty template if not)
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		os.MkdirAll(filepath.Dir(configPath), 0755)
		os.WriteFile(configPath, []byte("rules: []\nprojects: {}\n"), 0644)
	}

	// Data root: $WORKSPACE_DATA or ~/workspace
	if d := os.Getenv("WORKSPACE_DATA"); d != "" {
		dataRoot = d
	} else if home, err := os.UserHomeDir(); err == nil {
		dataRoot = filepath.Join(home, "workspace")
	} else {
		dataRoot = "./workspace"
	}
}

func loadConfig() (*Config, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func projVer(project, version string) string {
	return project + "_" + version
}

func sessionDir(sessionID string) string {
	return filepath.Join(dataRoot, "sessions", sessionID)
}

func genSessionID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return fmt.Sprintf("%s_%s", time.Now().Format("01021504"), hex.EncodeToString(b))
}

// detectProjectVersion scans CWD and workspace dirs for "{project}_{version}" pattern.
// Returns nil if not detected.
type pv struct{ project, version string }

func detectProjectVersion() *pv {
	cwd, _ := os.Getwd()
	// Walk up from CWD looking for base/{project}_{version}
	for dir := cwd; dir != "" && dir != "/"; dir = filepath.Dir(dir) {
		parent := filepath.Dir(dir)
		if filepath.Base(parent) == "base" {
			name := filepath.Base(dir)
			if idx := strings.LastIndex(name, "_"); idx > 0 && idx < len(name)-1 {
				return &pv{name[:idx], name[idx+1:]}
			}
		}
	}
	// Fallback: list base dir
	baseDir := filepath.Join(dataRoot, "base")
	if entries, err := os.ReadDir(baseDir); err == nil {
		for _, e := range entries {
			if e.IsDir() && strings.Contains(e.Name(), "_") {
				name := e.Name()
				if idx := strings.LastIndex(name, "_"); idx > 0 && idx < len(name)-1 {
					return &pv{name[:idx], name[idx+1:]}
				}
			}
		}
	}
	return nil
}

// ── Git operations ──

func git(args ...string) (string, bool) {
	cmd := exec.Command("git", args...)
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err == nil
}

// ensureBare ensures a bare clone exists; fetches latest if already there.
// Returns a log line.
func ensureBare(barePath, url string) string {
	if _, err := os.Stat(filepath.Join(barePath, "HEAD")); err == nil {
		// Exists, fetch latest
		out, ok := git("-C", barePath, "fetch", "origin", "+refs/heads/*:refs/heads/*")
		if !ok {
			return fmt.Sprintf("  ✗ fetch failed: %s", out)
		}
		return "  ↻ bare repo updated"
	}
	// First time: clone --bare
	out, ok := git("clone", "--bare", url, barePath)
	if !ok {
		return fmt.Sprintf("  ✗ bare clone failed: %s", out)
	}
	return "  ⬇ bare repo created"
}

// addWorktree creates a worktree from the bare repo for a given branch+feature.
// Bare repos store remote heads at refs/heads/*, not refs/remotes/origin/*.
// We try refs/heads/branch first, then origin/branch (mirror fallback).
func addWorktree(barePath, worktreePath, baseBranch, featureBranch string) string {
	if _, err := os.Stat(worktreePath); err == nil {
		return "  ⚠ worktree already exists, skip"
	}

	startPoint := "refs/heads/" + baseBranch
	_, ok := git("-C", barePath, "rev-parse", "--verify", startPoint)
	if !ok {
		// Fallback: try origin/ prefix (for --mirror repos or non-bare)
		startPoint = "origin/" + baseBranch
		_, ok = git("-C", barePath, "rev-parse", "--verify", startPoint)
		if !ok {
			return fmt.Sprintf("  ✗ branch %q not found in bare repo (tried refs/heads/ and origin/)", baseBranch)
		}
	}

	out, ok := git("-C", barePath, "worktree", "add", worktreePath, "-b", featureBranch, startPoint)
	if !ok {
		return fmt.Sprintf("  ✗ worktree add failed: %s", out)
	}
	return fmt.Sprintf("  ✓ worktree ready (branch: %s)", featureBranch)
}

// ── MCP Tool input types ──

type EmptyArg struct{}
type ProjectArg struct{ Project string `json:"project"` }
type SessionArg struct {
	Project   string `json:"project"`
	Version   string `json:"version"`
	Feature   string `json:"feature,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
}
type CleanupArg struct {
	SessionID string `json:"sessionId"`
}
type ServiceInfoArg struct {
	Project string `json:"project"`
	Version string `json:"version"`
	Service string `json:"service"`
}

// ── Context builder ──

func buildContext(cfg *Config, project, version, sid, feature string, results []string) string {
	proj := cfg.Projects[project]
	ver := proj.Versions[version]
	dir := sessionDir(sid)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# %s / %s\n\n", project, version))
	sb.WriteString(fmt.Sprintf("> %s · %s\n", proj.Description, ver.Description))
	sb.WriteString(fmt.Sprintf("> Session: `%s` · Feature: `%s` · %s\n\n", sid, feature, time.Now().Format("15:04:05")))

	sb.WriteString("## Sync\n\n")
	for _, r := range results {
		sb.WriteString(r + "\n")
	}

	sb.WriteString(fmt.Sprintf("\n## Working Directory\n\n`%s/`\n\n", dir))

	sb.WriteString("## Services\n\n| Service | Description | Branch → Feature |\n")
	sb.WriteString("|------|------|------|\n")
	for _, svc := range ver.Services {
		sb.WriteString(fmt.Sprintf("| %s | %s | %s → %s |\n", svc.Name, svc.Description, svc.Branch, feature))
	}

	if len(cfg.Rules) > 0 {
		sb.WriteString("\n## Global Rules\n\n")
		for _, r := range cfg.Rules {
			sb.WriteString(fmt.Sprintf("- %s\n", r))
		}
	}
	if len(proj.Rules) > 0 {
		sb.WriteString("\n## Project Rules\n\n")
		for _, r := range proj.Rules {
			sb.WriteString(fmt.Sprintf("- %s\n", r))
		}
	}

	sb.WriteString("\n## Next Steps\n\n")
	sb.WriteString("1. 告诉我你的开发需求\n")
	sb.WriteString("2. 我会分析需求，定位涉及的服务\n")
	sb.WriteString(fmt.Sprintf("3. 在 `%s/` 下对应服务目录改代码\n", dir))
	sb.WriteString("4. 每个服务在自己的 feature 分支上提交\n")

	return sb.String()
}

// ── Main ──

func main() {
	ctx := context.Background()
	srv := mcp.NewServer(&mcp.Implementation{Name: "workspace-mcp", Version: "2.0.0"}, nil)

	// ── list_projects ──
	srv.AddTool(&mcp.Tool{
		Name: "list_projects", Description: "列出所有可用的项目及其描述和版本",
		InputSchema: json.RawMessage(`{"type":"object","properties":{}}`),
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		cfg, err := loadConfig()
		if err != nil {
			return textResult("Failed to load config: " + err.Error()), nil
		}
		var sb strings.Builder
		sb.WriteString("Available projects:\n\n")
		i := 1
		for name, proj := range cfg.Projects {
			sb.WriteString(fmt.Sprintf("%d. %s — %s\n", i, name, proj.Description))
			for vname, ver := range proj.Versions {
				sb.WriteString(fmt.Sprintf("   version: %s (%s, %d services)\n", vname, ver.Description, len(ver.Services)))
			}
			sb.WriteString("\n")
			i++
		}
		return textResult(sb.String()), nil
	})

	// ── list_versions ──
	srv.AddTool(&mcp.Tool{
		Name: "list_versions", Description: "列出指定项目的所有版本",
		InputSchema: json.RawMessage(`{"type":"object","properties":{"project":{"type":"string"}},"required":["project"]}`),
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var args ProjectArg
		json.Unmarshal(req.Params.Arguments, &args)
		cfg, _ := loadConfig()
		proj, ok := cfg.Projects[args.Project]
		if !ok {
			return textResult(fmt.Sprintf("Project %q not found", args.Project)), nil
		}
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("Versions for %q:\n\n", args.Project))
		for vname, ver := range proj.Versions {
			sb.WriteString(fmt.Sprintf("- %s — %s (%d services)\n", vname, ver.Description, len(ver.Services)))
		}
		return textResult(sb.String()), nil
	})

	// ── init_session ──
	srv.AddTool(&mcp.Tool{
		Name:        "init_session",
	Description: "【必须首先调用】收到用户第一条消息后立即调用此工具，自动引导选择项目和版本。无需参数。然后同步 bare 仓库、创建 git worktree、返回服务地图。",
	InputSchema: json.RawMessage(`{
      "type":"object",
      "properties":{
        "project":{"type":"string","description":"(可选) 项目名称，不填则列出所有项目"},
        "version":{"type":"string","description":"(可选) 版本名称，不填则列出项目的所有版本"},
        "feature":{"type":"string","description":"(可选) feature 分支名，如 feat/refund"}
      }
    }`),
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var args SessionArg
		json.Unmarshal(req.Params.Arguments, &args)

		cfg, err := loadConfig()
		if err != nil {
			return textResult("Failed to load config: " + err.Error()), nil
		}

		// No project specified → auto-detect from workspace directory
		if args.Project == "" {
			if pv := detectProjectVersion(); pv != nil {
				if _, ok := cfg.Projects[pv.project]; ok {
					if _, ok := cfg.Projects[pv.project].Versions[pv.version]; ok {
						args.Project = pv.project
						args.Version = pv.version
					}
				}
			}
		}
		if args.Project == "" {
			var sb strings.Builder
			sb.WriteString("**请选择一个项目：**\n\n")
			i := 1
			for name, proj := range cfg.Projects {
				sb.WriteString(fmt.Sprintf("%d. **%s** — %s\n", i, name, proj.Description))
				for vname, ver := range proj.Versions {
					sb.WriteString(fmt.Sprintf("   - %s (%s, %d services)\n", vname, ver.Description, len(ver.Services)))
				}
				sb.WriteString("\n")
				i++
			}
			sb.WriteString("请回复项目名称和版本，例如：`project: eco-platform, version: develop`")
			return textResult(sb.String()), nil
		}

		// Project specified but no version → list versions
		proj, ok := cfg.Projects[args.Project]
		if !ok {
			return textResult(fmt.Sprintf("项目 %q 不存在。可用：%s", args.Project, projectNames(cfg))), nil
		}
		if args.Version == "" {
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("**项目 %q 的可用版本：**\n\n", args.Project))
			for vname, ver := range proj.Versions {
				sb.WriteString(fmt.Sprintf("- **%s** — %s (%d services)\n", vname, ver.Description, len(ver.Services)))
			}
			sb.WriteString("\n请回复版本名称")
			return textResult(sb.String()), nil
		}

		ver, ok := proj.Versions[args.Version]
		if !ok {
			return textResult(fmt.Sprintf("版本 %q 不存在。可用：%s", args.Version, versionNames(proj))), nil
		}

		sid := args.SessionID
		if sid == "" {
			sid = genSessionID()
		}
		feature := args.Feature
		if feature == "" {
			feature = fmt.Sprintf("feat/session-%s", sid)
		}

		baseRoot := filepath.Join(dataRoot, "base", projVer(args.Project, args.Version))
		sessDir := sessionDir(sid)
		os.MkdirAll(baseRoot, 0755)
		os.MkdirAll(sessDir, 0755)

		var results []string
		results = append(results, fmt.Sprintf("Session: %s", sid))
		results = append(results, fmt.Sprintf("Feature: %s", feature))
		results = append(results, "---")

		// Phase 1: ensure bare repos
		for _, svc := range ver.Services {
			barePath := filepath.Join(baseRoot, svc.Name+".git")
			results = append(results, fmt.Sprintf("[%s] %s", svc.Name, ensureBare(barePath, svc.URL)))
		}

		// Phase 2: create worktrees
		results = append(results, "---")
		for _, svc := range ver.Services {
			barePath := filepath.Join(baseRoot, svc.Name+".git")
			wtPath := filepath.Join(sessDir, svc.Name)
			results = append(results, fmt.Sprintf("[%s] %s", svc.Name, addWorktree(barePath, wtPath, svc.Branch, feature)))
		}

		// Write marker so Codeg replaces base dir with session dir
		markerPath := filepath.Join(filepath.Dir(configPath), "auto_open_path")
		os.WriteFile(markerPath, []byte(sessDir), 0644)

		return textResult(buildContext(cfg, args.Project, args.Version, sid, feature, results)), nil
	})

	// ── cleanup_session ──
	srv.AddTool(&mcp.Tool{
		Name: "cleanup_session", Description: "清理工作会话：删除 session 目录下的 worktree，并清理 bare 库中的关联分支。开发完成并提交 MR 后使用。",
		InputSchema: json.RawMessage(`{
      "type":"object",
      "properties":{
        "sessionId":{"type":"string","description":"要清理的 session ID"}
      },
      "required":["sessionId"]
    }`),
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var args CleanupArg
		json.Unmarshal(req.Params.Arguments, &args)

		sessDir := sessionDir(args.SessionID)
		var results []string

		// List worktrees inside session dir
		entries, err := os.ReadDir(sessDir)
		if err != nil {
			return textResult(fmt.Sprintf("Session %q not found at %s", args.SessionID, sessDir)), nil
		}

		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			wtDir := filepath.Join(sessDir, e.Name())
			// Remove the worktree
			out, ok := git("-C", wtDir, "branch", "--show-current")
			branch := out
			if !ok {
				branch = "unknown"
			}

			// Find the git dir (worktree has .git as a file)
			gitDirFile := filepath.Join(wtDir, ".git")
			if data, err := os.ReadFile(gitDirFile); err == nil {
				line := string(data)
				if strings.HasPrefix(line, "gitdir: ") {
					actualGitDir := strings.TrimPrefix(line, "gitdir: ")
					actualGitDir = strings.TrimSpace(actualGitDir)
					// Remove worktree from the bare repo
					git("-C", wtDir, "worktree", "remove", "-f", wtDir)
					// Try to delete the branch from bare repo if it's fully merged
					if branch != "" && branch != "unknown" {
						gitDir := filepath.Dir(actualGitDir)
						git("--git-dir", gitDir, "branch", "-d", branch)
					}
					results = append(results, fmt.Sprintf("  ✓ %s cleaned (branch: %s)", e.Name(), branch))
				}
			}
			// Force remove worktree directory
			os.RemoveAll(wtDir)
		}

		// Remove session directory
		os.RemoveAll(sessDir)
		results = append(results, fmt.Sprintf("\nSession %q cleaned up.", args.SessionID))

		return textResult(strings.Join(results, "\n")), nil
	})

	// ── list_services ──
	srv.AddTool(&mcp.Tool{
		Name: "list_services", Description: "列出指定项目+版本下的所有服务",
		InputSchema: json.RawMessage(`{"type":"object","properties":{"project":{"type":"string"},"version":{"type":"string"}},"required":["project","version"]}`),
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var args SessionArg
		json.Unmarshal(req.Params.Arguments, &args)
		cfg, _ := loadConfig()
		ver, ok := cfg.Projects[args.Project].Versions[args.Version]
		if !ok {
			return textResult("Project or version not found"), nil
		}
		var sb strings.Builder
		for _, svc := range ver.Services {
			sb.WriteString(fmt.Sprintf("%s — %s branch:%s\n", svc.Name, svc.Description, svc.Branch))
		}
		return textResult(sb.String()), nil
	})

	// ── service_info ──
	srv.AddTool(&mcp.Tool{
		Name: "service_info", Description: "查看某个服务的详细信息",
		InputSchema: json.RawMessage(`{"type":"object","properties":{"project":{"type":"string"},"version":{"type":"string"},"service":{"type":"string"}},"required":["project","version","service"]}`),
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var args ServiceInfoArg
		json.Unmarshal(req.Params.Arguments, &args)
		cfg, _ := loadConfig()
		for _, svc := range cfg.Projects[args.Project].Versions[args.Version].Services {
			if svc.Name == args.Service {
				text := fmt.Sprintf("Name: %s\nDescription: %s\nRepo: %s\nBranch: %s\n",
					svc.Name, svc.Description, svc.URL, svc.Branch)
				return textResult(text), nil
			}
		}
		return textResult("Service not found"), nil
	})

	// ── save_service ──
	srv.AddTool(&mcp.Tool{
		Name: "save_service", Description: "在 projects.yaml 中新增或更新一个服务配置",
		InputSchema: json.RawMessage(`{
      "type":"object",
      "properties":{
        "project":{"type":"string","description":"项目名称"},
        "version":{"type":"string","description":"版本名称"},
        "name":{"type":"string","description":"服务名称"},
        "url":{"type":"string","description":"GitLab 仓库地址"},
        "branch":{"type":"string","description":"默认分支"},
        "description":{"type":"string","description":"服务职责描述"}
      },
      "required":["project","version","name","url","branch","description"]
    }`),
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var args struct {
			Project     string `json:"project"`
			Version     string `json:"version"`
			Name        string `json:"name"`
			URL         string `json:"url"`
			Branch      string `json:"branch"`
			Description string `json:"description"`
		}
		json.Unmarshal(req.Params.Arguments, &args)

		cfg, _ := loadConfig()
		proj, ok := cfg.Projects[args.Project]
		if !ok {
			proj = Project{Versions: make(map[string]Version)}
			cfg.Projects[args.Project] = proj
		}
		ver, ok := proj.Versions[args.Version]
		if !ok {
			ver = Version{}
		}

		// Upsert service
		found := false
		for i, svc := range ver.Services {
			if svc.Name == args.Name {
				ver.Services[i] = Service{Name: args.Name, URL: args.URL, Branch: args.Branch, Description: args.Description}
				found = true
				break
			}
		}
		if !found {
			ver.Services = append(ver.Services, Service{Name: args.Name, URL: args.URL, Branch: args.Branch, Description: args.Description})
		}

		proj.Versions[args.Version] = ver
		cfg.Projects[args.Project] = proj

		if err := saveConfig(cfg); err != nil {
			return textResult("Failed to save: " + err.Error()), nil
		}
		return textResult(fmt.Sprintf("Service %q saved to project %q version %q.", args.Name, args.Project, args.Version)), nil
	})

	// ── commit_session ──
	srv.AddTool(&mcp.Tool{
		Name: "commit_session", Description: "提交工作会话所有服务的代码：执行 git add -A, git commit, git push。需要先在 init_session 创建的工作区中完成代码修改后调用。",
		InputSchema: json.RawMessage(`{
      "type":"object",
      "properties":{
        "sessionId":{"type":"string","description":"会话 ID（init_session 返回的）"},
        "message":{"type":"string","description":"commit 消息"}
      },
      "required":["sessionId","message"]
    }`),
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var args struct {
			SessionID string `json:"sessionId"`
			Message   string `json:"message"`
		}
		json.Unmarshal(req.Params.Arguments, &args)

		sessDir := sessionDir(args.SessionID)
		var results []string

		entries, _ := os.ReadDir(sessDir)
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			svcDir := filepath.Join(sessDir, e.Name())

			// git add -A
			out, ok := git("-C", svcDir, "add", "-A")
			if !ok {
				results = append(results, fmt.Sprintf("  ✗ %s add failed: %s", e.Name(), out))
				continue
			}

			// git commit
			out, ok = git("-C", svcDir, "commit", "-m", args.Message)
			if ok {
				results = append(results, fmt.Sprintf("  ✓ %s committed: %s", e.Name(), out))
			} else if strings.Contains(out, "nothing to commit") {
				results = append(results, fmt.Sprintf("  - %s (no changes)", e.Name()))
			} else {
				results = append(results, fmt.Sprintf("  ✗ %s commit failed: %s", e.Name(), out))
				continue
			}

			// git push
			out, ok = git("-C", svcDir, "push", "origin", "HEAD")
			if ok {
				results = append(results, fmt.Sprintf("    ↳ pushed: %s", out))
			} else {
				results = append(results, fmt.Sprintf("    ↳ push failed: %s", out))
			}
		}

		return textResult(fmt.Sprintf("Commit results for session %q:\n\n%s", args.SessionID, strings.Join(results, "\n"))), nil
	})

	log.Printf("workspace-mcp v2.0.0 ready (config=%s, data=%s)", configPath, dataRoot)
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func textResult(text string) *mcp.CallToolResult {
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}
}
func saveConfig(cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, data, 0644)
}
func projectNames(cfg *Config) string {
	var ns []string
	for n := range cfg.Projects {
		ns = append(ns, n)
	}
	return strings.Join(ns, ", ")
}
func versionNames(p Project) string {
	var ns []string
	for n := range p.Versions {
		ns = append(ns, n)
	}
	return strings.Join(ns, ", ")
}
