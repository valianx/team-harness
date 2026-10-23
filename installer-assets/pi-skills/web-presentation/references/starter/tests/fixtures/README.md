# Independent test inputs

`sources/` contains synthetic documentation and independent fact expectations. Assess an actually authored deck against those facts; the fixtures are not an extraction benchmark and do not prescribe generated slide data.

`catalog.md` exercises six real layouts, native ordered reveals, an image, Mermaid and local/pending/denied/cross-origin frames. Browser tests assert literal region dimensions and visible facts, then inject overflow, clipping, overlap and a missing image into a previously healthy render. The cross-origin URL is supplied by a controlled local test server.

`notes.md` puts a unique canary in a native end-of-slide note. A real build including notes must retain it before the normal public build can prove exclusion.

Browser output lives outside the project. Fixture copies reuse the selected consumer's installed dependencies for isolation and speed; they do not establish portable installation or independent build evidence. The separate static lane must target the actual copied build under a non-root base path.

The isolated fixture merges its own directory and the actual dependency directory into Vite's file allowlist, preserving any existing native configuration in the copy. Every healthy measurement requires actual loaded Inter 400 and 500 font faces; a settled font-loading status alone does not establish that fonts loaded successfully.
