# Fix: Double Indent in Nested If-Expressions with Parenthesized Comparisons

## Problem

When a nested `if`-expression inside a parenthesized expression contained a comparison operator with a long right-hand side, the formatter would apply double indentation.

### Example (Before Fix)

```modelica
final parameter Real dpValCheChiWat_nominal =
  if have_chiWat
  then (if typPumChiWatPri ==
      Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.None  // ← 8 spaces (WRONG)
    then dat.dpValCheHeaWat_nominal * factor
    else dat.dpValCheChiWat_nominal)
  else 0;
```

The `Buildings.Templates...None` line had 8 spaces of indentation (double indent from the base level), when it should only have 6 spaces (single indent).

### Example (After Fix)

```modelica
final parameter Real dpValCheChiWat_nominal =
  if have_chiWat
  then (if typPumChiWatPri ==
    Buildings.Templates.Plants.HeatPumps.Types.PumpsPrimary.None  // ← 6 spaces (CORRECT)
    then dat.dpValCheHeaWat_nominal * factor
    else dat.dpValCheChiWat_nominal)
  else 0;
```

## Root Cause

The double indentation occurred due to how continuation context was propagated through parenthesized expressions:

1. The outer `if`-expression adds indent for its `then` value (the parenthesized expression)
2. Previously, `parenthesized_expression` acted as a **boundary** in `isInContinuationContext()`, resetting the continuation context
3. This made inner constructs (like binary expressions with comparison operators) think they were NOT in a continuation context
4. The comparison operator's `wrapContinuation()` would then add its own indent
5. Result: double indentation (outer if's indent + comparison's indent)

## Solution

Made `parenthesized_expression` **transparent** to continuation context checking:

### Changes in `src/printer.ts`

1. **Removed boundary check in `isInsideIfExpressionValue()`** (line ~62):
   - Before: `if (ancestor.type === "parenthesized_expression") return false;`
   - After: Comment explaining transparency

2. **Removed boundary check in `isInContinuationContext()`** (line ~133):
   - Before: `if (ancestor.type === "parenthesized_expression") return false;`
   - After: Comment explaining transparency

### Why This Works

With parenthesized expressions being transparent:

1. Outer `if` adds indent for its `then` value
2. Parenthesized expression doesn't reset context - it's transparent
3. Inner binary expression (comparison) checks continuation context
4. It finds that it's in continuation context (from outer if)
5. `wrapContinuation()` doesn't add extra indent
6. Result: correct single indentation level

## Edge Cases Tested

All edge cases now format correctly:

- ✅ Nested if with long comparison RHS
- ✅ Multiple binary operations inside nested if
- ✅ Nested parenthesized expressions
- ✅ If in else branch with nested if
- ✅ Arithmetic with parenthesized if
- ✅ Function call arguments with nested if
- ✅ Logical operators with nested if
- ✅ Array subscripts with nested if
- ✅ Deeply nested ifs (3+ levels)
- ✅ Logical operators inside nested if conditions

## Test Files

- `test/IfThenElse_formatted.mo` - Original failing case (line 9)
- `test/nested_if_in_paren.mo` - Targeted test cases
- `test/paren_edge_cases.mo` - Comprehensive edge cases

## Key Insight

Parenthesized expressions in Modelica serve as **grouping constructs**, not **indentation boundaries**. Their contents should inherit the continuation context from their surrounding scope, similar to how parentheses work in most expression-based languages.

This aligns with the principle that indentation should reflect semantic nesting (control flow, declarations, etc.), not syntactic grouping (parentheses).