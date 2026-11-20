-- Apply on the production Supabase project after deploying the background sync endpoint.
-- Provision CRON_SECRET in Vercel Production and the same value in Vault under
-- svaveda_sheet_cron_bearer. Never put the actual credential in this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('svaveda-sheets-every-five-minutes','*/5 * * * *',$job$
  select net.http_get(
    url := 'https://svaveda-workspace-personal.vercel.app/api/sheets/cron',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='svaveda_sheet_cron_bearer'), 'Connection', 'close'),
    timeout_milliseconds := 95000
  );
$job$);
-- Inspect HTTP results as well as cron.job_run_details: a scheduled SQL success
-- means the HTTP request was queued, not that Google synchronization succeeded.
-- Emergency stop: select cron.unschedule('svaveda-sheets-every-five-minutes');
