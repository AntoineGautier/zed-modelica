# Zed Modelica Extension

To update:

```
cd grammars/modelica
git pull
tree-sitter generate
```

This will create/update `grammars/modelica/src`.

Then update commit hash in `extension.toml`.

Then rebuild (or reinstall) with Zed. This will create/update `grammars/modelica.wasm`.

## Notes Regarding Zed Integration

The dependency `grammars/modelica` is not managed by git submodule because Zed requires this to be a clone of the repository specified in `extension.toml`.
Zed will clone it automatically at extension install/rebuild.

### brackets.scm Issue

Including the file `languages/modelica/brackets.scm` breaks syntax highlighting.

**Root cause (?)**: The WASM-compiled tree-sitter parser outputs **only named nodes**, while native Node bindings output **both named and unnamed nodes**.
Since bracket tokens (`(`, `)`, `{`, `}`, `[`, `]`) are anonymous/unnamed nodes in tree-sitter, they are not accessible when using the WASM parser that Zed uses.

This explains why:
- The `tree-sitter query` CLI works (uses native bindings)
- Bracket captures in `highlights.scm` don't actually match anything (but don't break highlighting)
- Adding `brackets.scm` breaks highlighting (Zed may handle query failures differently for bracket queries)

**Workaround**: Bracket auto-closing is configured in `config.toml` and works without `brackets.scm`. However, rainbow brackets and bracket-pair highlighting are not available.

**Potential fix**: The Modelica grammar would need to be modified to expose bracket tokens as named nodes, which would require changes to `grammar.js` in the upstream tree-sitter-modelica repository.
