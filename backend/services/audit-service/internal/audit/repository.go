package audit

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }
func (r *Repository) Query(ctx context.Context, resourceType, resourceID, actorID string, limit int32) ([]map[string]any, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx, `SELECT id,event_id,actor_type,actor_id,action,resource_type,resource_id,provider_id,branch_id,request_id,correlation_id,trace_id,ip,user_agent,before_state,after_state,created_at FROM audit_records WHERE ($1='' OR resource_type=$1)AND($2='' OR resource_id=$2)AND($3='' OR actor_id=$3)ORDER BY created_at DESC LIMIT $4`, resourceType, resourceID, actorID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return pgx.CollectRows(rows, pgx.RowToMap)
}
