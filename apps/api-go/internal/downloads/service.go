package downloads

import (
	"fmt"
	"strings"

	"github.com/iappstores/api-go/internal/contracts"
)

type TargetError struct {
	Status  int
	Code    string
	Message string
}

type Target struct {
	App    contracts.AppDto
	Option contracts.AppDownloadOption
}

func matchesAppID(app contracts.AppDto, appID string) bool {
	if app.ID == appID {
		return true
	}
	if app.BundleIdentifier != nil && strings.EqualFold(*app.BundleIdentifier, appID) {
		return true
	}
	return app.ID == "bundle:"+strings.ToLower(appID)
}

// ResolveDownloadTarget mirrors resolveDownloadTarget().
func ResolveDownloadTarget(apps []contracts.AppDto, appID, sourceID string) (*Target, *TargetError) {
	var app *contracts.AppDto
	for i := range apps {
		if matchesAppID(apps[i], appID) {
			app = &apps[i]
			break
		}
	}
	if app == nil {
		return nil, &TargetError{404, "app_not_found", fmt.Sprintf(`Unknown app "%s".`, appID)}
	}

	var option *contracts.AppDownloadOption
	for i := range app.DownloadOptions {
		if app.DownloadOptions[i].SourceID == sourceID {
			option = &app.DownloadOptions[i]
			break
		}
	}
	if option == nil {
		return nil, &TargetError{404, "download_source_not_found", fmt.Sprintf(`No download source "%s" was found for this app.`, sourceID)}
	}
	if option.DownloadURL == nil {
		return nil, &TargetError{404, "download_url_missing", "This download source does not include an IPA URL."}
	}

	return &Target{App: *app, Option: *option}, nil
}

type Decision struct {
	ShouldRedirect bool
	DownloadURL    string
	Status         int
	Code           string
	Message        string
	StatusCode     *int
	Error          *string
}

// DecideDownloadRedirect mirrors decideDownloadRedirect().
func DecideDownloadRedirect(downloadURL string, probe ProbeResult) Decision {
	if probe.Status == ProbeHardFailure {
		return Decision{
			ShouldRedirect: false,
			Status:         502,
			Code:           "download_link_broken",
			Message:        "The source download link appears to be broken.",
			StatusCode:     probe.StatusCode,
			Error:          probe.Error,
		}
	}
	return Decision{ShouldRedirect: true, DownloadURL: downloadURL}
}
