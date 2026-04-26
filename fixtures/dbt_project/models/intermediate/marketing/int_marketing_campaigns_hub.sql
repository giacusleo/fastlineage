select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_marketing_campaigns') }} as base
left join {{ ref('payment_terms') }} as seed_map on 1 = 1
