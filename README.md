# Zed Modelica Language Extension

To update:

```
cd grammars/modelica
git pull
tree-sitter generate
```

This will create/update `grammars/modelica/src`.

Then update commit hash in `extension.toml`.

Then rebuild (or reinstall) with Zed. This will create/update `grammars/modelica.wasm`.
