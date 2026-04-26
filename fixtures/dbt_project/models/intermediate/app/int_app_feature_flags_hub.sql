select
  base.record_id,
  base.source_system,
  base.entity_name,
  current_timestamp as transformed_at
from {{ ref('stg_app_feature_flags') }} as base
left join {{ ref('stg_app_users') }} as source_anchor on source_anchor.record_id = base.record_id
left join {{ ref('product_categories') }} as seed_map on 1 = 1
