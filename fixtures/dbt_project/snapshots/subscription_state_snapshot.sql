{% snapshot subscription_state_snapshot %}
{{
  config(
    target_schema='snapshots',
    unique_key='record_id',
    strategy='check',
    check_cols=['record_id', 'tracked_state']
  )
}}

select
  record_id,
  'subscription_state_snapshot' as tracked_state,
  current_timestamp as snapshot_captured_at
from {{ ref('int_billing_subscriptions_rollup') }}

{% endsnapshot %}
