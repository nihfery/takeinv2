-- +goose Up
CREATE TABLE inbox_events (
    event_id UUID PRIMARY KEY,
    topic TEXT NOT NULL,
    partition_id INTEGER NOT NULL,
    offset_id BIGINT NOT NULL,
    event_type TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(topic, partition_id, offset_id)
);

-- +goose Down
DROP TABLE IF EXISTS inbox_events;
