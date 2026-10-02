# Zed Modelica Extension

A [Zed](https://zed.dev/) extension that provides syntax highlighting, language server support, and formatting for the [Modelica](https://modelica.org/) language.

## Language Server

The extension runs [`@openmodelica/modelica-language-server`](https://github.com/OpenModelica/modelica-language-server) over stdio. As of this writing, the server provides hover, go to declaration/definition, and document symbols (outline); it does not yet provide completion, diagnostics, or formatting.

The extension installs the server from npm on first use and checks for a
newer release once per Zed session thereafter.
If the npm registry can't be reached and a copy is already installed, the
extension reuses it rather than failing startup; on a first install, with
nothing on disk yet to fall back to, an unreachable registry does fail
startup.

## Formatter

Formatting uses Zed's built-in Prettier integration together with
[`prettier-plugin-modelica`](https://www.npmjs.com/package/prettier-plugin-modelica),
independently of the language server above.

Unlike `language_servers` in `extension.toml`, an extension cannot enable
Prettier support for its language by default — that switch
(`languages.<name>.prettier.allowed`) is off by default and normally only
turned on from Zed's own core `default.json` (as it does for a handful of
languages, e.g. Astro). Third-party extensions must have users opt in from
their own settings.

**Project settings** (`.zed/settings.json`) or **user settings**
(`~/.config/zed/settings.json`):

```json
{
  "languages": {
    "Modelica": {
      "prettier": {
        "allowed": true,
        "plugins": ["prettier-plugin-modelica"]
      }
    }
  }
}
```

Zed installs `prettier-plugin-modelica` from npm on first use. Once enabled,
run **editor: format** (or format on save) to format a `.mo` file.

### Loading external Modelica libraries

To make the language server aware of libraries outside your workspace (such as
the Modelica Standard Library), add their root directories to
`initialization_options.libraries` under the `modelica-language-server` entry
in Zed's `lsp` settings.

**Project settings** (`.zed/settings.json`):

```json
{
  "lsp": {
    "modelica-language-server": {
      "initialization_options": {
        "libraries": ["/path/to/Modelica 4.0.0"]
      }
    }
  }
}
```

**User settings** (`~/.config/zed/settings.json`): same shape, applied to all projects.

Typical paths:

| Platform | Default OpenModelica library location |
|----------|----------------------------------------|
| Linux    | `~/.openmodelica/libraries/`            |
| Windows  | `%APPDATA%\OpenModelica\libraries\`     |
| macOS    | `~/.openmodelica/libraries/`            |

The server loads all configured libraries at startup. Changes take effect
after restarting the language server (**editor: restart language server**).

## Rainbow Brackets

`languages/modelica/brackets.scm` defines the `()`, `[]` and `{}` pairs used
for bracket matching and colorization. Colorization is off by default in Zed;
enable it in your settings:

```json
{
  "languages": {
    "Modelica": {
      "colorize_brackets": true
    }
  }
}
```

String quotes are deliberately not listed in `brackets.scm`: the grammar lexes
a whole string as a single `STRING` token, so `"` is not a node type and a
`("\"" @open "\"" @close)` pattern fails to compile. Zed then fails to load
the whole language, which disables syntax highlighting too.

## Grammar

`grammars/modelica` is not tracked in this repo (see `.gitignore`). It's a clone Zed creates automatically at extension install/rebuild, of the repository specified in `extension.toml`'s `[grammars.modelica]` section, checked out at the pinned `rev`.

## Licensing

This extension's own code is MIT-licensed (see `LICENSE`). At install/build
and runtime it fetches two separate components from the Open Source Modelica
Consortium (OSMC), each dual-licensed under AGPL-3.0-only or OSMC-PL-1.8:

- [`tree-sitter-modelica`](https://github.com/OpenModelica/tree-sitter-modelica) (grammar, cloned per `extension.toml`'s pinned `rev`)
- [`@openmodelica/modelica-language-server`](https://github.com/OpenModelica/modelica-language-server) (language server, npm-installed and run as a separate process over stdio)

Neither is vendored in this repository; they are pulled from their own
upstream sources under their own terms and are not relicensed by this
extension.
