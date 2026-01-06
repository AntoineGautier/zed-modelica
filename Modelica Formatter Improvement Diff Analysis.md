In formatter/src/printer.ts there is logic to prevent double indent in case of multiple "indent-requiring constructs" are on same line and break. Then the next line has a ***single additional indent*** instead of multiple (stacked) additional indents.
The concept of "same line" can be hard to evaluate before applying prettier builtin breaking algorithm, therefore it's more tractable to implement equivalent logic that for instance tracks if a construct is nested into another one that already adds indent. Then the nested construct can add indent only if the indent from the outer construct has already been consumed.
```
constructA(constructB( <--- constructB doesn't add indent because indent from constructA not consumed yet
INDENT constructC(     <--- indent from constructA used, constructC can add indent
INDENT INDENT ...      <--- indent from constructC used
```

Your fist job is to verify that the logic to prevent stacked additional indents if homogeneous across all printer functions, i.e., that no construct uses ad hoc tailored mechanism to meet that requirement.



WAIT. What I wrote is not precise enough.
It's true on a line by line logic but not accross multiple lines.
Take [@IfThenElse_formatted.mo (42:44)](file:///Users/reituag/gitrepo/zed-modelica/formatter/test/IfThenElse_formatted.mo#L42:44)
Line 42: the binding adds indent, the function call 'max(' must not add indent
=> Line 43 has single indent due to continuing a binding expr.
Line 43: the indent from continuing a binding expr. has been "used", now the line breaks inside a parenthetized expr. which must add indent (even in context of a binding)
=> Line 44 has single indent due to continuing a parenthetized expr.

I believe there's already logic implemented to check first occurrence within context, right?


All of these constucts should add ***single indent***:
- parenthesized_expression
- binding expression for both named and unnamed arguments
- function call
- if, then, elseif, else clause
- when, elsewhen clause
- class mod

BUT, if on the same line another construct already added indent, then NO INDENT should be added.
In NO case should there be multiple (stacked) indents, or multiple indents added by a single construct (as a hack).

BUT, if on the same line another construct already added indent, then NO INDENT should be added.
In NO case should there be multiple (stacked) indents.

DO NOT remove indent addition for constructs that require one.
Update isInContinuationContext so that each construct can detect that indent on next line is already added by previous construct.

Precision for
- if/then/elseif/else clause
- when/elsewhen clause

the content of each clause should be indented, if multiline,
BUT the keywords themselves should not be indented.
```
    if is_rev <-- 'then' on next line at same indent level as 'if'
    then TChiWatSup_nominal - QCoo_flow_nominal / cpChiWat_default /
      mChiWat_flow_nominal  <-- multiline content of 'then' indented
    else Buildings.Templates.Data.Defaults.TChiWatRet

HEAD commit introduced a break after '==' logical operator when line > 80 chars: see [@Annotations_formatted.mo (29:30)](file:///Users/reituag/gitrepo/zed-modelica/formatter/test/Annotations_formatted.mo#L29:30)
This is good. BUT the continuing line should be indented.
As always, when modifying indent logic, continuation context should also consistently be updated so that nested constructs such as parenthetized expr. don't yield doubled indent e.g. A == (longC or longD)

----

Ah, I understand now! The logic is more nuanced:

- **Line 42**: `dp_nominal=...` binding causes a break → binding adds indent
- **Line 43**: The binding's indent is "consumed" on this line. Now `((if...` breaks → the parenthesized expression adds its OWN indent
- **Line 44**: Gets indent from the parenthesized expression, not stacked with binding

So it's not about "don't add indent if inside a context" - it's about **each new line break can add one level of indent from whatever construct is breaking at that point**.

Yes, I believe the `isInContinuationContext` function was designed to detect this - it checks if we're inside a construct that has **already contributed** indent. Let me look at it:
I see - the logic exists but the key insight is:

1. `parenthesized_expression` is treated as a **boundary** when it's an operand of a binary_expression - this "resets" the context
2. So inner constructs within the parens can add their own indent

The issue now is that since I removed all indent from binary expressions, and `parenthesized_expression` doesn't add indent either, nothing adds indent when needed.

The fix should be: `parenthesized_expression` should add indent for its content, using `isInContinuationContext` to avoid stacking. And since parens act as a boundary in `isInContinuationContext`, nested constructs will correctly see themselves as NOT in continuation context and can add their own indent.


## User

The changes introduced by last commit aimed at improving the formatting of
[@Miscellaneous.mo (14:17)](file:///Users/reituag/gitrepo/zed-modelica/formatter/test/Miscellaneous.mo#L14:17)
from previous state
```
  final parameter Modelica.Units.SI.HeatFlowRate QChg_flow_nominal =
    eps_nominal *
      min(
        {mLiq_flow_nominal * cpLiq_nominal, mAir_flow_nominal * cpTestAirChg_nominal}) *
      (TLiqEntChg_nominal - TAirEntChg_nominal);
```
to current state [@Miscellaneous_formatted.mo (22:25)](file:///Users/reituag/gitrepo/zed-modelica/formatter/test/Miscellaneous_formatted.mo#L22:25)
This is mostly good.
First can you you analyze the output
git diff 41e056b -- formatter/src/printer.ts
and check that the changes contain no hack and seem generic and robust enough for a production grade formatter.

## Assistant

<thinking>
The user wants me to analyze the git diff for the changes made in the last commit to `formatter/src/printer.ts`. They want to check if the changes are generic and robust enough for a production-grade formatter, without any hacks.

Let me run the git diff command to see the changes.
</thinking>

**Tool Call: `git diff 41e056b -- formatter/src/printer.ts`**
Status: Completed

Terminal:
```

CondaError: Run 'conda init' before 'conda activate'

diff --git a/formatter/src/printer.ts b/formatter/src/printer.ts
index 2cea684..24bf948 100644
--- a/formatter/src/printer.ts
+++ b/formatter/src/printer.ts
@@ -8,7 +8,7 @@ import { doc } from "prettier";
 import type { ASTNode } from "./parser.js";

 const { builders } = doc;
-const { group, indent, line, softline, hardline, join, fill } = builders;
+const { group, indent, line, softline, hardline, join, fill, conditionalGroup } = builders;

 // ===========================================
 // Centralized Continuation Line Handling
@@ -1988,6 +1988,7 @@ export const printModelica: Printer<ASTNode>["print"] = (
           // Flatten same-precedence arithmetic operators into a single structure.
           // This avoids nested groups that cause cascading indentation.
           const operands: Doc[] = [];
+          const operandNodes: ASTNode[] = []; // Track AST nodes for type checking
           const ops: string[] = [];

           // Helper to unwrap simple_expression to find binary_expression
@@ -1999,6 +2000,19 @@ export const printModelica: Printer<ASTNode>["print"] = (
             return null;
           };

+          // Helper to unwrap expression wrappers to find the core node type
+          const unwrapToCore = (n: ASTNode): ASTNode => {
+            if (
+              (n.type === "simple_expression" ||
+                n.type === "primary_expression" ||
+                n.type === "expression") &&
+              n.children?.length === 1
+            ) {
+              return unwrapToCore(n.children[0]);
+            }
+            return n;
+          };
+
           // Recursive flatten - collects all operands and operators
           const flatten = (p: AstPath<ASTNode>): void => {
             const n = p.getValue();
@@ -2045,6 +2059,7 @@ export const printModelica: Printer<ASTNode>["print"] = (
             }
             // Base case - not an arithmetic binary_expression, print normally
             operands.push(print(p));
+            operandNodes.push(unwrapToCore(n));
           };

           flatten(path);
@@ -2078,19 +2093,60 @@ export const printModelica: Printer<ASTNode>["print"] = (
           // in consistent indentation for all continuation lines.
           const inContinuation = isInContinuationContext(path);

+          // Helper to check if an operand is "huggable" - should stay inline with operator
+          // when possible, allowing internal breaks before breaking before the operand
+          const isHuggable = (n: ASTNode): boolean => {
+            return (
+              n.type === "function_application" ||
+              n.type === "parenthesized_expression" ||
+              n.type === "array_constructor"
+            );
+          };
+
           // Build the continuation parts (everything after first operand)
-          const continuationParts: Doc[] = [];
+          // We need to handle huggable vs non-huggable operands differently:
+          // - Huggable operands (function calls, parens, arrays) handle their own indentation
+          // - Non-huggable operands need outer indent wrapper
+          const parts: Doc[] = [operands[0]];
+
           for (let i = 0; i < ops.length; i++) {
-            continuationParts.push(" ", ops[i], group([line, operands[i + 1]]));
+            const operand = operands[i + 1];
+            const operandNode = operandNodes[i + 1];
+
+            if (operandNode && isHuggable(operandNode)) {
+              // For huggable operands (function calls, parens, arrays), use conditionalGroup
+              // to try multiple layouts in order:
+              // 1. All inline - operand fits without any breaks
+              // 2. Operator inline, operand breaks internally (e.g., "* min(\n  args)")
+              // 3. Break before operand (fallback)
+              // NO outer indent - huggable operands handle their own indentation
+              // For option 3: only add indent if not already in continuation context
+              // AND operand is not a function_application (which handles its own indent via function_call_args)
+              const option3: Doc = inContinuation || operandNode.type === "function_application"
+                ? [" ", ops[i], group([line, operand])]
+                : [" ", ops[i], indent(group([line, operand]))];
+              parts.push(
+                conditionalGroup([
+                  // Option 1: all inline
+                  [" ", ops[i], " ", operand],
+                  // Option 2: operator inline, operand breaks internally
+                  [" ", ops[i], " ", group(operand, { shouldBreak: true })],
+                  // Option 3: break before operand
+                  option3,
+                ]),
+              );
+            } else {
+              // Non-huggable operands: use group with line to allow breaking before
+              // Apply indent for continuation
+              if (inContinuation) {
+                parts.push(" ", ops[i], group([line, operand]));
+              } else {
+                parts.push(" ", ops[i], indent(group([line, operand])));
+              }
+            }
           }

-          if (inContinuation) {
-            // Already in continuation context - no additional indent needed
-            return group([operands[0], ...continuationParts]);
-          } else {
-            // Wrap all continuations in shared indent so all lines get same indent
-            return group([operands[0], indent(continuationParts)]);
-          }
+          return group(parts);
         }

         // Short expressions and comparisons: stay inline
@@ -2150,9 +2206,33 @@ export const printModelica: Printer<ASTNode>["print"] = (

     case "parenthesized_expression": {
       // Wrap in parens - content starts on same line as '('
-      // Don't add indent here - inner constructs (binary_expression, function_call_args)
-      // handle their own indentation. This avoids double indent issues.
       const content = path.map(print, "children");
+
+      // Check if content already handles its own indentation
+      // Function applications and binary expressions add their own indent,
+      // so we shouldn't add extra indent for them
+      const childNode = node.children?.[0];
+
+      // Unwrap expression wrappers to find the core node type
+      let coreChild = childNode;
+      while (coreChild &&
+             (coreChild.type === "simple_expression" ||
+              coreChild.type === "primary_expression" ||
+              coreChild.type === "expression") &&
+             coreChild.children?.length === 1) {
+        coreChild = coreChild.children[0];
+      }
+
+      const contentHandlesOwnIndent = coreChild && (
+        coreChild.type === "function_application" ||
+        coreChild.type === "binary_expression"
+      );
+
+      if (contentHandlesOwnIndent) {
+        // Content handles its own indentation - no extra indent needed
+        return group(["(", content, ")"]);
+      }
+      // Simple content that doesn't handle indent - add indent for breaks
       return group(["(", content, ")"]);
     }

@@ -2224,12 +2304,12 @@ export const printModelica: Printer<ASTNode>["print"] = (
         return group(["{", join([",", line], args), "}"]);
       }

-      // Non-annotation arrays: delegate to array_arguments which handles fill
+      // Non-annotation arrays: delegate to array_arguments which handles breaking
       if (args.length === 0) return "{}";

       // args[0] is the formatted array_arguments - wrap with braces
-      // Braces stay attached to first/last elements, indent for continuation
-      return group(["{", indent(args[0]), "}"]);
+      // array_arguments handles its own indentation for continuation elements
+      return group(["{", args[0], "}"]);
     }

     case "array_arguments": {
@@ -2269,17 +2349,17 @@ export const printModelica: Printer<ASTNode>["print"] = (
         // Default: comma-separated without spaces for compact arrays
         return join(",", args);
       }
-      // Non-annotation: use fill to wrap at line length
-      // Braces stay attached to first/last elements (no softline at start/end)
-      // Build fill items: [elem1, ",", line, elem2, ",", line, elem3, ...]
-      const fillItems: Doc[] = [];
-      for (let i = 0; i < args.length; i++) {
-        if (i > 0) {
-          fillItems.push(",", line);
-        }
-        fillItems.push(args[i]);
+      // Non-annotation: first element hugs opener, subsequent elements break with continuation indent
+      // Pattern: {elem1,\n  elem2,\n  elem3}
+      if (args.length === 0) return "";
+      if (args.length === 1) return args[0];
+
+      // First element inline, rest can break with continuation indent
+      const continuationParts: Doc[] = [];
+      for (let i = 1; i < args.length; i++) {
+        continuationParts.push(",", group([line, args[i]]));
       }
-      return fill(fillItems);
+      return [args[0], indent(continuationParts)];
     }

     case "array_concatenation": {
@@ -2352,12 +2432,12 @@ export const printModelica: Printer<ASTNode>["print"] = (
       // Check if we're directly inside a named_argument to avoid cumulative indent
       // named_argument already adds indent, so we shouldn't add more
       const isInNamedArgument = (() => {
-        // Walk up parent chain looking for named_argument before hitting function_call_args boundary
-        for (let i = 0; i < 10; i++) {
+        // Walk up parent chain looking for named_argument before hitting declaration boundary
+        for (let i = 0; i < 15; i++) {
           const ancestor = path.getParentNode(i);
           if (!ancestor) break;
           if (ancestor.type === "named_argument") return true;
-          if (ancestor.type === "function_call_args" && i > 0) break; // Another function_call_args = nested call
+          // Stop at declaration boundaries - these reset the context
           if (
             ancestor.type === "declaration" ||
             ancestor.type === "component_declaration"

```


## Assistant

Now let me analyze this diff in detail. Let me also look at the current state of the relevant sections to understand the context better:

**Tool Call: Read file `formatter/src/printer.ts` (lines 2080-2160)**
Status: Completed

```zed-modelica/formatter/src/printer.ts
          //   A + complex_expr *
          //     ((if x then 1 else 0) +
          //       (if y then 1 else 0)) + C
          // The " + C" fits on the last line of the parenthesized expression.

          if (ops.length === 0) {
            return operands[0];
          }

          // Build flat structure: first operand, then all continuation operands
          // All continuations in the same flattened chain share the same indent level.
          // We wrap ALL continuation parts in a shared indent block (when not already
          // in continuation context) so that breaking any line in the chain results
          // in consistent indentation for all continuation lines.
          const inContinuation = isInContinuationContext(path);

          // Helper to check if an operand is "huggable" - should stay inline with operator
          // when possible, allowing internal breaks before breaking before the operand
          const isHuggable = (n: ASTNode): boolean => {
            return (
              n.type === "function_application" ||
              n.type === "parenthesized_expression" ||
              n.type === "array_constructor"
            );
          };

          // Build the continuation parts (everything after first operand)
          // We need to handle huggable vs non-huggable operands differently:
          // - Huggable operands (function calls, parens, arrays) handle their own indentation
          // - Non-huggable operands need outer indent wrapper
          const parts: Doc[] = [operands[0]];

          for (let i = 0; i < ops.length; i++) {
            const operand = operands[i + 1];
            const operandNode = operandNodes[i + 1];

            if (operandNode && isHuggable(operandNode)) {
              // For huggable operands (function calls, parens, arrays), use conditionalGroup
              // to try multiple layouts in order:
              // 1. All inline - operand fits without any breaks
              // 2. Operator inline, operand breaks internally (e.g., "* min(\n  args)")
              // 3. Break before operand (fallback)
              // NO outer indent - huggable operands handle their own indentation
              // For option 3: only add indent if not already in continuation context
              // AND operand is not a function_application (which handles its own indent via function_call_args)
              const option3: Doc = inContinuation || operandNode.type === "function_application"
                ? [" ", ops[i], group([line, operand])]
                : [" ", ops[i], indent(group([line, operand]))];
              parts.push(
                conditionalGroup([
                  // Option 1: all inline
                  [" ", ops[i], " ", operand],
                  // Option 2: operator inline, operand breaks internally
                  [" ", ops[i], " ", group(operand, { shouldBreak: true })],
                  // Option 3: break before operand
                  option3,
                ]),
              );
            } else {
              // Non-huggable operands: use group with line to allow breaking before
              // Apply indent for continuation
              if (inContinuation) {
                parts.push(" ", ops[i], group([line, operand]));
              } else {
                parts.push(" ", ops[i], indent(group([line, operand])));
              }
            }
          }

          return group(parts);
        }

        // Short expressions and comparisons: stay inline
        return [
          path.call(print, "children", 0),
          " ",
          operator,
          " ",
          path.call(print, "children", 1),
        ];
      }

```


## Assistant

Now let me provide my analysis of this diff:

## Analysis of the Changes

### Overview

The changes implement a more sophisticated handling of binary expressions with "huggable" operands (function calls, parenthesized expressions, and array constructors). The goal is to produce better line-breaking behavior where these constructs can stay "hugged" to their operator while breaking internally.

### Positive Aspects (Generic/Robust)

1. **`conditionalGroup` usage is idiomatic Prettier**: This is the standard Prettier approach for trying multiple layouts in preference order. It's well-documented and battle-tested.

2. **The `isHuggable` concept is principled**: Identifying operands that "handle their own indentation" is a sound design pattern. Function calls, parenthesized expressions, and array constructors are indeed self-contained constructs that manage their own internal layout.

3. **The `unwrapToCore` helper is reasonable**: Modelica's grammar has several expression wrapper nodes. Unwrapping to find the actual node type is a valid pattern to avoid matching on wrapper nodes.

4. **Tracking `operandNodes` alongside `operands`**: This maintains the AST node alongside the formatted Doc, which is necessary to make type-based decisions during the output assembly phase.

5. **The three-option `conditionalGroup` strategy makes sense**:
   - Option 1: Everything inline (tightest)
   - Option 2: Operator inline, operand breaks internally
   - Option 3: Break before operand (fallback)

### Concerns (Potential Issues)

1. **Asymmetric indent logic in `option3`**:
```zed-modelica/formatter/src/printer.ts#L2126-2128
              const option3: Doc = inContinuation || operandNode.type === "function_application"
                ? [" ", ops[i], group([line, operand])]
                : [" ", ops[i], indent(group([line, operand]))];
```
   The special-casing of `function_application` here feels slightly fragile. If a function application is inside a parenthesized expression, it would still be detected as `function_application`, but the context might differ. However, the reasoning (function applications handle their own indent via `function_call_args`) is sound.

2. **The `parenthesized_expression` change appears to have dead code**:
```zed-modelica/formatter/src/printer.ts#L2206-2236
      if (contentHandlesOwnIndent) {
        // Content handles its own indentation - no extra indent needed
        return group(["(", content, ")"]);
      }
      // Simple content that doesn't handle indent - add indent for breaks
      return group(["(", content, ")"]);
```
   Both branches return the same thing! This looks like incomplete refactoring or a placeholder. The comment says "add indent for breaks" but no indent is added. This should probably be:
   ```
   return group(["(", indent([softline, content]), softline, ")"]);
   ```
   or similar for the non-self-handling case.

3. **The `array_arguments` change from `fill` to sequential breaks** is a significant behavioral change:
   - **Before**: Used `fill` for bin-packing array elements
   - **After**: First element inline, subsequent elements break with continuation indent

   This may be intentional for the formatting goal, but it means arrays no longer bin-pack. This could be undesirable for short arrays like `{1, 2, 3, 4, 5}` which would now become multi-line if the line is too long, rather than wrapping naturally.

4. **Magic number in `isInNamedArgument`**: The change from `10` to `15` iterations:
```zed-modelica/formatter/src/printer.ts#L2307
        for (let i = 0; i < 15; i++) {
```
   Both values are magic numbers. This should ideally traverse until a definitive boundary is found, not rely on arbitrary limits.

### Verdict

**The changes are mostly sound and follow established Prettier patterns**, but there are a few concerns:

1. **The `parenthesized_expression` dead code** (both branches identical) should be fixed - it looks like incomplete work.
2. **The `array_arguments` change** removes bin-packing behavior, which may or may not be intentional.
3. **The magic number increase** is a minor concern but not a showstopper.

The core logic using `conditionalGroup` for huggable operands is a clean, robust approach. Would you like me to address the dead code issue in `parenthesized_expression`?
