package downloads

import (
	"testing"

	"github.com/iappstores/api-go/internal/contracts"
)

func TestResolveDownloadTarget(t *testing.T) {
	bundleID := "com.example.app"
	url := "https://example.com/app.ipa"
	apps := []contracts.AppDto{{
		ID: "source-a:com.example.app", BundleIdentifier: &bundleID, Name: "App",
		DownloadOptions: []contracts.AppDownloadOption{
			{SourceID: "source-a", SourceName: "Source A", DownloadURL: &url},
			{SourceID: "source-b", SourceName: "Source B", DownloadURL: nil},
		},
	}}

	target, err := ResolveDownloadTarget(apps, "com.example.app", "source-a")
	if err != nil {
		t.Fatalf("unexpected error: %+v", err)
	}
	if target.Option.DownloadURL == nil || *target.Option.DownloadURL != url {
		t.Errorf("downloadURL = %v", target.Option.DownloadURL)
	}

	if _, err := ResolveDownloadTarget(apps, "com.unknown.app", "source-a"); err == nil || err.Code != "app_not_found" {
		t.Errorf("expected app_not_found, got %+v", err)
	}
	if _, err := ResolveDownloadTarget(apps, "com.example.app", "source-z"); err == nil || err.Code != "download_source_not_found" {
		t.Errorf("expected download_source_not_found, got %+v", err)
	}
	if _, err := ResolveDownloadTarget(apps, "com.example.app", "source-b"); err == nil || err.Code != "download_url_missing" {
		t.Errorf("expected download_url_missing, got %+v", err)
	}
}

func TestResolveDownloadTargetMatchesByBundlePrefix(t *testing.T) {
	bundleID := "com.example.app"
	apps := []contracts.AppDto{{ID: "bundle:com.example.app", BundleIdentifier: &bundleID, Name: "App", DownloadOptions: []contracts.AppDownloadOption{}}}
	if _, err := ResolveDownloadTarget(apps, "COM.EXAMPLE.APP", "any"); err == nil || err.Code == "app_not_found" {
		t.Errorf("expected case-insensitive bundle id match, got %+v", err)
	}
}

func TestDecideDownloadRedirect(t *testing.T) {
	statusCode := 404
	broken := decideForTest(ProbeResult{Status: ProbeHardFailure, StatusCode: &statusCode})
	if broken.ShouldRedirect {
		t.Error("expected hard_failure to not redirect")
	}
	if broken.Code != "download_link_broken" {
		t.Errorf("code = %s", broken.Code)
	}

	ok := decideForTest(ProbeResult{Status: ProbeSuccess})
	if !ok.ShouldRedirect {
		t.Error("expected success to redirect")
	}

	inconclusive := decideForTest(ProbeResult{Status: ProbeInconclusive})
	if !inconclusive.ShouldRedirect {
		t.Error("expected inconclusive to still redirect (benefit of the doubt)")
	}
}

func decideForTest(probe ProbeResult) Decision {
	return DecideDownloadRedirect("https://example.com/app.ipa", probe)
}
