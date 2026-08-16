package postgres

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nihfery/takein/services/provider-service/internal/provider"
)

func TestReplaceStaffSkillsAndSchedulesRemainProviderScoped(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for provider repository test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	seed := time.Now().UnixNano() % 1_000_000_000
	var providerID, branchID, staffID int64
	err = pool.QueryRow(context.Background(), `INSERT INTO provider_profiles(user_id,display_name,status,document_status) VALUES($1,$2,'active','verified') RETURNING id`, seed, fmt.Sprintf("Provider %d", seed)).Scan(&providerID)
	if err != nil {
		t.Fatal(err)
	}
	err = pool.QueryRow(context.Background(), `INSERT INTO provider_branches(provider_id,branch_name,status) VALUES($1,$2,'active') RETURNING id`, providerID, fmt.Sprintf("Branch %d", seed)).Scan(&branchID)
	if err != nil {
		t.Fatal(err)
	}
	err = pool.QueryRow(context.Background(), `INSERT INTO provider_staffs(provider_id,branch_id,first_name,last_name,email,status) VALUES($1,$2,'Staff','Test',$3,'active') RETURNING id`, providerID, branchID, fmt.Sprintf("staff-%d@example.test", seed)).Scan(&staffID)
	if err != nil {
		t.Fatal(err)
	}
	repository := New(pool)
	serviceIDs := []int64{seed + 101, seed + 102}
	actualSkills, err := repository.ReplaceStaffSkills(context.Background(), providerID, staffID, serviceIDs)
	if err != nil || len(actualSkills) != 2 {
		t.Fatalf("skills=%v err=%v", actualSkills, err)
	}
	available := true
	schedules, err := repository.ReplaceStaffSchedules(context.Background(), providerID, staffID, []provider.ScheduleInput{{DayOfWeek: "senin", StartTime: "09:00", EndTime: "17:00", IsAvailable: &available}})
	if err != nil || len(schedules) != 1 || schedules[0].StartTime != "09:00" || schedules[0].EndTime != "17:00" {
		t.Fatalf("schedules=%+v err=%v", schedules, err)
	}
	if _, err = repository.ReplaceStaffSkills(context.Background(), providerID+1, staffID, serviceIDs); !errors.Is(err, provider.ErrNotFound) {
		t.Fatalf("cross-provider mutation returned %v", err)
	}
}

func TestProviderRolePermissionsAreReplacedAndScoped(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is required for provider repository test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	seed := time.Now().UnixNano() % 1_000_000_000
	var providerID, branchID int64
	if err = pool.QueryRow(ctx, `INSERT INTO provider_profiles(user_id,display_name,status,document_status) VALUES($1,$2,'active','verified') RETURNING id`, seed+1_000_000_000, fmt.Sprintf("Role Provider %d", seed)).Scan(&providerID); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO provider_branches(provider_id,branch_name,status) VALUES($1,$2,'active') RETURNING id`, providerID, fmt.Sprintf("Role Branch %d", seed)).Scan(&branchID); err != nil {
		t.Fatal(err)
	}
	repository := New(pool)
	created, err := repository.CreateRole(ctx, providerID, provider.RoleInput{RoleName: "Front Desk", BranchID: branchID, Status: "active", MenuKeys: []string{"bookings", "queue"}})
	if err != nil || len(created.MenuKeys) != 2 {
		t.Fatalf("created=%+v err=%v", created, err)
	}
	updated, err := repository.UpdateRole(ctx, providerID, created.ID, provider.RoleInput{RoleName: "Cashier", BranchID: branchID, Status: "active", MenuKeys: []string{"payments", "payments"}})
	if err != nil || len(updated.MenuKeys) != 1 || updated.MenuKeys[0] != "payments" {
		t.Fatalf("updated=%+v err=%v", updated, err)
	}
	if _, err = repository.UpdateRole(ctx, providerID+1, created.ID, provider.RoleInput{RoleName: "Invalid", BranchID: branchID, Status: "active"}); !errors.Is(err, provider.ErrNotFound) {
		t.Fatalf("cross-provider role mutation returned %v", err)
	}
}
