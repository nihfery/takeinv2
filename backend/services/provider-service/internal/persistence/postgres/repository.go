package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	eventscommonv1 "github.com/nihfery/takein/gen/go/takein/events/common/v1"
	providereventsv1 "github.com/nihfery/takein/gen/go/takein/events/provider/v1"
	"github.com/nihfery/takein/services/provider-service/internal/provider"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

const profileColumns = `id,user_id,display_name,NULLIF(image,''),phone_number,category,status,onboarding_status,document_status,document_note,ktp_object_id::text,nib_number,nib_object_id::text,business_object_id::text,trial_starts_at,trial_ends_at,created_at,updated_at`
const branchColumns = `id,provider_id,branch_name,email,COALESCE(phone_code,''),phone_number,address,country_id,state_id,city_id,latitude::float8,longitude::float8,zip_code,COALESCE(to_char(working_start_hour,'HH24:MI'),''),COALESCE(to_char(working_end_hour,'HH24:MI'),''),COALESCE(working_days,'[]'::jsonb),COALESCE(holidays,'[]'::jsonb),image_object_id::text,COALESCE(image_object_ids,'[]'::jsonb),status,created_at,updated_at`
const staffColumns = `id,provider_id,branch_id,image_object_id::text,first_name,last_name,email,username,country_code,phone_number,gender,date_of_birth::text,address,country_id,state_id,city_id,postal_code,bio,category_id,role,current_status,status,created_at,updated_at`
const roleColumns = `id,provider_id,branch_id,identity_user_id,role_name,slug,description,status,COALESCE(account_name,''),COALESCE(account_email,''),created_at,updated_at`

func (r *Repository) ProfileByUser(ctx context.Context, userID int64) (provider.Profile, error) {
	return scanProfile(r.pool.QueryRow(ctx, `SELECT `+profileColumns+` FROM provider_profiles WHERE user_id=$1`, userID))
}

func (r *Repository) ProfileByID(ctx context.Context, id int64) (provider.Profile, error) {
	return scanProfile(r.pool.QueryRow(ctx, `SELECT `+profileColumns+` FROM provider_profiles WHERE id=$1`, id))
}

func (r *Repository) UpdateProfile(ctx context.Context, id int64, values map[string]any) (provider.Profile, error) {
	return r.mutateProfile(ctx, id, "provider.profile_updated", `UPDATE provider_profiles SET
		display_name=COALESCE($2,display_name),phone_number=COALESCE($3,phone_number),category=COALESCE($4,category),onboarding_status=COALESCE($5,onboarding_status),image=COALESCE($6,image),updated_at=now()
		WHERE id=$1 RETURNING `+profileColumns, nullableString(values["name"]), nullableString(values["phone_number"]), nullableString(values["category"]), nullableString(values["onboarding_status"]), nullableString(values["image_object_id"]))
}

func (r *Repository) UpdateDocuments(ctx context.Context, id int64, values map[string]any) (provider.Profile, error) {
	return r.mutateProfile(ctx, id, "provider.documents_submitted", `UPDATE provider_profiles SET
		ktp_object_id=COALESCE($2,ktp_object_id),nib_number=COALESCE($3,nib_number),nib_object_id=COALESCE($4,nib_object_id),
		business_object_id=COALESCE($5,business_object_id),document_status='pending',document_submitted_at=now(),updated_at=now()
		WHERE id=$1 RETURNING `+profileColumns, nullableUUID(values["ktp_object_id"]), nullableString(values["nib_number"]), nullableUUID(values["nib_object_id"]), nullableUUID(values["business_object_id"]))
}

func (r *Repository) mutateProfile(ctx context.Context, id int64, eventType, query string, args ...any) (provider.Profile, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return provider.Profile{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	profile, err := scanProfile(tx.QueryRow(ctx, query, append([]any{id}, args...)...))
	if err != nil {
		return provider.Profile{}, translate(err)
	}
	if err := outbox(ctx, tx, "provider", id, eventType, profile); err != nil {
		return provider.Profile{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return provider.Profile{}, err
	}
	return profile, nil
}

func (r *Repository) ListBranches(ctx context.Context, providerID int64) ([]provider.Branch, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+branchColumns+` FROM provider_branches WHERE provider_id=$1 ORDER BY id LIMIT 500`, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []provider.Branch{}
	for rows.Next() {
		item, scanErr := scanBranch(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (r *Repository) Branch(ctx context.Context, id int64) (provider.Branch, error) {
	return scanBranch(r.pool.QueryRow(ctx, `SELECT `+branchColumns+` FROM provider_branches WHERE id=$1`, id))
}

func (r *Repository) CreateBranch(ctx context.Context, providerID int64, input provider.BranchInput) (provider.Branch, error) {
	return r.mutateBranch(ctx, providerID, 0, input, true, 0)
}

func (r *Repository) CreateBranchWithLimit(ctx context.Context, providerID int64, input provider.BranchInput, maxBranches int32) (provider.Branch, error) {
	if maxBranches <= 0 {
		return provider.Branch{}, provider.ErrForbidden
	}
	return r.mutateBranch(ctx, providerID, 0, input, true, maxBranches)
}

func (r *Repository) UpdateBranch(ctx context.Context, providerID, id int64, input provider.BranchInput) (provider.Branch, error) {
	return r.mutateBranch(ctx, providerID, id, input, false, 0)
}

func (r *Repository) mutateBranch(ctx context.Context, providerID, id int64, input provider.BranchInput, create bool, maxBranches int32) (provider.Branch, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return provider.Branch{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if create && maxBranches > 0 {
		if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, providerID); err != nil {
			return provider.Branch{}, err
		}
		var count int32
		if err = tx.QueryRow(ctx, `SELECT count(*) FROM provider_branches WHERE provider_id=$1`, providerID).Scan(&count); err != nil {
			return provider.Branch{}, err
		}
		if count >= maxBranches {
			return provider.Branch{}, provider.ErrConflict
		}
	}
	var row pgx.Row
	eventType := "provider.branch_updated"
	if create {
		row = tx.QueryRow(ctx, `INSERT INTO provider_branches(provider_id,branch_name,email,phone_code,phone_number,address,country_id,state_id,city_id,latitude,longitude,zip_code,working_start_hour,working_end_hour,working_days,holidays,image_object_id,image_object_ids,status)
			VALUES($1,$2,NULLIF($3,''),COALESCE(NULLIF($4,''),'+1'),NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),$10,$11,NULLIF($12,''),NULLIF($13,'')::time,NULLIF($14,'')::time,COALESCE($15::jsonb,'[]'::jsonb),COALESCE($16::jsonb,'[]'::jsonb),NULLIF($17,'')::uuid,COALESCE($18::jsonb,'[]'::jsonb),COALESCE(NULLIF($19,''),'active')) RETURNING `+branchColumns,
			providerID, input.Name, input.Email, input.PhoneCode, input.PhoneNumber, input.Address, input.CountryID, input.StateID, input.CityID, input.Latitude, input.Longitude, input.ZipCode, input.WorkingStartHour, input.WorkingEndHour, jsonValue(input.WorkingDays), jsonValue(input.Holidays), stringValue(input.ImageObjectID), jsonValue(input.ImageObjectIDs), input.Status)
		eventType = "provider.branch_created"
	} else {
		row = tx.QueryRow(ctx, `UPDATE provider_branches SET branch_name=COALESCE(NULLIF($3,''),branch_name),email=COALESCE(NULLIF($4,''),email),phone_code=COALESCE(NULLIF($5,''),phone_code),phone_number=COALESCE(NULLIF($6,''),phone_number),address=COALESCE(NULLIF($7,''),address),country_id=COALESCE(NULLIF($8,''),country_id),state_id=COALESCE(NULLIF($9,''),state_id),city_id=COALESCE(NULLIF($10,''),city_id),latitude=COALESCE($11,latitude),longitude=COALESCE($12,longitude),zip_code=COALESCE(NULLIF($13,''),zip_code),working_start_hour=COALESCE(NULLIF($14,'')::time,working_start_hour),working_end_hour=COALESCE(NULLIF($15,'')::time,working_end_hour),working_days=COALESCE($16::jsonb,working_days),holidays=COALESCE($17::jsonb,holidays),image_object_id=COALESCE(NULLIF($18,'')::uuid,image_object_id),image_object_ids=COALESCE($19::jsonb,image_object_ids),status=COALESCE(NULLIF($20,''),status),updated_at=now() WHERE id=$1 AND provider_id=$2 RETURNING `+branchColumns,
			id, providerID, input.Name, input.Email, input.PhoneCode, input.PhoneNumber, input.Address, input.CountryID, input.StateID, input.CityID, input.Latitude, input.Longitude, input.ZipCode, input.WorkingStartHour, input.WorkingEndHour, jsonValueOrNil(input.WorkingDays), jsonValueOrNil(input.Holidays), stringValue(input.ImageObjectID), jsonValueOrNil(input.ImageObjectIDs), input.Status)
	}
	branch, err := scanBranch(row)
	if err != nil {
		return provider.Branch{}, translate(err)
	}
	if err := outbox(ctx, tx, "branch", branch.ID, eventType, branch); err != nil {
		return provider.Branch{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return provider.Branch{}, err
	}
	return branch, nil
}

func (r *Repository) DeleteBranch(ctx context.Context, providerID, id int64) error {
	return r.deleteScoped(ctx, `DELETE FROM provider_branches WHERE id=$1 AND provider_id=$2`, id, providerID, "branch", "provider.branch_deleted")
}

func (r *Repository) AssignBranchStaff(ctx context.Context, providerID, branchID int64, staffIDs []int64) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = tx.Exec(ctx, `UPDATE provider_staffs SET branch_id=NULL,updated_at=now() WHERE provider_id=$1 AND branch_id=$2`, providerID, branchID); err != nil {
		return err
	}
	if len(staffIDs) > 0 {
		result, updateErr := tx.Exec(ctx, `UPDATE provider_staffs SET branch_id=$2,updated_at=now() WHERE provider_id=$1 AND id=ANY($3)`, providerID, branchID, staffIDs)
		if updateErr != nil {
			return updateErr
		}
		if result.RowsAffected() != int64(len(staffIDs)) {
			return provider.ErrForbidden
		}
	}
	if err = outbox(ctx, tx, "branch", branchID, "provider.branch_staff_assigned", map[string]any{"staff_ids": staffIDs}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *Repository) ListStaff(ctx context.Context, providerID int64) ([]provider.Staff, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+staffColumns+` FROM provider_staffs WHERE provider_id=$1 ORDER BY id LIMIT 500`, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []provider.Staff{}
	for rows.Next() {
		item, scanErr := scanStaff(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (r *Repository) Staff(ctx context.Context, id int64) (provider.Staff, error) {
	return scanStaff(r.pool.QueryRow(ctx, `SELECT `+staffColumns+` FROM provider_staffs WHERE id=$1`, id))
}

func (r *Repository) CreateStaff(ctx context.Context, providerID int64, input provider.StaffInput) (provider.Staff, error) {
	return r.mutateStaff(ctx, providerID, 0, input, true)
}
func (r *Repository) UpdateStaff(ctx context.Context, providerID, id int64, input provider.StaffInput) (provider.Staff, error) {
	return r.mutateStaff(ctx, providerID, id, input, false)
}

func (r *Repository) mutateStaff(ctx context.Context, providerID, id int64, input provider.StaffInput, create bool) (provider.Staff, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return provider.Staff{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var row pgx.Row
	eventType := "provider.staff_updated"
	if create {
		row = tx.QueryRow(ctx, `INSERT INTO provider_staffs(provider_id,branch_id,image_object_id,first_name,last_name,email,username,country_code,phone_number,gender,date_of_birth,address,country_id,state_id,city_id,postal_code,bio,category_id,role,status)
			SELECT $1,$2,NULLIF($3,'')::uuid,$4,$5,$6,NULLIF($7,''),NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),NULLIF($11,'')::date,NULLIF($12,''),NULLIF($13,''),NULLIF($14,''),NULLIF($15,''),NULLIF($16,''),NULLIF($17,''),$18,COALESCE(NULLIF($19,''),'staff'),COALESCE(NULLIF($20,''),'active')
			WHERE EXISTS(SELECT 1 FROM provider_branches WHERE id=$2 AND provider_id=$1 AND status='active') RETURNING `+staffColumns,
			providerID, input.BranchID, stringValue(input.ImageObjectID), input.FirstName, input.LastName, input.Email, input.Username, input.CountryCode, input.PhoneNumber, input.Gender, input.DateOfBirth, input.Address, input.CountryID, input.StateID, input.CityID, input.PostalCode, input.Bio, input.CategoryID, input.Role, input.Status)
		eventType = "provider.staff_created"
	} else {
		row = tx.QueryRow(ctx, `UPDATE provider_staffs SET branch_id=COALESCE($3,branch_id),image_object_id=COALESCE(NULLIF($4,'')::uuid,image_object_id),first_name=COALESCE(NULLIF($5,''),first_name),last_name=COALESCE(NULLIF($6,''),last_name),email=COALESCE(NULLIF($7,''),email),username=COALESCE(NULLIF($8,''),username),country_code=COALESCE(NULLIF($9,''),country_code),phone_number=COALESCE(NULLIF($10,''),phone_number),gender=COALESCE(NULLIF($11,''),gender),date_of_birth=COALESCE(NULLIF($12,'')::date,date_of_birth),address=COALESCE(NULLIF($13,''),address),country_id=COALESCE(NULLIF($14,''),country_id),state_id=COALESCE(NULLIF($15,''),state_id),city_id=COALESCE(NULLIF($16,''),city_id),postal_code=COALESCE(NULLIF($17,''),postal_code),bio=COALESCE(NULLIF($18,''),bio),category_id=COALESCE($19,category_id),role=COALESCE(NULLIF($20,''),role),status=COALESCE(NULLIF($21,''),status),updated_at=now()
			WHERE id=$1 AND provider_id=$2 AND ($3::bigint IS NULL OR EXISTS(SELECT 1 FROM provider_branches WHERE id=$3 AND provider_id=$2 AND status='active')) RETURNING `+staffColumns,
			id, providerID, input.BranchID, stringValue(input.ImageObjectID), input.FirstName, input.LastName, input.Email, input.Username, input.CountryCode, input.PhoneNumber, input.Gender, input.DateOfBirth, input.Address, input.CountryID, input.StateID, input.CityID, input.PostalCode, input.Bio, input.CategoryID, input.Role, input.Status)
	}
	staff, err := scanStaff(row)
	if err != nil {
		return provider.Staff{}, translate(err)
	}
	if err = outbox(ctx, tx, "staff", staff.ID, eventType, staff); err != nil {
		return provider.Staff{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return provider.Staff{}, err
	}
	return staff, nil
}

func (r *Repository) DeleteStaff(ctx context.Context, providerID, id int64) error {
	return r.deleteScoped(ctx, `DELETE FROM provider_staffs WHERE id=$1 AND provider_id=$2`, id, providerID, "staff", "provider.staff_deleted")
}

func (r *Repository) StaffSkills(ctx context.Context, staffID int64) ([]int64, error) {
	rows, err := r.pool.Query(ctx, `SELECT service_id FROM staff_skills WHERE staff_id=$1 ORDER BY service_id`, staffID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	serviceIDs := []int64{}
	for rows.Next() {
		var serviceID int64
		if err = rows.Scan(&serviceID); err != nil {
			return nil, err
		}
		serviceIDs = append(serviceIDs, serviceID)
	}
	return serviceIDs, rows.Err()
}

func (r *Repository) ReplaceStaffSkills(ctx context.Context, providerID, staffID int64, serviceIDs []int64) ([]int64, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	staff, err := scanStaff(tx.QueryRow(ctx, `SELECT `+staffColumns+` FROM provider_staffs WHERE id=$1 AND provider_id=$2 FOR UPDATE`, staffID, providerID))
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM staff_skills WHERE staff_id=$1`, staffID); err != nil {
		return nil, err
	}
	for _, serviceID := range serviceIDs {
		if _, err = tx.Exec(ctx, `INSERT INTO staff_skills(staff_id,service_id) VALUES($1,$2)`, staffID, serviceID); err != nil {
			return nil, translate(err)
		}
	}
	if err = outbox(ctx, tx, "staff", staffID, "provider.staff_skills_replaced", staff); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return serviceIDs, nil
}

func (r *Repository) StaffSchedules(ctx context.Context, staffID int64) ([]provider.StaffSchedule, error) {
	return staffSchedules(ctx, r.pool, staffID)
}

func (r *Repository) ReplaceStaffSchedules(ctx context.Context, providerID, staffID int64, inputs []provider.ScheduleInput) ([]provider.StaffSchedule, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	staff, err := scanStaff(tx.QueryRow(ctx, `SELECT `+staffColumns+` FROM provider_staffs WHERE id=$1 AND provider_id=$2 FOR UPDATE`, staffID, providerID))
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM staff_schedules WHERE staff_id=$1`, staffID); err != nil {
		return nil, err
	}
	for _, input := range inputs {
		isAvailable := true
		if input.IsAvailable != nil {
			isAvailable = *input.IsAvailable
		}
		if _, err = tx.Exec(ctx, `INSERT INTO staff_schedules(staff_id,day_of_week,start_time,end_time,is_available) VALUES($1,$2,$3::time,$4::time,$5)`, staffID, input.DayOfWeek, input.StartTime, input.EndTime, isAvailable); err != nil {
			return nil, translate(err)
		}
	}
	if err = outbox(ctx, tx, "staff", staffID, "provider.staff_schedules_replaced", staff); err != nil {
		return nil, err
	}
	items, err := staffSchedules(ctx, tx, staffID)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *Repository) ListRoles(ctx context.Context, providerID int64) ([]provider.Role, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+roleColumns+` FROM provider_roles WHERE provider_id=$1 ORDER BY role_name,id LIMIT 500`, providerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []provider.Role{}
	for rows.Next() {
		item, scanErr := scanRole(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		permissions, permissionErr := r.rolePermissions(ctx, item.ID)
		if permissionErr != nil {
			return nil, permissionErr
		}
		item.MenuKeys = permissions
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) Role(ctx context.Context, id int64) (provider.Role, error) {
	item, err := scanRole(r.pool.QueryRow(ctx, `SELECT `+roleColumns+` FROM provider_roles WHERE id=$1`, id))
	if err != nil {
		return provider.Role{}, err
	}
	item.MenuKeys, err = r.rolePermissions(ctx, item.ID)
	return item, err
}

func (r *Repository) CreateRole(ctx context.Context, providerID int64, input provider.RoleInput) (provider.Role, error) {
	return r.mutateRole(ctx, providerID, 0, input, true)
}

func (r *Repository) UpdateRole(ctx context.Context, providerID, id int64, input provider.RoleInput) (provider.Role, error) {
	return r.mutateRole(ctx, providerID, id, input, false)
}

func (r *Repository) mutateRole(ctx context.Context, providerID, id int64, input provider.RoleInput, create bool) (provider.Role, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return provider.Role{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	slug := slugify(input.RoleName)
	if slug == "" {
		slug = "role"
	}
	base := slug
	for suffix := 2; ; suffix++ {
		var exists bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM provider_roles WHERE provider_id=$1 AND slug=$2 AND ($3::bigint=0 OR id<>$3))`, providerID, slug, id).Scan(&exists)
		if err != nil || !exists {
			break
		}
		slug = fmt.Sprintf("%s-%d", base, suffix)
	}
	if err != nil {
		return provider.Role{}, err
	}
	var row pgx.Row
	eventType := "provider.role_updated"
	if create {
		row = tx.QueryRow(ctx, `INSERT INTO provider_roles(provider_id,branch_id,role_name,slug,description,status,account_name,account_email)
			SELECT $1,$2,$3,$4,NULLIF($5,''),$6,$7,$8 WHERE EXISTS(SELECT 1 FROM provider_branches WHERE id=$2 AND provider_id=$1)
			RETURNING `+roleColumns, providerID, input.BranchID, input.RoleName, slug, input.Description, input.Status, input.AccountName, input.AccountEmail)
		eventType = "provider.role_created"
	} else {
		row = tx.QueryRow(ctx, `UPDATE provider_roles SET branch_id=$3,role_name=$4,slug=$5,description=NULLIF($6,''),status=$7,account_name=$8,account_email=$9,updated_at=now()
			WHERE id=$1 AND provider_id=$2 AND EXISTS(SELECT 1 FROM provider_branches WHERE id=$3 AND provider_id=$2)
			RETURNING `+roleColumns, id, providerID, input.BranchID, input.RoleName, slug, input.Description, input.Status, input.AccountName, input.AccountEmail)
	}
	item, err := scanRole(row)
	if err != nil {
		return provider.Role{}, translate(err)
	}
	if _, err = tx.Exec(ctx, `DELETE FROM provider_role_menu_permissions WHERE provider_role_id=$1`, item.ID); err != nil {
		return provider.Role{}, err
	}
	item.MenuKeys = uniqueStrings(input.MenuKeys)
	for _, key := range item.MenuKeys {
		if _, err = tx.Exec(ctx, `INSERT INTO provider_role_menu_permissions(provider_role_id,menu_key) VALUES($1,$2)`, item.ID, key); err != nil {
			return provider.Role{}, translate(err)
		}
	}
	if err = outbox(ctx, tx, "provider_role", item.ID, eventType, item); err != nil {
		return provider.Role{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return provider.Role{}, err
	}
	return item, nil
}

func (r *Repository) AttachRoleIdentity(ctx context.Context, providerID, id, identityUserID int64) (provider.Role, error) {
	item, err := scanRole(r.pool.QueryRow(ctx, `UPDATE provider_roles SET identity_user_id=$3,updated_at=now() WHERE id=$1 AND provider_id=$2 RETURNING `+roleColumns, id, providerID, identityUserID))
	if err != nil {
		return provider.Role{}, translate(err)
	}
	item.MenuKeys, err = r.rolePermissions(ctx, item.ID)
	return item, err
}

func (r *Repository) SetRoleStatus(ctx context.Context, providerID, id int64, status string) (provider.Role, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return provider.Role{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	item, err := scanRole(tx.QueryRow(ctx, `UPDATE provider_roles SET status=$3,updated_at=now() WHERE id=$1 AND provider_id=$2 RETURNING `+roleColumns, id, providerID, status))
	if err != nil {
		return provider.Role{}, translate(err)
	}
	item.MenuKeys, err = rolePermissions(ctx, tx, item.ID)
	if err != nil {
		return provider.Role{}, err
	}
	if err = outbox(ctx, tx, "provider_role", item.ID, "provider.role_status_changed", item); err != nil {
		return provider.Role{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return provider.Role{}, err
	}
	return item, nil
}

func (r *Repository) rolePermissions(ctx context.Context, roleID int64) ([]string, error) {
	return rolePermissions(ctx, r.pool, roleID)
}

func rolePermissions(ctx context.Context, database queryer, roleID int64) ([]string, error) {
	rows, err := database.Query(ctx, `SELECT menu_key FROM provider_role_menu_permissions WHERE provider_role_id=$1 ORDER BY menu_key`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []string{}
	for rows.Next() {
		var item string
		if err = rows.Scan(&item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

type queryer interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func staffSchedules(ctx context.Context, database queryer, staffID int64) ([]provider.StaffSchedule, error) {
	rows, err := database.Query(ctx, `SELECT id,staff_id,day_of_week,to_char(start_time,'HH24:MI'),to_char(end_time,'HH24:MI'),is_available FROM staff_schedules WHERE staff_id=$1 ORDER BY day_of_week,start_time,id`, staffID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []provider.StaffSchedule{}
	for rows.Next() {
		var item provider.StaffSchedule
		if err = rows.Scan(&item.ID, &item.StaffID, &item.DayOfWeek, &item.StartTime, &item.EndTime, &item.IsAvailable); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *Repository) deleteScoped(ctx context.Context, query string, id, providerID int64, aggregate, eventType string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	result, err := tx.Exec(ctx, query, id, providerID)
	if err != nil {
		return translate(err)
	}
	if result.RowsAffected() != 1 {
		return provider.ErrNotFound
	}
	if err = outbox(ctx, tx, aggregate, id, eventType, map[string]any{"id": id}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *Repository) ListProviders(ctx context.Context) ([]provider.Profile, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+profileColumns+` FROM provider_profiles ORDER BY id LIMIT 500`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []provider.Profile{}
	for rows.Next() {
		item, scanErr := scanProfile(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (r *Repository) SetDocumentStatus(ctx context.Context, id int64, status, note string) (provider.Profile, error) {
	return r.mutateProfile(ctx, id, "provider.document_status_changed", `UPDATE provider_profiles SET document_status=$2,document_note=NULLIF($3,''),document_verified_at=CASE WHEN $2='verified' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1 RETURNING `+profileColumns, status, note)
}

func (r *Repository) ToggleProviderStatus(ctx context.Context, id int64) (provider.Profile, error) {
	return r.mutateProfile(ctx, id, "provider.status_changed", `UPDATE provider_profiles SET status=CASE status WHEN 'active' THEN 'inactive' ELSE 'active' END,updated_at=now() WHERE id=$1 RETURNING `+profileColumns)
}

func (r *Repository) DeleteProvider(ctx context.Context, id int64) error {
	return r.deleteScoped(ctx, `DELETE FROM provider_profiles WHERE id=$1 AND id=$2`, id, id, "provider", "provider.deleted")
}

func (r *Repository) ResolveEligibleStaff(ctx context.Context, providerID, branchID int64, serviceIDs []int64, startsAt, endsAt time.Time) ([]provider.EligibleStaff, error) {
	rows, err := r.pool.Query(ctx, `SELECT s.id,s.provider_id,s.branch_id,s.first_name,s.last_name,s.email,s.role,s.status,s.created_at,s.updated_at,
		COALESCE(array_agg(DISTINCT sk.service_id) FILTER (WHERE sk.service_id IS NOT NULL),'{}'::bigint[])
	FROM provider_staffs s
	JOIN provider_branches b ON b.id=s.branch_id AND b.provider_id=s.provider_id
	LEFT JOIN staff_skills sk ON sk.staff_id=s.id
	WHERE s.provider_id=$1 AND s.branch_id=$2 AND s.status='active' AND b.status='active'
	  AND s.current_status<>'offline'
	  AND (
		COALESCE(jsonb_array_length(b.working_days),0)=0 OR EXISTS (
			SELECT 1 FROM jsonb_array_elements_text(b.working_days) day
			WHERE lower(day) IN (
				lower(trim(to_char($4 AT TIME ZONE 'Asia/Bangkok','Day'))),
				lower(trim(to_char($4 AT TIME ZONE 'Asia/Bangkok','Dy'))),
				extract(dow FROM $4 AT TIME ZONE 'Asia/Bangkok')::int::text,
				(CASE extract(dow FROM $4 AT TIME ZONE 'Asia/Bangkok')::int
					WHEN 0 THEN 'minggu' WHEN 1 THEN 'senin' WHEN 2 THEN 'selasa' WHEN 3 THEN 'rabu'
					WHEN 4 THEN 'kamis' WHEN 5 THEN 'jumat' WHEN 6 THEN 'sabtu' END)
			)
		)
	  )
	  AND NOT EXISTS (
		SELECT 1 FROM jsonb_array_elements_text(COALESCE(b.holidays,'[]'::jsonb)) holiday
		WHERE holiday=to_char($4 AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD')
	  )
	  AND (
		EXISTS (
			SELECT 1 FROM staff_schedules schedule
			WHERE schedule.staff_id=s.id AND schedule.is_available
			  AND lower(schedule.day_of_week) IN (
				lower(trim(to_char($4 AT TIME ZONE 'Asia/Bangkok','Day'))),
				lower(trim(to_char($4 AT TIME ZONE 'Asia/Bangkok','Dy'))),
				extract(dow FROM $4 AT TIME ZONE 'Asia/Bangkok')::int::text,
				(CASE extract(dow FROM $4 AT TIME ZONE 'Asia/Bangkok')::int
					WHEN 0 THEN 'minggu' WHEN 1 THEN 'senin' WHEN 2 THEN 'selasa' WHEN 3 THEN 'rabu'
					WHEN 4 THEN 'kamis' WHEN 5 THEN 'jumat' WHEN 6 THEN 'sabtu' END)
			  )
			  AND GREATEST(schedule.start_time,COALESCE(b.working_start_hour,'09:00'::time))<=($4 AT TIME ZONE 'Asia/Bangkok')::time
			  AND LEAST(schedule.end_time,COALESCE(b.working_end_hour,'18:00'::time))>=($5 AT TIME ZONE 'Asia/Bangkok')::time
		) OR (
			NOT EXISTS (
				SELECT 1 FROM staff_schedules schedule
				WHERE schedule.staff_id=s.id AND schedule.is_available
				  AND lower(schedule.day_of_week) IN (
					lower(trim(to_char($4 AT TIME ZONE 'Asia/Bangkok','Day'))),
					lower(trim(to_char($4 AT TIME ZONE 'Asia/Bangkok','Dy'))),
					extract(dow FROM $4 AT TIME ZONE 'Asia/Bangkok')::int::text,
					(CASE extract(dow FROM $4 AT TIME ZONE 'Asia/Bangkok')::int
						WHEN 0 THEN 'minggu' WHEN 1 THEN 'senin' WHEN 2 THEN 'selasa' WHEN 3 THEN 'rabu'
						WHEN 4 THEN 'kamis' WHEN 5 THEN 'jumat' WHEN 6 THEN 'sabtu' END)
				  )
			)
			AND COALESCE(b.working_start_hour,'09:00'::time)<=($4 AT TIME ZONE 'Asia/Bangkok')::time
			AND COALESCE(b.working_end_hour,'18:00'::time)>=($5 AT TIME ZONE 'Asia/Bangkok')::time
		)
	  )
	GROUP BY s.id
	HAVING count(DISTINCT sk.service_id) FILTER (WHERE sk.service_id=ANY($3::bigint[]))=cardinality($3::bigint[])
	ORDER BY s.id LIMIT 500`, providerID, branchID, serviceIDs, startsAt, endsAt)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []provider.EligibleStaff{}
	for rows.Next() {
		var item provider.EligibleStaff
		if err = rows.Scan(&item.Staff.ID, &item.Staff.ProviderID, &item.Staff.BranchID, &item.Staff.FirstName, &item.Staff.LastName, &item.Staff.Email, &item.Staff.Role, &item.Staff.Status, &item.Staff.CreatedAt, &item.Staff.UpdatedAt, &item.ServiceIDs); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

type rowScanner interface{ Scan(...any) error }

func scanProfile(row rowScanner) (provider.Profile, error) {
	var value provider.Profile
	err := row.Scan(&value.ID, &value.UserID, &value.DisplayName, &value.ImageObjectID, &value.PhoneNumber, &value.Category, &value.Status, &value.OnboardingStatus, &value.DocumentStatus, &value.DocumentNote, &value.KTPObjectID, &value.NIBNumber, &value.NIBObjectID, &value.BusinessObjectID, &value.TrialStartsAt, &value.TrialEndsAt, &value.CreatedAt, &value.UpdatedAt)
	return value, translate(err)
}
func scanBranch(row rowScanner) (provider.Branch, error) {
	var value provider.Branch
	var workingDays, holidays, imageObjectIDs []byte
	err := row.Scan(&value.ID, &value.ProviderID, &value.Name, &value.Email, &value.PhoneCode, &value.PhoneNumber, &value.Address, &value.CountryID, &value.StateID, &value.CityID, &value.Latitude, &value.Longitude, &value.ZipCode, &value.WorkingStartHour, &value.WorkingEndHour, &workingDays, &holidays, &value.ImageObjectID, &imageObjectIDs, &value.Status, &value.CreatedAt, &value.UpdatedAt)
	if err == nil {
		_ = json.Unmarshal(workingDays, &value.WorkingDays)
		_ = json.Unmarshal(holidays, &value.Holidays)
		_ = json.Unmarshal(imageObjectIDs, &value.ImageObjectIDs)
	}
	return value, translate(err)
}
func scanStaff(row rowScanner) (provider.Staff, error) {
	var value provider.Staff
	err := row.Scan(&value.ID, &value.ProviderID, &value.BranchID, &value.ImageObjectID, &value.FirstName, &value.LastName, &value.Email, &value.Username, &value.CountryCode, &value.PhoneNumber, &value.Gender, &value.DateOfBirth, &value.Address, &value.CountryID, &value.StateID, &value.CityID, &value.PostalCode, &value.Bio, &value.CategoryID, &value.Role, &value.CurrentStatus, &value.Status, &value.CreatedAt, &value.UpdatedAt)
	return value, translate(err)
}
func scanRole(row rowScanner) (provider.Role, error) {
	var value provider.Role
	err := row.Scan(&value.ID, &value.ProviderID, &value.BranchID, &value.IdentityUserID, &value.RoleName, &value.Slug, &value.Description, &value.Status, &value.AccountName, &value.AccountEmail, &value.CreatedAt, &value.UpdatedAt)
	return value, translate(err)
}

func outbox(ctx context.Context, tx pgx.Tx, aggregate string, id int64, eventType string, payload any) error {
	eventID := uuid.New()
	now := time.Now().UTC()
	metadata := &eventscommonv1.EventMetadata{EventId: eventID.String(), EventVersion: 1, OccurredAt: timestamppb.New(now), Producer: "provider-service", AggregateId: fmt.Sprint(id)}
	var message proto.Message
	switch aggregate {
	case "provider":
		status, userID, displayName, category := "", "", "", ""
		ready := false
		if value, ok := payload.(provider.Profile); ok {
			status = value.Status
			userID = fmt.Sprint(value.UserID)
			displayName = value.DisplayName
			if value.Category != nil {
				category = *value.Category
			}
			ready = value.Status == "active" && value.DocumentStatus == "verified"
		}
		message = &providereventsv1.ProviderChanged{Metadata: metadata, ProviderId: fmt.Sprint(id), ChangeType: eventType, Status: status, UserId: userID, DisplayName: displayName, Category: category, Ready: ready}
	case "branch":
		providerID, status, name, address := "", "", "", ""
		ready := false
		if value, ok := payload.(provider.Branch); ok {
			providerID, status = fmt.Sprint(value.ProviderID), value.Status
			name = value.Name
			if value.Address != nil {
				address = *value.Address
			}
			var providerReady bool
			_ = tx.QueryRow(ctx, `SELECT status='active' AND document_status='verified' FROM provider_profiles WHERE id=$1`, value.ProviderID).Scan(&providerReady)
			ready = status == "active" && providerReady
		}
		message = &providereventsv1.BranchChanged{Metadata: metadata, ProviderId: providerID, BranchId: fmt.Sprint(id), Status: status, ChangeType: eventType, BranchName: name, Address: address, Ready: ready}
	case "staff":
		providerID, status, branchID, displayName := "", "", "", ""
		serviceIDs := []string{}
		if value, ok := payload.(provider.Staff); ok {
			providerID, status = fmt.Sprint(value.ProviderID), value.Status
			displayName = strings.TrimSpace(value.FirstName + " " + value.LastName)
			if value.BranchID != nil {
				branchID = fmt.Sprint(*value.BranchID)
			}
			rows, queryErr := tx.Query(ctx, `SELECT service_id::text FROM staff_skills WHERE staff_id=$1 ORDER BY service_id`, value.ID)
			if queryErr == nil {
				defer rows.Close()
				for rows.Next() {
					var serviceID string
					if rows.Scan(&serviceID) == nil {
						serviceIDs = append(serviceIDs, serviceID)
					}
				}
			}
		}
		message = &providereventsv1.StaffChanged{Metadata: metadata, ProviderId: providerID, StaffId: fmt.Sprint(id), Status: status, ChangeType: eventType, BranchId: branchID, DisplayName: displayName, ServiceIds: serviceIDs}
	case "provider_role":
		value, ok := payload.(provider.Role)
		if !ok {
			return errors.New("provider role event payload is invalid")
		}
		identityUserID := ""
		if value.IdentityUserID != nil {
			identityUserID = fmt.Sprint(*value.IdentityUserID)
		}
		message = &providereventsv1.ProviderRoleChanged{
			Metadata: metadata, ProviderId: fmt.Sprint(value.ProviderID), ProviderRoleId: fmt.Sprint(value.ID),
			BranchId: fmt.Sprint(value.BranchID), IdentityUserId: identityUserID, RoleName: value.RoleName,
			Status: value.Status, Permissions: value.MenuKeys, ChangeType: eventType,
		}
	default:
		return fmt.Errorf("unsupported provider aggregate %q", aggregate)
	}
	body, err := proto.Marshal(message)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,event_version,payload,headers,occurred_at)VALUES($1,$2,$3,$4,1,$5,'{"content-type":"application/protobuf"}'::jsonb,$6)`, eventID, aggregate, fmt.Sprint(id), eventType, body, now)
	return err
}
func translate(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return provider.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "23505" {
			return provider.ErrConflict
		}
		if pgErr.Code == "23503" {
			return provider.ErrConflict
		}
	}
	return err
}
func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func jsonValue(value []string) string {
	if value == nil {
		value = []string{}
	}
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

func jsonValueOrNil(value []string) any {
	if value == nil {
		return nil
	}
	return jsonValue(value)
}
func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if _, exists := seen[value]; value == "" || exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var builder strings.Builder
	dash := false
	for _, character := range value {
		if character >= 'a' && character <= 'z' || character >= '0' && character <= '9' {
			builder.WriteRune(character)
			dash = false
		} else if builder.Len() > 0 && !dash {
			builder.WriteByte('-')
			dash = true
		}
	}
	return strings.Trim(builder.String(), "-")
}
func nullableString(value any) any {
	if text, ok := value.(string); ok && text != "" {
		return text
	}
	return nil
}
func nullableUUID(value any) any {
	if text, ok := value.(string); ok {
		if parsed, err := uuid.Parse(text); err == nil {
			return parsed
		}
	}
	return nil
}
