select
  cast(id as string) as record_id,
  'fulfillment' as source_system,
  'carriers' as entity_name,
  current_timestamp as source_updated_at
from {{ source('fulfillment', 'carriers') }}
