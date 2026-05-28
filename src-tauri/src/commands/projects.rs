use std::collections::HashMap;
use std::fs;
use std::io;

use crate::app_error::{AppCommandError, AppErrorCode};
use crate::models::project::*;
use crate::paths;

fn read_config() -> Result<ProjectsConfig, AppCommandError> {
    let path = paths::codeg_projects_path();
    match fs::read_to_string(&path) {
        Ok(raw) => {
            let cfg = serde_yaml::from_str(&raw).map_err(|e| AppCommandError {
                code: AppErrorCode::InvalidInput,
                message: format!("Failed to parse projects.yaml: {e}"),
                detail: None,
                i18n_key: None,
                i18n_params: None,
            })?;
            Ok(cfg)
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            // Return empty config for new installs.
            let cfg = ProjectsConfig {
                rules: vec![],
                projects: HashMap::new(),
            };
            Ok(cfg)
        }
        Err(e) => Err(AppCommandError {
            code: AppErrorCode::IoError,
            message: format!("Failed to read projects.yaml: {e}"),
            detail: None,
            i18n_key: None,
            i18n_params: None,
        }),
    }
}

fn write_config(cfg: &ProjectsConfig) -> Result<(), AppCommandError> {
    let path = paths::codeg_projects_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppCommandError {
            code: AppErrorCode::IoError,
            message: format!("Failed to create config dir: {e}"),
            detail: None,
            i18n_key: None,
            i18n_params: None,
        })?;
    }
    let raw = serde_yaml::to_string(cfg).map_err(|e| AppCommandError {
        code: AppErrorCode::InvalidInput,
        message: format!("Failed to serialize projects.yaml: {e}"),
        detail: None,
        i18n_key: None,
        i18n_params: None,
    })?;
    fs::write(&path, raw).map_err(|e| AppCommandError {
        code: AppErrorCode::IoError,
        message: format!("Failed to write projects.yaml: {e}"),
        detail: None,
        i18n_key: None,
        i18n_params: None,
    })?;
    Ok(())
}

// ── Projects ──

pub fn list_projects_core() -> Result<ProjectsConfig, AppCommandError> {
    read_config()
}

pub fn save_project_core(params: &SaveProjectParams) -> Result<ProjectsConfig, AppCommandError> {
    let mut cfg = read_config()?;
    let proj = cfg
        .projects
        .entry(params.name.clone())
        .or_insert_with(|| ProjectInfo {
            description: String::new(),
            rules: vec![],
            versions: HashMap::new(),
        });
    proj.description = params.description.clone();
    proj.rules = params.rules.clone();
    write_config(&cfg)?;
    Ok(cfg)
}

pub fn delete_project_core(params: &DeleteProjectParams) -> Result<ProjectsConfig, AppCommandError> {
    let mut cfg = read_config()?;
    cfg.projects.remove(&params.name);
    write_config(&cfg)?;
    Ok(cfg)
}

// ── Versions ──

pub fn save_version_core(params: &SaveVersionParams) -> Result<ProjectsConfig, AppCommandError> {
    let mut cfg = read_config()?;
    let proj = cfg
        .projects
        .get_mut(&params.project)
        .ok_or_else(|| AppCommandError {
            code: AppErrorCode::NotFound,
            message: format!("Project {} not found", params.project),
            detail: None,
            i18n_key: None,
            i18n_params: None,
        })?;
    let ver = proj
        .versions
        .entry(params.name.clone())
        .or_insert_with(|| VersionInfo {
            description: String::new(),
            services: vec![],
        });
    ver.description = params.description.clone();
    write_config(&cfg)?;
    Ok(cfg)
}

pub fn delete_version_core(params: &DeleteVersionParams) -> Result<ProjectsConfig, AppCommandError> {
    let mut cfg = read_config()?;
    if let Some(proj) = cfg.projects.get_mut(&params.project) {
        proj.versions.remove(&params.name);
    }
    write_config(&cfg)?;
    Ok(cfg)
}

// ── Services ──

pub fn save_service_core(params: &SaveServiceParams) -> Result<ProjectsConfig, AppCommandError> {
    let mut cfg = read_config()?;
    let proj = cfg
        .projects
        .get_mut(&params.project)
        .ok_or_else(|| AppCommandError {
            code: AppErrorCode::NotFound,
            message: format!("Project {} not found", params.project),
            detail: None,
            i18n_key: None,
            i18n_params: None,
        })?;
    let ver = proj
        .versions
        .get_mut(&params.version)
        .ok_or_else(|| AppCommandError {
            code: AppErrorCode::NotFound,
            message: format!("Version {} not found", params.version),
            detail: None,
            i18n_key: None,
            i18n_params: None,
        })?;

    // Upsert: remove old entry with same name, then push new.
    ver.services.retain(|s| s.name != params.name);
    ver.services.push(ServiceInfo {
        name: params.name.clone(),
        url: params.url.clone(),
        branch: params.branch.clone(),
        description: params.description.clone(),
    });
    write_config(&cfg)?;
    Ok(cfg)
}

pub fn delete_service_core(params: &DeleteServiceParams) -> Result<ProjectsConfig, AppCommandError> {
    let mut cfg = read_config()?;
    if let Some(proj) = cfg.projects.get_mut(&params.project) {
        if let Some(ver) = proj.versions.get_mut(&params.version) {
            ver.services.retain(|s| s.name != params.name);
        }
    }
    write_config(&cfg)?;
    Ok(cfg)
}

// ── Global Rules ──

pub fn save_global_rules_core(params: &SaveGlobalRulesParams) -> Result<ProjectsConfig, AppCommandError> {
    let mut cfg = read_config()?;
    cfg.rules = params.rules.clone();
    write_config(&cfg)?;
    Ok(cfg)
}

// ── Service Registry (separate services.yaml) ──

fn services_yaml_path() -> std::path::PathBuf {
    crate::paths::codeg_home_dir().join("services.yaml")
}

fn read_service_registry() -> Result<Vec<ServiceRegistryEntry>, AppCommandError> {
    let path = services_yaml_path();
    match std::fs::read_to_string(&path) {
        Ok(raw) => serde_yaml::from_str(&raw).map_err(|e| AppCommandError {
            code: AppErrorCode::InvalidInput,
            message: format!("Failed to parse services.yaml: {e}"),
            detail: None, i18n_key: None, i18n_params: None,
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(e) => Err(AppCommandError {
            code: AppErrorCode::IoError,
            message: format!("Failed to read services.yaml: {e}"),
            detail: None, i18n_key: None, i18n_params: None,
        }),
    }
}

fn write_service_registry(services: &[ServiceRegistryEntry]) -> Result<(), AppCommandError> {
    let path = services_yaml_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AppCommandError {
            code: AppErrorCode::IoError, message: format!("mkdir: {e}"),
            detail: None, i18n_key: None, i18n_params: None,
        })?;
    }
    let raw = serde_yaml::to_string(services).map_err(|e| AppCommandError {
        code: AppErrorCode::InvalidInput,
        message: format!("Failed to serialize: {e}"),
        detail: None, i18n_key: None, i18n_params: None,
    })?;
    std::fs::write(&path, raw).map_err(|e| AppCommandError {
        code: AppErrorCode::IoError, message: format!("Failed to write: {e}"),
        detail: None, i18n_key: None, i18n_params: None,
    })?;
    Ok(())
}

pub fn service_registry_list_core() -> Result<Vec<ServiceRegistryEntry>, AppCommandError> {
    read_service_registry()
}

pub fn service_registry_save_core(params: &ServiceRegistryParams) -> Result<Vec<ServiceRegistryEntry>, AppCommandError> {
    let mut services = read_service_registry()?;
    if let Some(svc) = services.iter_mut().find(|s| s.name == params.name) {
        svc.url = params.url.clone();
        svc.description = params.description.clone();
    } else {
        services.push(ServiceRegistryEntry {
            name: params.name.clone(),
            url: params.url.clone(),
            description: params.description.clone(),
        });
    }
    write_service_registry(&services)?;
    Ok(services)
}

pub fn service_registry_delete_core(params: &DeleteServiceRegistryParams) -> Result<Vec<ServiceRegistryEntry>, AppCommandError> {
    let mut services = read_service_registry()?;
    services.retain(|s| s.name != params.name);
    write_service_registry(&services)?;
    Ok(services)
}

// ── Git Remote Branches ──

pub fn git_remote_branches_core(params: &GitRemoteBranchesParams) -> Result<GitRemoteBranchesResult, AppCommandError> {
    if params.url.is_empty() {
        return Ok(GitRemoteBranchesResult { branches: vec![] });
    }
    let output = Command::new("git")
        .args(["ls-remote", "--heads", &params.url])
        .output()
        .map_err(|e| AppCommandError {
            code: AppErrorCode::IoError,
            message: format!("git ls-remote failed: {e}"),
            detail: None, i18n_key: None, i18n_params: None,
        })?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let branches: Vec<String> = stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                parts[1].strip_prefix("refs/heads/").map(|b| b.to_string())
            } else {
                None
            }
        })
        .collect();
    Ok(GitRemoteBranchesResult { branches })
}

// ── Workspace Init (bare + worktree, same as MCP) ──

use std::process::Command;

fn git_ok(args: &[&str]) -> Result<String, String> {
    match Command::new("git").args(args).output() {
        Ok(out) if out.status.success() => Ok(String::from_utf8_lossy(&out.stdout).trim().to_string()),
        Ok(out) => Err(String::from_utf8_lossy(&out.stderr).trim().to_string()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn workspace_init_core(params: &WorkspaceInitParams) -> Result<WorkspaceInitResult, AppCommandError> {
    let cfg = read_config()?;
    let proj = cfg.projects.get(&params.project).ok_or_else(|| AppCommandError {
        code: AppErrorCode::NotFound,
        message: format!("Project {} not found", params.project),
        detail: None, i18n_key: None, i18n_params: None,
    })?;
    let ver = proj.versions.get(&params.version).ok_or_else(|| AppCommandError {
        code: AppErrorCode::NotFound,
        message: format!("Version {} not found", params.version),
        detail: None, i18n_key: None, i18n_params: None,
    })?;

    let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let pv = format!("{}_{}", params.project, params.version);
    let base_root = home.join("workspace").join("base").join(&pv);
    std::fs::create_dir_all(&base_root).map_err(|e| AppCommandError {
        code: AppErrorCode::IoError, message: format!("mkdir base: {e}"),
        detail: None, i18n_key: None, i18n_params: None,
    })?;

    let mut results: Vec<InitServiceResult> = vec![];

    // Phase 1: bare repos
    for svc in &ver.services {
        let bare = base_root.join(format!("{}.git", svc.name));
        let bare_s = bare.to_string_lossy().to_string();
        if bare.join("HEAD").exists() {
            match git_ok(&["-C", &bare_s, "fetch", "origin", "+refs/heads/*:refs/heads/*"]) {
                Ok(_) => results.push(InitServiceResult { service: format!("[bare] {}", svc.name), status: "updated".into() }),
                Err(e) => results.push(InitServiceResult { service: format!("[bare] {}", svc.name), status: format!("fetch failed: {e}") }),
            }
        } else {
            match git_ok(&["clone", "--bare", &svc.url, &bare_s]) {
                Ok(_) => results.push(InitServiceResult { service: format!("[bare] {}", svc.name), status: "created".into() }),
                Err(e) => results.push(InitServiceResult { service: format!("[bare] {}", svc.name), status: format!("clone failed: {e}") }),
            }
        }
    }

    let ok = results.iter().filter(|r| r.status == "created" || r.status == "updated").count();
    let fail = results.len() - ok;

    Ok(WorkspaceInitResult {
        session_id: String::new(),
        workspace_dir: base_root.to_string_lossy().to_string(),
        cloned: ok as u32,
        updated: 0,
        failed: fail as u32,
        total: ver.services.len() as u32,
        services: results,
    })
}
