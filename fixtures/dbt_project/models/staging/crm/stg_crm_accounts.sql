select
  cast(id as string) as record_id,
  'crm' as source_system,
  'accounts' as entity_name,
  current_timestamp as source_updated_at
from {{ source('crm', 'accounts') }}
