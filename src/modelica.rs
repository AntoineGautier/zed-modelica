use std::env;
use std::fs;

use zed_extension_api::{self as zed, Result};

const SERVER_PATH: &str = "node_modules/@openmodelica/modelica-language-server/out/server.js";
const PACKAGE_NAME: &str = "@openmodelica/modelica-language-server";
const SERVER_BIN: &str = "modelica-language-server";

struct ModelicaExtension;

impl ModelicaExtension {
    fn server_exists(&self) -> bool {
        fs::metadata(SERVER_PATH).is_ok_and(|stat| stat.is_file())
    }

    /// Installs our own copy of the server via npm if none exists yet.
    ///
    /// Only hits the npm registry when nothing is installed. Once a copy
    /// exists on disk it's reused as-is, without checking for updates: doing
    /// that check on every launch would make server startup hostage to
    /// npm-registry reachability, which is what caused erratic hangs/failures
    /// over remote/SSH connections with slower or unreliable network. To pick
    /// up a newer release, remove the extension's `node_modules` (or
    /// reinstall the extension).
    fn server_script_path(&self, language_server_id: &zed::LanguageServerId) -> Result<String> {
        if self.server_exists() {
            return Ok(SERVER_PATH.to_string());
        }

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );
        let version = zed::npm_package_latest_version(PACKAGE_NAME)?;

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::Downloading,
        );
        zed::npm_install_package(PACKAGE_NAME, &version)?;

        if !self.server_exists() {
            Err(format!(
                "installed package '{PACKAGE_NAME}' did not contain expected path '{SERVER_PATH}'",
            ))?;
        }

        Ok(SERVER_PATH.to_string())
    }
}

impl zed::Extension for ModelicaExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        // Prefer a server already on the user's PATH -- e.g. installed with
        // `npm install -g @openmodelica/modelica-language-server` on the
        // (remote) host. This skips any npm-registry roundtrip at startup
        // entirely, which is the most robust option over SSH/remote
        // connections where network conditions to the registry can be slow
        // or unreliable.
        if let Some(path) = worktree.which(SERVER_BIN) {
            return Ok(zed::Command {
                command: path,
                args: vec!["--stdio".to_string()],
                env: Default::default(),
            });
        }

        let server_path = self.server_script_path(language_server_id)?;
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![
                env::current_dir()
                    .unwrap()
                    .join(&server_path)
                    .to_string_lossy()
                    .to_string(),
                "--stdio".to_string(),
            ],
            env: Default::default(),
        })
    }
}

zed::register_extension!(ModelicaExtension);
