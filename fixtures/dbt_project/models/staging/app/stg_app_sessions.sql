select
  cast(id as string) as record_id,
  'app' as source_system,
  'sessions' as entity_name,
  current_timestamp as source_updated_at
from {{ source('app', 'sessions') }}
