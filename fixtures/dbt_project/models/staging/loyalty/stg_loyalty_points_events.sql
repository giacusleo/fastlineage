select
  cast(id as string) as record_id,
  'loyalty' as source_system,
  'points_events' as entity_name,
  current_timestamp as source_updated_at
from {{ source('loyalty', 'points_events') }}
