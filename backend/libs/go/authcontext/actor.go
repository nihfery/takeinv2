package authcontext

import "context"

type Actor struct {
	UserID      string
	Role        string
	ProviderID  string
	BranchID    string
	Permissions []string
}

type actorKey struct{}

func WithActor(ctx context.Context, actor Actor) context.Context {
	return context.WithValue(ctx, actorKey{}, actor)
}

func ActorFrom(ctx context.Context) (Actor, bool) {
	actor, ok := ctx.Value(actorKey{}).(Actor)
	return actor, ok
}
