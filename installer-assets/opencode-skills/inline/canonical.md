
Interpret $ARGUMENTS as the user's direct-work preference: `on` (also a bare
invocation), `off`, or `status`. Keep the preference in the conversation.

When on, the general agent handles the objective directly. Use existing intent
and relevant checks; independent review may still help when consistent with the
user's preference. When off, return to ordinary contextual workflow selection.

This preference does not change native permissions, create pipeline state or
require a sensitivity confirmation protocol. Report its current setting briefly.
