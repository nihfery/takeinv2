# Notification domain

`Notification` owns `app_notifications`, unread-count behavior, Next.js
notification endpoints, and `UserNotificationSent` broadcast events.

Admin/provider users may list and mark only their own notification records.
Notifications link to internal application URLs and must not contain raw
secrets/private object paths. Broadcast is server-originated via WebSocket; client
events are disabled.

Notification delivery is an asynchronous side effect. Its failure must be
visible/retryable but must not roll back committed booking or payment state.
Unread counts are derived from persistent notification records, not WebSocket
delivery acknowledgement.
