select
  cast(id as string) as record_id,
  'loyalty' as source_system,
  'rewards' as entity_name,
  current_timestamp as source_updated_at
from {{ source('loyalty', 'rewards') }}
