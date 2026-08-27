---
name: fines-charging-public-api
description: Fetch Fines Charging EV locations and live connector availability from the read-only public API. Use for nearby chargers, maps, plug types, power, prices, restrictions, and status in Bulgaria.
---

# Fines Charging Public API

Use the public, unauthenticated API at `https://public.finescharging.com`. Read data only; this API cannot start charging sessions or modify resources.

## Choose an endpoint

- Use a direct HTTP, web-fetch, browser, or code-execution tool to request the exact API URLs. Do not substitute search-result snippets for API responses.
- If no network-capable tool is available, explain that current data cannot be retrieved and ask the user to enable web access or provide the JSON response.
- Fetch `GET /v1/locations.geojson` to discover locations, coordinates, restrictions, connector types and counts, maximum power, and price ranges.
- Fetch `GET /v1/live/:location_id.json` to inspect current connector status at one known location. Replace `:location_id` with `features[].id` from the GeoJSON response.
- Do not enumerate every live file when the task concerns only a few locations.

## Discover locations

Request:

```text
GET https://public.finescharging.com/v1/locations.geojson
```

Read the top-level fields:

- `schema_version`: Contract version; expect `1`.
- `generated_at`: UTC time when this published object version was generated.
- `features`: GeoJSON location features.

Read each feature as follows:

- `id` and `properties.id`: Numeric location ID for the live endpoint.
- `geometry.coordinates`: `[longitude, latitude]`, in GeoJSON order.
- `properties.name`, `properties.address`: Human-readable labels; `address` may be null.
- `properties.restricted`: Present access as restricted or conditional when true.
- `properties.connectors`: Object keyed by plug type with connector count values. Only present plug types are included.
- `properties.max_power_kw`: Highest advertised connector power at the location; may be null.
- `properties.price_range`: `{min, max, currency: "EUR", unit: "kWh"}` or null.

## Inspect live connectors

Request:

```text
GET https://public.finescharging.com/v1/live/885.json
```

Read the response as follows:

- `schema_version`: Contract version; expect `1`.
- `generated_at`: UTC time when this published object version was generated.
- `location_id`: Requested numeric location ID.
- `status_updated_at`: Most recent source update among the included stations and connectors.
- `connectors`: Active connector records.

For each connector:

- Use `id` as the composite connector identifier and retain `station_id` and `connector_id` separately.
- Use `station_name`, `name`, and `plug_type` as display labels; nullable values may occur.
- Read `max_power_kw` as advertised connector power.
- Treat `status` as an open string enum such as `Available` or `Charging`; tolerate new values.
- Use `available` as the authoritative boolean for availability. Do not infer availability by parsing `status`.
- Read `status_updated_at` as the connector source-update time.

## Apply freshness and reliability rules

- Do not poll a live location more often than every 30 seconds.
- Cache the locations collection for up to five minutes.
- Honor `Cache-Control`, `ETag`, and `Last-Modified` response headers.
- Retain the last valid response through temporary request failures and disclose its timestamp when freshness matters.
- Expect short cache delays between a charger event and the public response.
- Ignore unknown response fields for forward compatibility; stop and report an unsupported contract if `schema_version` is not understood.
- Use reasonable HTTP timeouts and check for non-2xx responses before parsing JSON.

## Example workflow

```javascript
const base = 'https://public.finescharging.com';
const map = await fetch(`${base}/v1/locations.geojson`).then(r => {
  if (!r.ok) throw new Error(`Locations request failed: ${r.status}`);
  return r.json();
});

const location = map.features.find(feature => feature.id === 885);
const live = await fetch(`${base}/v1/live/${location.id}.json`).then(r => {
  if (!r.ok) throw new Error(`Live request failed: ${r.status}`);
  return r.json();
});

const availableConnectors = live.connectors.filter(connector => connector.available);
```

## Present results

- Name the location and mention `restricted` when true.
- State connector availability using `available`, with raw `status` as supporting detail.
- Include power, plug type, and price range only when present.
- Include `generated_at` or `status_updated_at` when the user asks whether data is current.
- Never claim that this API reserves a connector or guarantees it will remain available.
