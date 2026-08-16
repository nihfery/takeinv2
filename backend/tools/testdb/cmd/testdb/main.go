package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type databaseDefinition struct {
	owner     string
	createSQL string
}

var allowedDatabases = map[string]databaseDefinition{
	"takein_catalog_test":  {owner: "takein_catalog", createSQL: "CREATE DATABASE takein_catalog_test OWNER takein_catalog"},
	"takein_booking_test":  {owner: "takein_booking", createSQL: "CREATE DATABASE takein_booking_test OWNER takein_booking"},
	"takein_payment_test":  {owner: "takein_payment", createSQL: "CREATE DATABASE takein_payment_test OWNER takein_payment"},
	"takein_provider_test": {owner: "takein_provider", createSQL: "CREATE DATABASE takein_provider_test OWNER takein_provider"},
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "test database setup:", err)
		os.Exit(1)
	}
}

func run(names []string) error {
	if len(names) == 0 {
		return errors.New("at least one approved test database name is required")
	}
	for _, name := range names {
		if _, ok := allowedDatabases[name]; !ok {
			return fmt.Errorf("database %q is not an approved local test database", name)
		}
	}

	dsn := strings.TrimSpace(os.Getenv("TAKEIN_TEST_ADMIN_DSN"))
	if dsn == "" {
		port := strings.TrimSpace(os.Getenv("TAKEIN_POSTGRES_PORT"))
		if port == "" {
			port = "15432"
		}
		password := strings.TrimSpace(os.Getenv("TAKEIN_POSTGRES_ADMIN_PASSWORD"))
		if password == "" {
			password = "takein_local_admin_only"
		}
		connectionURL := &url.URL{
			Scheme: "postgres",
			User:   url.UserPassword("takein_admin", password),
			Host:   net.JoinHostPort("127.0.0.1", port),
			Path:   "/postgres",
		}
		query := connectionURL.Query()
		query.Set("sslmode", "disable")
		connectionURL.RawQuery = query.Encode()
		dsn = connectionURL.String()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	connection, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return fmt.Errorf("connect to PostgreSQL admin database: %w", err)
	}
	defer func() { _ = connection.Close(context.Background()) }()

	for _, name := range names {
		definition := allowedDatabases[name]
		var exists bool
		if err = connection.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)", name).Scan(&exists); err != nil {
			return fmt.Errorf("check %s: %w", name, err)
		}
		if exists {
			fmt.Printf("test database ready: %s (owner %s)\n", name, definition.owner)
			continue
		}
		if _, err = connection.Exec(ctx, definition.createSQL); err != nil {
			return fmt.Errorf("create %s: %w", name, err)
		}
		fmt.Printf("test database created: %s (owner %s)\n", name, definition.owner)
	}
	return nil
}
