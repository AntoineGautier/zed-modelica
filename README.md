# Zed Modelica Extension

A [Zed](https://zed.dev/) extension that provides syntax highlighting for the [Modelica](https://modelica.org/) language. This extension is highlighting-only: it does not provide an LSP, formatter, or other language features.

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
