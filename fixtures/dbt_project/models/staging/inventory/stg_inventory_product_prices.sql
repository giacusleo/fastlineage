select
  cast(id as string) as record_id,
  'inventory' as source_system,
  'product_prices' as entity_name,
  current_timestamp as source_updated_at
from {{ source('inventory', 'product_prices') }}
