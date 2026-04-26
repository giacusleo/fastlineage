select
  cast(id as string) as record_id,
  'support' as source_system,
  'macros' as entity_name,
  current_timestamp as source_updated_at
from {{ source('support', 'macros') }}
