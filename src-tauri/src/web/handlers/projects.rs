use axum::{extract::Extension, Json};
use std::sync::Arc;

use crate::app_error::AppCommandError;
use crate::app_state::AppState;
use crate::commands::projects;
use crate::models::project::*;

pub async fn projects_list(
    Extension(_state): Extension<Arc<AppState>>,
) -> Result<Json<ProjectsConfig>, AppCommandError> {
    let cfg = projects::list_projects_core()?;
    Ok(Json(cfg))
}

pub async fn projects_save(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<SaveProjectParams>,
) -> Result<Json<ProjectsConfig>, AppCommandError> {
    let cfg = projects::save_project_core(&params)?;
    Ok(Json(cfg))
}

pub async fn projects_delete(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<DeleteProjectParams>,
) -> Result<Json<ProjectsConfig>, AppCommandError> {
    let cfg = projects::delete_project_core(&params)?;
    Ok(Json(cfg))
}

pub async fn versions_save(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<SaveVersionParams>,
) -> Result<Json<ProjectsConfig>, AppCommandError> {
    let cfg = projects::save_version_core(&params)?;
    Ok(Json(cfg))
}

pub async fn versions_delete(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<DeleteVersionParams>,
) -> Result<Json<ProjectsConfig>, AppCommandError> {
    let cfg = projects::delete_version_core(&params)?;
    Ok(Json(cfg))
}

pub async fn services_save(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<SaveServiceParams>,
) -> Result<Json<ProjectsConfig>, AppCommandError> {
    let cfg = projects::save_service_core(&params)?;
    Ok(Json(cfg))
}

pub async fn services_delete(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<DeleteServiceParams>,
) -> Result<Json<ProjectsConfig>, AppCommandError> {
    let cfg = projects::delete_service_core(&params)?;
    Ok(Json(cfg))
}

pub async fn global_rules_save(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<SaveGlobalRulesParams>,
) -> Result<Json<ProjectsConfig>, AppCommandError> {
    let cfg = projects::save_global_rules_core(&params)?;
    Ok(Json(cfg))
}

pub async fn workspace_init(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<WorkspaceInitParams>,
) -> Result<Json<WorkspaceInitResult>, AppCommandError> {
    let result = projects::workspace_init_core(&params)?;
    Ok(Json(result))
}

// ── Service Registry ──

pub async fn service_registry_list(
    Extension(_state): Extension<Arc<AppState>>,
) -> Result<Json<Vec<ServiceRegistryEntry>>, AppCommandError> {
    Ok(Json(projects::service_registry_list_core()?))
}

pub async fn service_registry_save(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<ServiceRegistryParams>,
) -> Result<Json<Vec<ServiceRegistryEntry>>, AppCommandError> {
    Ok(Json(projects::service_registry_save_core(&params)?))
}

pub async fn service_registry_delete(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<DeleteServiceRegistryParams>,
) -> Result<Json<Vec<ServiceRegistryEntry>>, AppCommandError> {
    Ok(Json(projects::service_registry_delete_core(&params)?))
}

pub async fn git_remote_branches(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<GitRemoteBranchesParams>,
) -> Result<Json<GitRemoteBranchesResult>, AppCommandError> {
    Ok(Json(projects::git_remote_branches_core(&params)?))
}
