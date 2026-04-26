select
  cast(id as string) as record_id,
  'billing' as source_system,
  'invoice_lines' as entity_name,
  current_timestamp as source_updated_at
from {{ source('billing', 'invoice_lines') }}
