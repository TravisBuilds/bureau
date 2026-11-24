-- Allow the Slack route to free an event_id after a processing failure so Slack's retry is processed.
CREATE POLICY slack_event_ids_delete ON bureau.slack_event_ids FOR DELETE USING (true);
GRANT DELETE ON bureau.slack_event_ids TO bureau_app;
