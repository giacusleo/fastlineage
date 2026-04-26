select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_web_conversions') }} as base
left join {{ ref('stg_web_pageviews') }} as source_anchor on source_anchor.record_id = base.record_id
left join {{ ref('payment_terms') }} as seed_map on 1 = 1
