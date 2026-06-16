### Changed

- English-learning correction mode is now coupled to `language: en`: enabling the mode (via `/th:setup` Step 3.6 or an orchestrator chat toggle) also sets the response language to English at the same scope. The SessionStart hook gates the correction directive on the configured language being English or absent (absent defaults to English); a non-English config language (e.g. `es`) keeps the directive dormant. Disabling english-learning does not revert the language setting.
