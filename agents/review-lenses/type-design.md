# Type-Design Lens

**Purpose:** Detect type signatures that allow illegal states to be represented — nullable sprawl,
primitive obsession, stringly-typed state machines, boolean parameter flags — where a better type
makes the bug class unrepresentable.

## When this lens fires

Load this file when the diff contains any of:
- `| null | undefined` on a type that is always expected to be set after initialization
- Primitive types (`string`, `number`, `int`, `str`) used for domain-specific values such as IDs,
  monetary amounts, status enums, or currency codes
- Boolean parameters (`enabled: boolean`, `isAdmin: boolean`) as function arguments — callers cannot
  distinguish meaning from the call site
- Stringly-typed state: `status: string` where the valid states form a closed set
- Functions that accept `null` or `undefined` for a parameter and branch internally rather than
  providing an overload or optional wrapper
- Missing discriminated unions where the response/result shape varies by a tag field

## What to look for

### Nullable sprawl

```ts
// Smell — every caller must null-check before use
interface User {
  id: string | null;
  email: string | null;
  role: string | null;
}

// Prefer — make the impossible state unrepresentable
interface AuthenticatedUser {
  id: string;      // always present for authenticated users
  email: string;
  role: UserRole;  // typed enum, never null
}
```

When `| null` appears on a field that is always populated in the context where the type is used,
the type admits an illegal state. The fix is either a narrower type (separate `AuthenticatedUser`
from `MaybeUser`) or a non-nullable representation.

### Primitive obsession

```ts
// Smell — a string can hold any value; callers pass wrong IDs
function transfer(fromAccountId: string, toAccountId: string, amount: number) {}

// Prefer — nominal/branded types prevent accidental swaps and enforce domain constraints
type AccountId = string & { readonly __brand: "AccountId" };
type Money = { readonly cents: number; readonly currency: CurrencyCode };
```

When `string` or `number` types represent domain-specific values (IDs, money, enums), accidental
substitution (passing a `userId` where an `accountId` is expected) is a compile-time-invisible bug.

### Boolean parameter flags

```ts
// Smell — call site is unreadable; what does `true, false` mean?
renderButton(label, true, false);

// Prefer — named option object or separate functions
renderButton(label, { primary: true, disabled: false });
```

Boolean parameters make call sites unreadable and often signal that a function is doing two
different things. Prefer named option objects or separate functions.

### Stringly-typed state

```ts
// Smell — any string is accepted; invalid states are representable at runtime
type OrderStatus = string;

// Prefer — closed enum; invalid states are a compile error
type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";
```

### Missing discriminated union

```ts
// Smell — callers must check `success` flag manually and cast; shape is ambiguous
interface ApiResponse {
  success: boolean;
  data?: SomeData;
  error?: string;
}

// Prefer — shape varies by the discriminant; TypeScript narrows correctly
type ApiResponse =
  | { success: true; data: SomeData }
  | { success: false; error: string };
```

## Severity guidance

| Pattern | Severity |
|---------|----------|
| Nullable field or parameter on an auth / permission / security-sensitive path where `null` bypasses a check | CRITICAL |
| Primitive ID type where a swap at the call site causes data corruption or cross-account access | CRITICAL |
| Stringly-typed state where an invalid state causes a data mutation or security decision | CRITICAL |
| Nullable sprawl on a non-security field that forces every caller to null-check | SUGGESTION |
| Primitive obsession on a non-critical domain value (cosmetic label, search term) | SUGGESTION |
| Boolean parameter flag on an internal helper used in one place | NITPICK |

## Scope discipline

Raise findings only for types the diff **introduced or modified** (see `## Scope Discipline` in
`reviewer.md`). Pre-existing primitive obsession in untouched interfaces goes in `## Fuera de
alcance` at most once — it does not affect the verdict. Do not duplicate a finding already raised
under `### SOLID / Clean Code` in the main review.
