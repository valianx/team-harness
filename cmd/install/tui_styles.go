package main

import (
	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"
)

// installerTheme returns a huh.Theme that follows the installer's brand palette:
//   - Orange  (#D26F00 light / #FF8C00 dark) — primary accent, section borders
//   - Purple  (#7B4EA3 light / #9B72CF dark) — secondary accent, labels
//   - Green   (#2E7D32 light / #57A064 dark) — success values
//
// The palette mirrors the ANSI 256-color values in banner.go (orange=208,
// purple=135, green=114) mapped to true-colour equivalents for lipgloss.
func installerTheme() huh.Theme {
	return huh.ThemeFunc(func(isDark bool) *huh.Styles {
		t := huh.ThemeCharm(isDark)

		lightDark := lipgloss.LightDark(isDark)

		orange := lightDark(lipgloss.Color("#D26F00"), lipgloss.Color("#FF8C00"))
		purple := lightDark(lipgloss.Color("#7B4EA3"), lipgloss.Color("#9B72CF"))
		green := lightDark(lipgloss.Color("#2E7D32"), lipgloss.Color("#57A064"))
		muted := lightDark(lipgloss.Color("#888888"), lipgloss.Color("#666666"))

		// Override key style elements to match the brand palette.
		t.Focused.Title = t.Focused.Title.Foreground(orange).Bold(true)
		t.Focused.Description = t.Focused.Description.Foreground(muted)
		t.Focused.SelectedOption = t.Focused.SelectedOption.Foreground(green)
		t.Focused.SelectedPrefix = t.Focused.SelectedPrefix.Foreground(green)
		t.Focused.UnselectedOption = t.Focused.UnselectedOption.Foreground(muted)
		t.Focused.FocusedButton = t.Focused.FocusedButton.
			Background(orange).
			Foreground(lipgloss.Color("#FFFFFF")).
			Bold(true)
		t.Focused.BlurredButton = t.Focused.BlurredButton.
			Background(lipgloss.NoColor{}).
			Foreground(muted).
			Border(lipgloss.NormalBorder()).
			BorderForeground(muted)

		t.Blurred.Title = t.Blurred.Title.Foreground(purple)
		t.Blurred.SelectedOption = t.Blurred.SelectedOption.Foreground(green)

		return t
	})
}
