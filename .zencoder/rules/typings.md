---
description: TypeScript Typing Conventions
alwaysApply: true
---

# Typings

## Type Assertions
Type assertions (`as`) are allowed **only** when there is no other alternative. Every data structure must use either an initially provided type or a custom defined one.

## Custom Type Storage
All custom types must be stored in a `types.ts` module scoped to the relevant logic directory.

## Const Type Annotation
For consts expected to conform to a custom data structure, the type must be explicitly annotated on the const definition — not inferred via assertion.

- **Correct**: `const value: Custom = <actual value>;`
- **Incorrect**: `const value = <actual value> as Custom`
