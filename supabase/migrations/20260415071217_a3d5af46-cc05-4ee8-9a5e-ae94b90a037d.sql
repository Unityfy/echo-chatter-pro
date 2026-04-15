
SELECT cron.schedule(
  'refresh-knowledge-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://trsccroicslqgsppbjzp.supabase.co/functions/v1/refresh-knowledge',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyc2Njcm9pY3NscWdzcHBianpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwNDg4NTEsImV4cCI6MjA5MTYyNDg1MX0.DqiVRvmeY3assobASAzE6nOEdkI6JbOJNDgx5yoJJqg"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
