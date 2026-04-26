{% docs dim_warehouse__description %}
Dimension model for the warehouse domain; it provides descriptive context for analytic joins.
{% enddocs %}

{% docs dim_warehouse__record_id %}
Primary grain identifier for the dimension warehouse asset.
{% enddocs %}

{% docs dim_warehouse__source_system %}
Source system or landing domain associated with the row.
{% enddocs %}

{% docs dim_warehouse__entity_name %}
Business entity label used to identify the modeled object.
{% enddocs %}

{% docs dim_warehouse__modeled_at %}
Timestamp when the model row was produced.
{% enddocs %}

{% docs dim_warehouse__dimension_key %}
Analytic key used to join the dimension row to facts.
{% enddocs %}
