json.id resource_map.id
json.name resource_map.name
json.description resource_map.description
json.nodes resource_map.nodes
json.edges resource_map.edges
json.groups resource_map.resource_groups do |group|
  json.id group.id
  json.name group.name
  json.node_ids group.node_ids
end
json.last_synced_at resource_map.last_synced_at
json.created_at resource_map.created_at
json.updated_at resource_map.updated_at
