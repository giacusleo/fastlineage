select
  cast(id as string) as record_id,
  'finance' as source_system,
  'budgets' as entity_name,
  current_timestamp as source_updated_at
from {{ source('finance', 'budgets') }}
