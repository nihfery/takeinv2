package kafkaoutbox

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/nihfery/takein/libs/go/outbox"
	"github.com/twmb/franz-go/pkg/kgo"
)

type Publisher struct{ client *kgo.Client }

func New(client *kgo.Client) *Publisher { return &Publisher{client: client} }

func (p *Publisher) Publish(ctx context.Context, event outbox.Event) error {
	domain := strings.SplitN(event.EventType, ".", 2)[0]
	switch domain {
	case "identity", "customer", "provider", "catalog", "booking", "payment", "billing", "notification", "chat", "media":
	default:
		return fmt.Errorf("unsupported outbox event domain %q", domain)
	}
	headers := []kgo.RecordHeader{
		{Key: "event_id", Value: []byte(event.ID.String())},
		{Key: "event_type", Value: []byte(event.EventType)},
		{Key: "event_version", Value: []byte(strconv.Itoa(int(event.EventVersion)))},
		{Key: "occurred_at", Value: []byte(event.OccurredAt.UTC().Format("2006-01-02T15:04:05.000000000Z07:00"))},
	}
	metadata := map[string]string{}
	if json.Unmarshal(event.Headers, &metadata) == nil {
		for key, value := range metadata {
			if key == "authorization" || key == "cookie" || key == "set-cookie" {
				continue
			}
			headers = append(headers, kgo.RecordHeader{Key: key, Value: []byte(value)})
		}
	}
	record := &kgo.Record{Topic: "takein." + domain + ".events.v1", Key: []byte(event.AggregateID), Value: event.Payload, Headers: headers}
	if err := p.client.ProduceSync(ctx, record).FirstErr(); err != nil {
		return errors.New("publish outbox event: " + err.Error())
	}
	return nil
}
