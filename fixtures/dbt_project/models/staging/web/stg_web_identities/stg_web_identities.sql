select
  cast(id as string) as record_id,
  'web' as source_system,
  'identities' as entity_name,
  current_timestamp as source_updated_at
from {{ source('web', 'identities') }}
