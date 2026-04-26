select
  cast(id as string) as record_id,
  'inventory' as source_system,
  'purchase_orders' as entity_name,
  current_timestamp as source_updated_at
from {{ source('inventory', 'purchase_orders') }}
