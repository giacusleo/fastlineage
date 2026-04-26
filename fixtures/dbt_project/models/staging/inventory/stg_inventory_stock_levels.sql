select
  cast(id as string) as record_id,
  'inventory' as source_system,
  'stock_levels' as entity_name,
  current_timestamp as source_updated_at
from {{ source('inventory', 'stock_levels') }}
