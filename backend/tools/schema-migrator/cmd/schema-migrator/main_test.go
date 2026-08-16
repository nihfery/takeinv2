package main

import (
	"io/fs"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestParseArgsPreservesSafeMigrationOrder(t *testing.T) {
	mode, domains, err := parseArgs([]string{"status", "audit", "identity", "booking"})
	if err != nil {
		t.Fatal(err)
	}
	if mode != "status" || !reflect.DeepEqual(domains, []string{"identity", "booking", "audit"}) {
		t.Fatalf("unexpected result: mode=%s domains=%v", mode, domains)
	}
}

func TestParseArgsRejectsUnknownAndDuplicateDomains(t *testing.T) {
	for _, args := range [][]string{{"down"}, {"up", "identity", "identity"}, {"up", "legacy"}} {
		if _, _, err := parseArgs(args); err == nil {
			t.Fatalf("expected %v to fail", args)
		}
	}
}

func TestLoadTargetsRequiresEverySelectedDSNWithoutLeakingValue(t *testing.T) {
	secret := "postgres://user:very-secret-password@db.example/takein_identity"
	getenv := func(name string) string {
		if name == "TAKEIN_IDENTITY_POSTGRES_DSN" {
			return secret
		}
		if name == "MIGRATIONS_ROOT" {
			return "/migrations"
		}
		return ""
	}
	stat := func(string) (os.FileInfo, error) { return directoryInfo{}, nil }

	_, err := loadTargets([]string{"identity", "provider"}, getenv, stat)
	if err == nil || !strings.Contains(err.Error(), "TAKEIN_PROVIDER_POSTGRES_DSN") {
		t.Fatalf("expected missing provider DSN error, got %v", err)
	}
	if strings.Contains(err.Error(), secret) || strings.Contains(err.Error(), "very-secret-password") {
		t.Fatalf("error leaked a DSN: %v", err)
	}
}

type directoryInfo struct{}

func (directoryInfo) Name() string       { return "migrations" }
func (directoryInfo) Size() int64        { return 0 }
func (directoryInfo) Mode() fs.FileMode  { return fs.ModeDir | 0o555 }
func (directoryInfo) ModTime() time.Time { return time.Time{} }
func (directoryInfo) IsDir() bool        { return true }
func (directoryInfo) Sys() any           { return nil }
