select
  cast(id as string) as record_id,
  'marketing' as source_system,
  'email_events' as entity_name,
  current_timestamp as source_updated_at
from {{ source('marketing', 'email_events') }}
