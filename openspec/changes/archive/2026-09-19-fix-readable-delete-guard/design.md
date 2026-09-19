## Approach

Choose the smallest readable-form correction after reproducing the failure: extend the existing interposed-argument pattern to one simple unquoted operand while retaining the quoted and glob forms, and keep a literal `--` as the option terminator. Treat malformed, obfuscated and unrelated commands under the current policy rather than adding another parser. Evaluator fixtures never execute the destructive input.

## Compatibility

General shell parsing, adversarial completeness, new guarded destinations, new hooks or broader secret detection. Existing native permissions and accepted direct-mode authority remain in effect.

## Validation

Use the scenarios in the delta and the existing relevant checks, including catastrophic targets after `--` and benign relative targets. Instruction-only changes receive behavioral inspection, not tests pinned to prose.
