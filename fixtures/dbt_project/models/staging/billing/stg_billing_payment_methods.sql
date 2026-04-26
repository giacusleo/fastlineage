select
  cast(id as string) as record_id,
  'billing' as source_system,
  'payment_methods' as entity_name,
  current_timestamp as source_updated_at
from {{ source('billing', 'payment_methods') }}
