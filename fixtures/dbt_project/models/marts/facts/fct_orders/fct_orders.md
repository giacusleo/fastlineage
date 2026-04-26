{% docs fct_orders__description %}
Fact model for the orders domain; it captures measurable business activity at analytics grain.
{% enddocs %}

{% docs fct_orders__record_id %}
Primary grain identifier for the fact orders asset.
{% enddocs %}

{% docs fct_orders__source_system %}
Source system or landing domain associated with the row.
{% enddocs %}

{% docs fct_orders__entity_name %}
Business entity label used to identify the modeled object.
{% enddocs %}

{% docs fct_orders__modeled_at %}
Timestamp when the model row was produced.
{% enddocs %}

{% docs fct_orders__metric_value %}
Numeric measure represented by the fact row.
{% enddocs %}

{% docs fct_orders__metric_unit %}
Unit of measure associated with the fact metric.
{% enddocs %}
