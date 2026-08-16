package notification

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("notification not found")

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }
func (r *Repository) List(ctx context.Context, userID int64) ([]map[string]any, error) {
	rows, err := r.pool.Query(ctx, `SELECT id,user_id,type,title,body,url,data,read_at,created_at,updated_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return pgx.CollectRows(rows, pgx.RowToMap)
}
func (r *Repository) MarkRead(ctx context.Context, userID, id int64) error {
	result, err := r.pool.Exec(ctx, `UPDATE notifications SET read_at=COALESCE(read_at,now()),updated_at=now()WHERE id=$1 AND user_id=$2`, id, userID)
	if err == nil && result.RowsAffected() != 1 {
		return ErrNotFound
	}
	return err
}
func (r *Repository) MarkAllRead(ctx context.Context, userID int64) error {
	_, err := r.pool.Exec(ctx, `UPDATE notifications SET read_at=COALESCE(read_at,now()),updated_at=now()WHERE user_id=$1 AND read_at IS NULL`, userID)
	return err
}
