select
  'fct_budget_variance' as relation_name,
  'fact' as relation_layer,
  base.record_id,
  current_timestamp as modeled_at
from {{ ref('int_finance_budgets_rollup') }} as base
left join {{ ref('fct_cash_flow') }} as rel_1 on rel_1.record_id = base.record_id
left join {{ ref('dim_campaign') }} as rel_2 on rel_2.record_id = base.record_id
left join {{ ref('region_targets') }} as rel_3 on rel_3.record_id = base.record_id
left join {{ ref('currency_rates') }} as rel_4 on rel_4.record_id = base.record_id
