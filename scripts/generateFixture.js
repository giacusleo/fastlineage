const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.join(repoRoot, 'fixtures', 'dbt_project');

const sourceGroups = [
  { source: 'app', tables: ['users', 'sessions', 'events', 'feature_flags', 'mobile_installs'] },
  { source: 'billing', tables: ['invoices', 'invoice_lines', 'subscriptions', 'refunds', 'payment_methods'] },
  { source: 'crm', tables: ['accounts', 'contacts', 'opportunities', 'territories', 'account_health'] },
  { source: 'finance', tables: ['general_ledger', 'daily_fx', 'tax_rates', 'budgets', 'expenses'] },
  { source: 'fulfillment', tables: ['shipments', 'carriers', 'delivery_events', 'returns', 'warehouses'] },
  { source: 'inventory', tables: ['products', 'product_prices', 'stock_levels', 'suppliers', 'purchase_orders'] },
  { source: 'marketing', tables: ['campaigns', 'ad_spend', 'leads', 'email_events', 'web_forms'] },
  { source: 'support', tables: ['tickets', 'ticket_events', 'csat_surveys', 'agents', 'macros'] },
  { source: 'web', tables: ['pageviews', 'experiments', 'conversions', 'identities', 'referrals'] },
  { source: 'loyalty', tables: ['members', 'rewards', 'redemptions', 'points_events', 'tiers'] }
];

const seeds = [
  { name: 'country_codes', headers: ['record_id', 'code', 'name'], rows: [['1', 'US', 'United States'], ['2', 'IT', 'Italy'], ['3', 'DE', 'Germany']] },
  { name: 'currency_rates', headers: ['record_id', 'currency_code', 'fx_to_usd'], rows: [['1', 'USD', '1.0'], ['2', 'EUR', '1.08'], ['3', 'GBP', '1.26']] },
  { name: 'marketing_channels', headers: ['record_id', 'channel', 'channel_group'], rows: [['1', 'paid_search', 'paid'], ['2', 'email', 'owned'], ['3', 'partner', 'earned']] },
  { name: 'product_categories', headers: ['record_id', 'category_code', 'category_name'], rows: [['1', 'software', 'Software'], ['2', 'hardware', 'Hardware'], ['3', 'services', 'Services']] },
  { name: 'fiscal_calendar', headers: ['record_id', 'fiscal_month', 'fiscal_quarter'], rows: [['1', '2026-01', 'Q1'], ['2', '2026-02', 'Q1'], ['3', '2026-03', 'Q1']] },
  { name: 'discount_bands', headers: ['record_id', 'band_name', 'discount_pct'], rows: [['1', 'starter', '0.05'], ['2', 'growth', '0.10'], ['3', 'strategic', '0.15']] },
  { name: 'payment_terms', headers: ['record_id', 'term_code', 'days_due'], rows: [['1', 'net_15', '15'], ['2', 'net_30', '30'], ['3', 'net_45', '45']] },
  { name: 'order_status_map', headers: ['record_id', 'status_code', 'status_group'], rows: [['1', 'pending', 'open'], ['2', 'shipped', 'closed'], ['3', 'returned', 'exception']] },
  { name: 'support_tiers', headers: ['record_id', 'tier_code', 'tier_name'], rows: [['1', 't1', 'Tier 1'], ['2', 't2', 'Tier 2'], ['3', 't3', 'Tier 3']] },
  { name: 'region_targets', headers: ['record_id', 'region_code', 'target_revenue'], rows: [['1', 'NA', '1000000'], ['2', 'EMEA', '900000'], ['3', 'APAC', '750000']] },
  { name: 'warehouse_capacity', headers: ['record_id', 'warehouse_code', 'capacity_units'], rows: [['1', 'wh_ny', '12000'], ['2', 'wh_mi', '9500'], ['3', 'wh_ber', '8800']] },
  { name: 'loyalty_thresholds', headers: ['record_id', 'tier_code', 'points_required'], rows: [['1', 'silver', '1000'], ['2', 'gold', '2500'], ['3', 'platinum', '5000']] }
];

const snapshots = [
  { name: 'customer_status_snapshot', ref: 'int_crm_accounts_hub' },
  { name: 'account_tier_snapshot', ref: 'int_crm_account_health_rollup' },
  { name: 'product_price_snapshot', ref: 'int_inventory_product_prices_rollup' },
  { name: 'subscription_state_snapshot', ref: 'int_billing_subscriptions_rollup' },
  { name: 'support_agent_snapshot', ref: 'int_support_agents_hub' },
  { name: 'warehouse_stock_snapshot', ref: 'int_inventory_stock_levels_rollup' },
  { name: 'campaign_budget_snapshot', ref: 'int_marketing_campaigns_rollup' },
  { name: 'loyalty_tier_snapshot', ref: 'int_loyalty_tiers_rollup' }
];

const dimensions = [
  { name: 'dim_customer', refs: ['int_crm_accounts_hub', 'int_loyalty_members_rollup', 'customer_status_snapshot', 'country_codes'] },
  { name: 'dim_account', refs: ['int_crm_opportunities_rollup', 'int_crm_territories_hub', 'account_tier_snapshot', 'region_targets'] },
  { name: 'dim_product', refs: ['int_inventory_products_hub', 'int_inventory_product_prices_rollup', 'product_price_snapshot', 'product_categories'] },
  { name: 'dim_subscription', refs: ['int_billing_subscriptions_rollup', 'subscription_state_snapshot', 'payment_terms', 'discount_bands'] },
  { name: 'dim_support_agent', refs: ['int_support_agents_hub', 'support_agent_snapshot', 'support_tiers', 'region_targets'] },
  { name: 'dim_warehouse', refs: ['int_fulfillment_warehouses_hub', 'int_inventory_stock_levels_rollup', 'warehouse_stock_snapshot', 'warehouse_capacity'] },
  { name: 'dim_campaign', refs: ['int_marketing_campaigns_hub', 'int_web_referrals_rollup', 'campaign_budget_snapshot', 'marketing_channels'] }
];

const facts = [
  { name: 'fct_orders', refs: ['int_billing_invoice_lines_rollup', 'int_fulfillment_shipments_rollup', 'dim_customer', 'dim_product', 'order_status_map'] },
  { name: 'fct_revenue', refs: ['int_billing_invoices_rollup', 'int_billing_invoice_lines_rollup', 'dim_customer', 'dim_subscription', 'currency_rates'] },
  { name: 'fct_payments', refs: ['int_billing_payment_methods_rollup', 'int_billing_refunds_rollup', 'dim_customer', 'payment_terms', 'currency_rates'] },
  { name: 'fct_support_tickets', refs: ['int_support_tickets_rollup', 'int_support_ticket_events_rollup', 'dim_support_agent', 'support_tiers', 'dim_customer'] },
  { name: 'fct_marketing_spend', refs: ['int_marketing_ad_spend_rollup', 'int_marketing_campaigns_rollup', 'dim_campaign', 'marketing_channels', 'currency_rates'] },
  { name: 'fct_growth_funnel', refs: ['int_web_conversions_rollup', 'int_marketing_leads_rollup', 'int_web_pageviews_rollup', 'dim_campaign', 'fiscal_calendar'] },
  { name: 'fct_inventory', refs: ['int_inventory_stock_levels_rollup', 'int_inventory_purchase_orders_rollup', 'dim_product', 'dim_warehouse', 'warehouse_capacity'] },
  { name: 'fct_shipments', refs: ['int_fulfillment_shipments_rollup', 'int_fulfillment_delivery_events_rollup', 'dim_customer', 'dim_warehouse', 'order_status_map'] },
  { name: 'fct_returns', refs: ['int_fulfillment_returns_rollup', 'fct_shipments', 'dim_customer', 'dim_product', 'order_status_map'] },
  { name: 'fct_loyalty', refs: ['int_loyalty_points_events_rollup', 'int_loyalty_redemptions_rollup', 'dim_customer', 'loyalty_thresholds', 'loyalty_tier_snapshot'] },
  { name: 'fct_feature_adoption', refs: ['int_app_events_rollup', 'int_app_feature_flags_rollup', 'int_app_sessions_rollup', 'dim_customer', 'fiscal_calendar'] },
  { name: 'fct_cash_flow', refs: ['int_finance_general_ledger_rollup', 'int_finance_expenses_rollup', 'int_finance_budgets_rollup', 'currency_rates', 'fiscal_calendar'] },
  { name: 'fct_budget_variance', refs: ['int_finance_budgets_rollup', 'fct_cash_flow', 'dim_campaign', 'region_targets', 'currency_rates'] },
  { name: 'fct_experiment_results', refs: ['int_web_experiments_rollup', 'int_web_conversions_rollup', 'int_app_mobile_installs_rollup', 'dim_campaign', 'fiscal_calendar'] },
  { name: 'fct_account_pipeline', refs: ['int_crm_opportunities_rollup', 'int_crm_contacts_rollup', 'dim_account', 'currency_rates', 'region_targets'] },
  { name: 'fct_delivery_sla', refs: ['int_fulfillment_delivery_events_rollup', 'int_fulfillment_carriers_rollup', 'dim_warehouse', 'order_status_map', 'warehouse_capacity'] }
];

const marts = [
  { name: 'mart_exec_revenue', refs: ['fct_revenue', 'fct_cash_flow', 'dim_customer', 'dim_subscription'] },
  { name: 'mart_customer_360', refs: ['dim_customer', 'dim_account', 'fct_orders', 'fct_loyalty', 'fct_support_tickets'] },
  { name: 'mart_growth_control_tower', refs: ['fct_growth_funnel', 'fct_marketing_spend', 'fct_feature_adoption', 'dim_campaign'] },
  { name: 'mart_operations_health', refs: ['fct_shipments', 'fct_returns', 'fct_delivery_sla', 'dim_warehouse'] },
  { name: 'mart_inventory_planning', refs: ['fct_inventory', 'dim_product', 'dim_warehouse', 'fct_budget_variance'] },
  { name: 'mart_support_quality', refs: ['fct_support_tickets', 'dim_support_agent', 'dim_customer', 'customer_status_snapshot'] }
];

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function writeFixture(relativePath, contents) {
  const targetPath = path.join(fixtureRoot, relativePath);
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, contents);
}

function resetFixture() {
  fs.rmSync(path.join(fixtureRoot, 'models'), { recursive: true, force: true });
  fs.rmSync(path.join(fixtureRoot, 'snapshots'), { recursive: true, force: true });
  fs.rmSync(path.join(fixtureRoot, 'seeds'), { recursive: true, force: true });
}

function csv(rows) {
  return rows.map((row) => row.join(',')).join('\n') + '\n';
}

function makeDbtProject() {
  return [
    'name: fastlineage_fixture',
    "version: '1.0'",
    'config-version: 2',
    'profile: default',
    '',
    "model-paths: ['models']",
    "seed-paths: ['seeds']",
    "snapshot-paths: ['snapshots']",
    '',
    "target-path: 'target'",
    "clean-targets: ['target', 'dbt_packages']",
    ''
  ].join('\n');
}

function makeSourcesYml() {
  const lines = ['version: 2', '', 'sources:'];
  for (const group of sourceGroups) {
    lines.push(`  - name: ${group.source}`);
    lines.push('    tables:');
    for (const table of group.tables) {
      lines.push(`      - name: ${table}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function stageName(source, table) {
  return `stg_${source}_${table}`;
}

function hubName(source, table) {
  return `int_${source}_${table}_hub`;
}

function rollupName(source, table) {
  return `int_${source}_${table}_rollup`;
}

function stageSql(source, table) {
  return [
    'select',
    '  cast(id as string) as record_id,',
    `  '${source}' as source_system,`,
    `  '${table}' as entity_name,`,
    '  current_timestamp as source_updated_at',
    `from {{ source('${source}', '${table}') }}`,
    ''
  ].join('\n');
}

function intermediateHubSql(source, table, anchorStage, lookupSeed) {
  const currentStage = stageName(source, table);
  const joins = [`left join {{ ref('${lookupSeed}') }} as seed_map on 1 = 1`];
  if (anchorStage !== currentStage) {
    joins.unshift(`left join {{ ref('${anchorStage}') }} as source_anchor on source_anchor.record_id = base.record_id`);
  }

  return [
    'select',
    '  base.record_id,',
    '  base.source_system,',
    '  base.entity_name,',
    '  current_timestamp as transformed_at',
    `from {{ ref('${currentStage}') }} as base`,
    ...joins,
    ''
  ].join('\n');
}

function intermediateRollupSql(source, table, companionHub, lookupSeed, bridgeStage) {
  return [
    'select',
    '  base.record_id,',
    '  current_timestamp as rolled_up_at',
    `from {{ ref('${hubName(source, table)}') }} as base`,
    `left join {{ ref('${companionHub}') }} as sibling on sibling.record_id = base.record_id`,
    `left join {{ ref('${bridgeStage}') }} as bridge_source on bridge_source.record_id = base.record_id`,
    `left join {{ ref('${lookupSeed}') }} as seed_map on 1 = 1`,
    ''
  ].join('\n');
}

function relationSql(name, refs, label) {
  const lines = [
    'select',
    `  '${name}' as relation_name,`,
    `  '${label}' as relation_layer,`,
    '  base.record_id,',
    '  current_timestamp as modeled_at',
  ];

  lines.push(`from {{ ref('${refs[0]}') }} as base`);
  refs.slice(1).forEach((ref, index) => {
    lines.push(`left join {{ ref('${ref}') }} as rel_${index + 1} on rel_${index + 1}.record_id = base.record_id`);
  });
  lines.push('');
  return lines.join('\n');
}

function snapshotSql(name, sourceRef) {
  return [
    `{% snapshot ${name} %}`,
    '{{',
    '  config(',
    "    target_schema='snapshots',",
    "    unique_key='record_id',",
    "    strategy='check',",
    "    check_cols=['record_id', 'tracked_state']",
    '  )',
    '}}',
    '',
    'select',
    '  record_id,',
    `  '${name}' as tracked_state,`,
    '  current_timestamp as snapshot_captured_at',
    `from {{ ref('${sourceRef}') }}`,
    '',
    '{% endsnapshot %}',
    ''
  ].join('\n');
}

function generateModels() {
  sourceGroups.forEach((group, groupIndex) => {
    const anchorStage = stageName(group.source, group.tables[0]);
    const nextGroup = sourceGroups[(groupIndex + 1) % sourceGroups.length];

    group.tables.forEach((table, tableIndex) => {
      const seed = seeds[(groupIndex * group.tables.length + tableIndex) % seeds.length].name;
      const previousTable = group.tables[(tableIndex + group.tables.length - 1) % group.tables.length];
      const bridgeTable = nextGroup.tables[tableIndex % nextGroup.tables.length];

      writeFixture(`models/staging/${group.source}/${stageName(group.source, table)}.sql`, stageSql(group.source, table));
      writeFixture(
        `models/intermediate/${group.source}/${hubName(group.source, table)}.sql`,
        intermediateHubSql(group.source, table, anchorStage, seed)
      );
      writeFixture(
        `models/intermediate/${group.source}/${rollupName(group.source, table)}.sql`,
        intermediateRollupSql(group.source, table, hubName(group.source, previousTable), seed, stageName(nextGroup.source, bridgeTable))
      );
    });
  });

  dimensions.forEach((dimension) => {
    writeFixture(`models/marts/dimensions/${dimension.name}.sql`, relationSql(dimension.name, dimension.refs, 'dimension'));
  });

  facts.forEach((fact) => {
    writeFixture(`models/marts/facts/${fact.name}.sql`, relationSql(fact.name, fact.refs, 'fact'));
  });

  marts.forEach((mart) => {
    writeFixture(`models/marts/published/${mart.name}.sql`, relationSql(mart.name, mart.refs, 'mart'));
  });
}

function generateSeeds() {
  seeds.forEach((seed) => {
    writeFixture(`seeds/${seed.name}.csv`, csv([seed.headers, ...seed.rows]));
  });
}

function generateSnapshots() {
  snapshots.forEach((snapshot) => {
    writeFixture(`snapshots/${snapshot.name}.sql`, snapshotSql(snapshot.name, snapshot.ref));
  });
}

function main() {
  ensureDir(fixtureRoot);
  resetFixture();
  writeFixture('dbt_project.yml', makeDbtProject());
  writeFixture('models/sources.yml', makeSourcesYml());
  generateModels();
  generateSeeds();
  generateSnapshots();

  console.log(
    JSON.stringify(
      {
        stagingModels: sourceGroups.reduce((count, group) => count + group.tables.length, 0),
        intermediateModels: sourceGroups.reduce((count, group) => count + group.tables.length * 2, 0),
        dimensions: dimensions.length,
        facts: facts.length,
        marts: marts.length,
        snapshots: snapshots.length,
        seeds: seeds.length,
        sources: sourceGroups.reduce((count, group) => count + group.tables.length, 0)
      },
      null,
      2
    )
  );
}

main();
