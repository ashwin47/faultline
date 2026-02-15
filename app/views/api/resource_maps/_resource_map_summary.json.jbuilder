json.id resource_map.id
json.name resource_map.name
json.description resource_map.description
json.node_count (resource_map.nodes || []).length
json.edge_count (resource_map.edges || []).length
json.last_synced_at resource_map.last_synced_at
json.created_at resource_map.created_at
json.updated_at resource_map.updated_at
