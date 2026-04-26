select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_web_pageviews') }} as base
left join {{ ref('fiscal_calendar') }} as seed_map on 1 = 1
