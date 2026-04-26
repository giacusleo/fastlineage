{% docs currency_rates__description %}
Seed lookup table for the currency domain; it provides compact reference data for joins and labeling.
{% enddocs %}

{% docs currency_rates__record_id %}
Primary grain identifier for the seed currency asset.
{% enddocs %}

{% docs currency_rates__lookup_code %}
Normalized code used to map raw values to business categories.
{% enddocs %}

{% docs currency_rates__display_name %}
Human-readable label exposed to analysts and downstream marts.
{% enddocs %}

{% docs currency_rates__semantic_group %}
Grouping label that clusters related values for consistent semantics.
{% enddocs %}

{% docs currency_rates__is_active %}
Flag that indicates whether the row is currently active.
{% enddocs %}
