select
  cast(id as string) as record_id,
  'app' as source_system,
  'feature_flags' as entity_name,
  current_timestamp as source_updated_at
from {{ source('app', 'feature_flags') }}
