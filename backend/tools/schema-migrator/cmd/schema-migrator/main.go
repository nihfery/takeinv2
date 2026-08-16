package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

var migrationOrder = []string{
	"identity",
	"provider",
	"catalog",
	"booking",
	"payment",
	"billing",
	"customer",
	"notification",
	"media",
	"chat",
	"audit",
}

type target struct {
	domain string
	dsn    string
	dir    string
}

func main() {
	if err := run(context.Background(), os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "schema-migrator: %v\n", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, output io.Writer) error {
	mode, domains, err := parseArgs(args)
	if err != nil {
		return err
	}

	targets, err := loadTargets(domains, os.Getenv, os.Stat)
	if err != nil {
		return err
	}
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("select postgres dialect: %w", err)
	}

	for _, item := range targets {
		if _, writeErr := fmt.Fprintf(output, "%s: %s\n", item.domain, mode); writeErr != nil {
			return fmt.Errorf("write migration progress: %w", writeErr)
		}
		db, openErr := sql.Open("pgx", item.dsn)
		if openErr != nil {
			return fmt.Errorf("%s: open database: %w", item.domain, openErr)
		}

		operationContext, cancel := context.WithTimeout(ctx, 10*time.Minute)
		migrationErr := migrate(operationContext, db, item.dir, mode)
		cancel()
		closeErr := db.Close()
		if migrationErr != nil {
			return fmt.Errorf("%s: %s failed: %w", item.domain, mode, migrationErr)
		}
		if closeErr != nil {
			return fmt.Errorf("%s: close database: %w", item.domain, closeErr)
		}
	}

	if _, err := fmt.Fprintln(output, "schema-migrator: PASS"); err != nil {
		return fmt.Errorf("write migration result: %w", err)
	}
	return nil
}

func migrate(ctx context.Context, db *sql.DB, directory, mode string) error {
	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	if mode == "status" {
		return goose.StatusContext(ctx, db, directory)
	}
	return goose.UpContext(ctx, db, directory)
}

func parseArgs(args []string) (string, []string, error) {
	mode := "up"
	if len(args) > 0 {
		mode = args[0]
		args = args[1:]
	}
	if mode != "up" && mode != "status" {
		return "", nil, errors.New("usage: schema-migrator [up|status] [domain ...]")
	}

	if len(args) == 0 {
		return mode, append([]string(nil), migrationOrder...), nil
	}
	requested := make(map[string]bool, len(args))
	for _, domain := range args {
		if requested[domain] {
			return "", nil, fmt.Errorf("duplicate domain %q", domain)
		}
		requested[domain] = true
	}

	ordered := make([]string, 0, len(args))
	for _, domain := range migrationOrder {
		if requested[domain] {
			ordered = append(ordered, domain)
			delete(requested, domain)
		}
	}
	if len(requested) != 0 {
		for domain := range requested {
			return "", nil, fmt.Errorf("unknown domain %q", domain)
		}
	}
	return mode, ordered, nil
}

func loadTargets(domains []string, getenv func(string) string, stat func(string) (os.FileInfo, error)) ([]target, error) {
	root := strings.TrimSpace(getenv("MIGRATIONS_ROOT"))
	if root == "" {
		root = "/migrations"
	}

	targets := make([]target, 0, len(domains))
	for _, domain := range domains {
		name := "TAKEIN_" + strings.ToUpper(domain) + "_POSTGRES_DSN"
		dsn := strings.TrimSpace(getenv(name))
		if dsn == "" {
			return nil, fmt.Errorf("required setting %s is absent", name)
		}
		directory := filepath.Join(root, domain)
		info, err := stat(directory)
		if err != nil {
			return nil, fmt.Errorf("%s migration directory: %w", domain, err)
		}
		if !info.IsDir() {
			return nil, fmt.Errorf("%s migration path is not a directory", domain)
		}
		targets = append(targets, target{domain: domain, dsn: dsn, dir: directory})
	}
	return targets, nil
}
