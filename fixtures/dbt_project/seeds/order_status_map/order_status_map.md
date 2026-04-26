{% docs order_status_map__description %}
Seed lookup table for the order domain; it provides compact reference data for joins and labeling.
{% enddocs %}

{% docs order_status_map__record_id %}
Primary grain identifier for the seed order asset.
{% enddocs %}

{% docs order_status_map__lookup_code %}
Normalized code used to map raw values to business categories.
{% enddocs %}

{% docs order_status_map__display_name %}
Human-readable label exposed to analysts and downstream marts.
{% enddocs %}

{% docs order_status_map__semantic_group %}
Grouping label that clusters related values for consistent semantics.
{% enddocs %}

{% docs order_status_map__is_active %}
Flag that indicates whether the row is currently active.
{% enddocs %}
