# Protobuf compatibility baseline

`baseline.binpb` is the committed Buf descriptor used by local and CI breaking-change checks:

```text
buf breaking --against contracts/proto/baseline.binpb
```

Regenerate the baseline with `buf build -o contracts/proto/baseline.binpb` only after an intentional, reviewed contract version change has been accepted. Additive fields and RPCs may be checked against the existing baseline during review; refresh the baseline after they become the new compatibility floor. Never refresh it merely to hide a breaking-change failure.
