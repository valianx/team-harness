package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"charm.land/huh/v2"
)

const workerModelDraftLimit = 64 << 10

var errWorkerModelSetupCancelled = errors.New("worker_models_cancelled")

type workerModelSetupOptions struct {
	File, CLI                string
	DryRun, Yes, Interactive bool
}

type workerModelSetupOption struct{ Label, Value string }

type workerModelSetupUI struct {
	Select  func(string, []workerModelSetupOption, string) (string, error)
	Confirm func() (bool, error)
}

type workerModelSelectionGap struct {
	Target    string
	Selection workerModelSelection
}

func (gap *workerModelSelectionGap) Error() string { return "worker_models_selection_missing" }

func readWorkerModelSettings(placer Placer) (map[string]json.RawMessage, error) {
	raw, err := readLeafNoFollow(opencodeSettingsConfigPath(placer.ConfigRoot()))
	if os.IsNotExist(err) {
		return map[string]json.RawMessage{}, nil
	}
	if err != nil {
		return nil, workerModelInvalid("settings_unavailable")
	}
	settings, err := parseTeamHarnessConfig(raw)
	if err != nil {
		return nil, workerModelInvalid("settings_invalid")
	}
	return settings, nil
}

func readWorkerModelDraftFile(path string) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return nil, workerModelInvalid("input_unavailable")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, workerModelInvalid("input_unavailable")
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(info, opened) {
		return nil, workerModelInvalid("input_unavailable")
	}
	data, err := io.ReadAll(io.LimitReader(file, workerModelDraftLimit+1))
	if err != nil {
		return nil, workerModelInvalid("input_unavailable")
	}
	if len(data) > workerModelDraftLimit {
		return nil, workerModelInvalid("input_limit")
	}
	return data, nil
}

func readExistingWorkerAgent(placer Placer, sourcePath string) ([]byte, error) {
	path := filepath.Join(placer.ConfigRoot(), "agents", filepath.Base(sourcePath))
	if err := lstatWalkForWrite(filepath.Dir(path), placer.ConfigRoot()); err != nil {
		return nil, workerModelInvalid("primary_metadata_unavailable")
	}
	content, err := readLeafNoFollow(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, workerModelInvalid("primary_metadata_unavailable")
	}
	return content, nil
}

func workerModelTransformFor(placer Placer, preference workerModels, categories workerModelCategories) func([]byte, string, string) ([]byte, error) {
	return func(source []byte, kind, sourcePath string) ([]byte, error) {
		var existing []byte
		if kind == TransformKindAgent {
			var err error
			existing, err = readExistingWorkerAgent(placer, sourcePath)
			if err != nil {
				return nil, err
			}
		}
		return opencodeWorkerModelTransform(source, kind, sourcePath, preference, categories, "", existing)
	}
}

func computeWorkerModelSetupPlan(placer Placer, preference workerModels, categories workerModelCategories) (PlanDiff, error) {
	modules, components, err := loadDefaultManifests("opencode")
	if err != nil {
		return PlanDiff{}, workerModelInvalid("plan_unavailable")
	}
	eligible := map[string]bool{}
	assets := EmbeddedAssets()
	for _, component := range components {
		if component.Kind != TransformKindAgent {
			continue
		}
		role := strings.TrimSuffix(filepath.Base(component.Source), ".md")
		source, err := fs.ReadFile(assets, component.Source)
		if err != nil {
			return PlanDiff{}, workerModelInvalid("plan_unavailable")
		}
		existing, err := readExistingWorkerAgent(placer, component.Source)
		if err != nil {
			return PlanDiff{}, err
		}
		primary, err := opencodeWorkerPrimary(role, source, existing, categories)
		if err != nil {
			return PlanDiff{}, err
		}
		eligible[component.Component] = !primary
	}
	// Keep the full selected roster while computing ownership, then publish
	// only worker entries. A subset roster would schedule unrelated removals.
	diff, err := ComputePlan(modules, components, allComponentIDs(components), placer, assets, workerModelTransformFor(placer, preference, categories))
	if err != nil {
		return PlanDiff{}, workerModelInvalid("plan_unavailable")
	}
	filter := func(files []PlannedFile) []PlannedFile {
		var workers []PlannedFile
		for _, file := range files {
			if eligible[file.Component] {
				workers = append(workers, file)
			}
		}
		return workers
	}
	return PlanDiff{ToCreate: filter(diff.ToCreate), ToUpdate: filter(diff.ToUpdate), ToSkipHashMatch: filter(diff.ToSkipHashMatch), ToRecord: filter(diff.ToRecord), LedgerErrors: diff.LedgerErrors}, nil
}

func validateWorkerModelCatalogSelection(preference workerModels, catalog []opencodeCatalogModel) error {
	available := map[string]bool{}
	for _, model := range catalog {
		available[model.Provider+"\x00"+model.ID] = true
	}
	valid := func(choice workerModelSelection) bool {
		return choice.Mode == "inherit" || available[choice.Provider+"\x00"+choice.Model]
	}
	var profiles []string
	for profile := range preference.Profiles {
		profiles = append(profiles, profile)
	}
	sort.Strings(profiles)
	for _, profile := range profiles {
		choice := preference.Profiles[profile]
		if !valid(choice) {
			return &workerModelSelectionGap{Target: "profiles." + profile, Selection: choice}
		}
	}
	var roles []string
	for role := range preference.RoleOverrides {
		roles = append(roles, role)
	}
	sort.Strings(roles)
	for _, role := range roles {
		choice := preference.RoleOverrides[role]
		if choice.Profile == "" && !valid(workerModelSelection{Mode: choice.Mode, Provider: choice.Provider, Model: choice.Model}) {
			return &workerModelSelectionGap{Target: "role_overrides." + role, Selection: workerModelSelection{Mode: choice.Mode, Provider: choice.Provider, Model: choice.Model}}
		}
	}
	return nil
}

func selectWorkerModel(ui workerModelSetupUI, title string, catalog []opencodeCatalogModel, current workerModelSelection) (workerModelSelection, error) {
	providers := map[string]bool{}
	for _, model := range catalog {
		providers[model.Provider] = true
	}
	var providerNames []string
	for provider := range providers {
		providerNames = append(providerNames, provider)
	}
	sort.Strings(providerNames)
	options := make([]workerModelSetupOption, 0, len(providerNames))
	for _, provider := range providerNames {
		options = append(options, workerModelSetupOption{Label: provider, Value: provider})
	}
	if len(options) == 0 {
		return workerModelSelection{}, workerModelInvalid("selection_missing")
	}
	provider, err := ui.Select(title+" provider", options, current.Provider)
	if err != nil {
		return workerModelSelection{}, err
	}
	options = nil
	for _, model := range catalog {
		if model.Provider == provider {
			options = append(options, workerModelSetupOption{Label: model.ID, Value: model.ID})
		}
	}
	if len(options) == 0 {
		return workerModelSelection{}, workerModelInvalid("selection_missing")
	}
	model, err := ui.Select(title+" model", options, current.Model)
	if err != nil {
		return workerModelSelection{}, err
	}
	return workerModelSelection{Mode: "model", Provider: provider, Model: model}, nil
}

func collectWorkerModelDraft(preference workerModels, categories workerModelCategories, catalog []opencodeCatalogModel, ui workerModelSetupUI) (workerModels, error) {
	if ui.Select == nil {
		return workerModels{}, workerModelInvalid("interaction_unavailable")
	}
	for _, profile := range categories.Profiles {
		choice := preference.Profiles[profile]
		mode, err := ui.Select(profile+" profile", []workerModelSetupOption{{"Inherit native model", "inherit"}, {"Choose native provider/model", "model"}}, choice.Mode)
		if err != nil {
			return workerModels{}, err
		}
		choice = workerModelSelection{Mode: mode, Provider: choice.Provider, Model: choice.Model}
		if mode == "model" {
			choice, err = selectWorkerModel(ui, profile, catalog, choice)
			if err != nil {
				return workerModels{}, err
			}
		} else {
			choice = workerModelSelection{Mode: mode}
		}
		preference.Profiles[profile] = choice
	}
	var roles []string
	for role := range categories.RoleProfiles {
		roles = append(roles, role)
	}
	sort.Strings(roles)
	roleOptions := []workerModelSetupOption{{"Done editing role overrides", "done"}}
	for _, role := range roles {
		roleOptions = append(roleOptions, workerModelSetupOption{role + " (" + categories.RoleProfiles[role] + ")", role})
	}
	for {
		role, err := ui.Select("Optional role override", roleOptions, "done")
		if err != nil {
			return workerModels{}, err
		}
		if role == "done" {
			break
		}
		if _, known := categories.RoleProfiles[role]; !known {
			return workerModels{}, workerModelInvalid("unknown_role")
		}
		options := []workerModelSetupOption{{"Use suggested profile", "default"}, {"Inherit native model", "inherit"}, {"Choose native provider/model", "model"}}
		for _, profile := range categories.Profiles {
			options = append(options, workerModelSetupOption{"Use " + profile + " profile", "profile:" + profile})
		}
		current := "default"
		if override, present := preference.RoleOverrides[role]; present {
			current = override.Mode
			if override.Profile != "" {
				current = "profile:" + override.Profile
			}
		}
		mode, err := ui.Select(role+" override", options, current)
		if err != nil {
			return workerModels{}, err
		}
		switch {
		case mode == "default":
			delete(preference.RoleOverrides, role)
		case strings.HasPrefix(mode, "profile:"):
			preference.RoleOverrides[role] = workerModelOverride{Profile: strings.TrimPrefix(mode, "profile:")}
		case mode == "inherit":
			preference.RoleOverrides[role] = workerModelOverride{Mode: "inherit"}
		case mode == "model":
			choice, err := selectWorkerModel(ui, role, catalog, workerModelSelection{})
			if err != nil {
				return workerModels{}, err
			}
			preference.RoleOverrides[role] = workerModelOverride{Mode: choice.Mode, Provider: choice.Provider, Model: choice.Model}
		default:
			return workerModels{}, workerModelInvalid("invalid_mode")
		}
	}
	raw, _ := json.Marshal(preference)
	return validateWorkerModelsJSON(raw, categories)
}

func persistWorkerModels(placer Placer, preference workerModels) error {
	settings, err := readWorkerModelSettings(placer)
	if err != nil {
		return err
	}
	raw, err := json.Marshal(preference)
	if err != nil {
		return workerModelInvalid("invalid_structure")
	}
	settings["worker-models"] = raw
	output, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return workerModelInvalid("settings_invalid")
	}
	if err := hardenedAtomicWriteSecret(append(output, '\n'), opencodeSettingsConfigPath(placer.ConfigRoot()), placer.ConfigRoot()); err != nil {
		return workerModelInvalid("partial_runtime_failure")
	}
	return nil
}

func runWorkerModelSetup(ctx context.Context, placer Placer, options workerModelSetupOptions, ui workerModelSetupUI, output io.Writer) error {
	if placer.Runtime() != "opencode" {
		return workerModelInvalid("runtime_unsupported")
	}
	if options.File == "" && (!options.Interactive || options.Yes) {
		return workerModelInvalid("input_required")
	}
	categories, err := readWorkerModelCategories(EmbeddedAssets())
	if err != nil {
		return err
	}
	settings, err := readWorkerModelSettings(placer)
	if err != nil {
		return err
	}
	raw := []byte(settings["worker-models"])
	if options.File != "" {
		raw, err = readWorkerModelDraftFile(options.File)
		if err != nil {
			return err
		}
	}
	preference, err := validateWorkerModelsJSON(raw, categories)
	if err != nil {
		return err
	}
	catalog, err := probeOpencodeModelCatalog(ctx, options.CLI, placer.ConfigRoot(), defaultOpencodeCatalogLimits(), categories)
	if err != nil {
		return err
	}
	if options.File == "" {
		if err := validateWorkerModelCatalogSelection(preference, catalog); err != nil {
			return err
		}
		preference, err = collectWorkerModelDraft(preference, categories, catalog, ui)
		if errors.Is(err, errWorkerModelSetupCancelled) {
			fmt.Fprintln(output, "Worker model setup cancelled. No installation changes were written.")
			return nil
		}
		if err != nil {
			return workerModelInvalid("interaction_unavailable")
		}
	}
	if err := validateWorkerModelCatalogSelection(preference, catalog); err != nil {
		return err
	}
	configureLedger(placer)
	diff, err := computeWorkerModelSetupPlan(placer, preference, categories)
	if err != nil {
		return err
	}
	if len(diff.LedgerErrors) != 0 {
		return workerModelInvalid("ledger_invalid")
	}
	fmt.Fprintln(output, "Worker model preview (catalog metadata does not verify authentication or execution):")
	var roles []string
	for role := range categories.RoleProfiles {
		roles = append(roles, role)
	}
	sort.Strings(roles)
	for _, role := range roles {
		selection, _ := resolveWorkerModelSelection(preference, role, categories)
		identity := "inherit"
		if selection.Selection.Mode == "model" {
			identity = selection.Selection.Provider + "/" + selection.Selection.Model
		}
		fmt.Fprintf(output, "  %s [%s, %s]: %s\n", role, selection.Profile, selection.Source, identity)
	}
	preview, _ := json.MarshalIndent(preference, "", "  ")
	fmt.Fprintf(output, "%s\n", preview)
	PrintPlan(diff, output)
	if options.DryRun || (!options.Yes && !options.Interactive) {
		fmt.Fprintln(output, "Preview only. Confirm this draft with --yes or use an interactive terminal.")
		return nil
	}
	if !options.Yes {
		if ui.Confirm == nil {
			return workerModelInvalid("interaction_unavailable")
		}
		confirmed, err := ui.Confirm()
		if errors.Is(err, errWorkerModelSetupCancelled) || (err == nil && !confirmed) {
			fmt.Fprintln(output, "Worker model setup cancelled. No installation changes were written.")
			return nil
		}
		if err != nil {
			return workerModelInvalid("interaction_unavailable")
		}
	}
	if err := ApplyPlan(diff, placer); err != nil {
		return workerModelInvalid("partial_runtime_failure")
	}
	if err := persistWorkerModels(placer, preference); err != nil {
		return workerModelInvalid("partial_runtime_failure")
	}
	fmt.Fprintln(output, "Worker profiles saved and specialist files applied. Native configuration may override agent metadata; reload to verify activation.")
	return nil
}

func nativeWorkerModelSetupUI() workerModelSetupUI {
	return workerModelSetupUI{
		Select: func(title string, choices []workerModelSetupOption, current string) (string, error) {
			options := make([]huh.Option[string], 0, len(choices))
			for _, choice := range choices {
				options = append(options, huh.NewOption(choice.Label, choice.Value))
			}
			field := huh.NewSelect[string]().Title(title).Options(options...).Value(&current)
			form := huh.NewForm(huh.NewGroup(field)).WithAccessible(isAccessibleMode()).WithTheme(installerTheme())
			if err := runFormWithTTY(form); err != nil {
				if errors.Is(err, huh.ErrUserAborted) {
					return "", errWorkerModelSetupCancelled
				}
				return "", workerModelInvalid("interaction_unavailable")
			}
			return current, nil
		},
		Confirm: func() (bool, error) {
			confirmed := false
			form := huh.NewForm(huh.NewGroup(huh.NewConfirm().Title("Apply the previewed specialist profiles?").Value(&confirmed))).WithAccessible(isAccessibleMode()).WithTheme(installerTheme())
			if err := runFormWithTTY(form); err != nil {
				if errors.Is(err, huh.ErrUserAborted) {
					return false, errWorkerModelSetupCancelled
				}
				return false, workerModelInvalid("interaction_unavailable")
			}
			return confirmed, nil
		},
	}
}

func printWorkerModelSetupHelp(output io.Writer) {
	fmt.Fprintln(output, "Usage: install setup models --runtime opencode [--scope global|project] [--opencode-dir ABS]")
	fmt.Fprintln(output, "  --worker-models-file PATH  Complete worker-models JSON draft (at most 64 KiB).")
	fmt.Fprintln(output, "  --dry-run                  Print draft and specialist plan without applying.")
	fmt.Fprintln(output, "  --yes                      Confirm an explicit JSON file without prompting.")
	fmt.Fprintln(output, "  --opencode-cli ABS         Selected native executable; default: opencode on PATH.")
	fmt.Fprintln(output, "Without a terminal, a JSON file previews only until --yes; --non-interactive is not confirmation.")
	fmt.Fprintln(output, "Catalog: models --verbose; 5s timeout, 16 MiB stdout, 8 KiB stderr, 8192 records, 256 KiB per record.")
	fmt.Fprintln(output, "No refresh, authentication or inference. Catalog presence does not establish credentials or execution.")
}

func runSetupModelsCommand(args []string) {
	if len(args) == 2 && args[0] == "models" && (args[1] == "--help" || args[1] == "-h") {
		printWorkerModelSetupHelp(os.Stdout)
		return
	}
	if len(args) != 1 || args[0] != "models" || runtimeFlag != "opencode" {
		printWorkerModelSetupHelp(os.Stderr)
		os.Exit(1)
	}
	placer, err := selectPlacer()
	if err != nil {
		fmt.Fprintln(os.Stderr, "setup models: worker_models_settings_unavailable")
		os.Exit(1)
	}
	options := workerModelSetupOptions{File: workerModelsFileFlag, CLI: opencodeCLIFlag, DryRun: workerModelsDryRunFlag, Yes: workerModelsYesFlag, Interactive: !nonInteractiveFlag && hasInteractiveInput()}
	if err := runWorkerModelSetup(context.Background(), placer, options, nativeWorkerModelSetupUI(), os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "setup models: %s\n", err)
		var gap *workerModelSelectionGap
		if errors.As(err, &gap) {
			fmt.Fprintf(os.Stderr, "Selected identity absent from the available catalog at %s: %q / %q\n", gap.Target, gap.Selection.Provider, gap.Selection.Model)
		}
		if err.Error() == "worker_models_partial_runtime_failure" {
			fmt.Fprintln(os.Stderr, "Some specialist files or ownership entries may have changed. Saved profiles were not replaced if application failed; inspect and retry the same draft.")
		} else {
			fmt.Fprintln(os.Stderr, "Profiles were not saved. Check the complete draft and native catalog; use --opencode-cli ABS for a directly executable installed CLI.")
		}
		os.Exit(1)
	}
}
