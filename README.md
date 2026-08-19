# Zed Modelica Extension

A [Zed](https://zed.dev/) extension that provides syntax highlighting, language server support, and formatting for the [Modelica](https://modelica.org/) language.

## Language Server

On first use, the extension installs [`@openmodelica/modelica-language-server`](https://github.com/OpenModelica/modelica-language-server) from npm and runs it over stdio. As of this writing, the server provides hover, go to declaration/definition, and document symbols (outline); it does not yet provide completion, diagnostics, or formatting.

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
after restarting the language server (**zed: restart language server**).

## Grammar

`grammars/modelica` is not tracked in this repo (see `.gitignore`). It's a clone Zed creates automatically at extension install/rebuild, of the repository specified in `extension.toml`'s `[grammars.modelica]` section, checked out at the pinned `rev`.

## Known Issues

### `brackets.scm` breaks highlighting

Including the file `languages/modelica/brackets.scm` breaks syntax highlighting.

**Root cause (?)**: The WASM-compiled tree-sitter parser outputs **only named nodes**, while native Node bindings output **both named and unnamed nodes**.
Since bracket tokens (`(`, `)`, `{`, `}`, `[`, `]`) are anonymous/unnamed nodes in tree-sitter, they are not accessible when using the WASM parser that Zed uses.

This explains why:
- The `tree-sitter query` CLI works (uses native bindings)
- Bracket captures in `highlights.scm` don't actually match anything (but don't break highlighting)
- Adding `brackets.scm` breaks highlighting (Zed may handle query failures differently for bracket queries)

**Workaround**: Bracket auto-closing is configured in `config.toml` and works without `brackets.scm`. However, rainbow brackets and bracket-pair highlighting are not available.

**Potential fix**: The Modelica grammar would need to be modified to expose bracket tokens as named nodes, which would require changes to `grammar.js` in the upstream tree-sitter-modelica repository.
