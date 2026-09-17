# Native permissions

TH uses the active runtime's permission and approval facilities. Setup, update
and pipeline activation no longer provision global allow/deny rules, writable
roots, sandbox policy, network settings or approval modes.

A task that needs access outside its current workspace uses the native access
request for that concrete operation. TH does not intercept the command or create
a parallel authorization record.

Existing user settings remain user-owned, including settings an older TH version
helped configure. Removing an old value requires understanding its current use;
an update does not reset it automatically.
