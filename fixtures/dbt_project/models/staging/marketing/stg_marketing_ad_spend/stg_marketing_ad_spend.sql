select
  cast(id as string) as record_id,
  'marketing' as source_system,
  'ad_spend' as entity_name,
  current_timestamp as source_updated_at
from {{ source('marketing', 'ad_spend') }}
