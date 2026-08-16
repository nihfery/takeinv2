# Chat domain

`Chat` owns `chat_threads`, `chat_messages`, thread access rules, unread
presentation support, and server-originated `ChatMessageSent` /
`ChatThreadUpdated` events. Support owns the large admin/provider web workflow.

Provider/admin channel and attachment access require an approved/open support
thread as appropriate, explicit participant, same provider tenant, active and
verified provider status, and `chat` menu permission. Closed/rejected/foreign
threads and customer/guest actors are rejected by channel/download rules.

New image attachments are stored private; realtime payloads carry a short-lived
relative signed route, never a raw object path. Message/thread rows remain the
truth when WebSocket delivery is unavailable.
