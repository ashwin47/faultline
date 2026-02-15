json.maps @maps do |resource_map|
  json.partial! 'api/resource_maps/resource_map_summary', resource_map: resource_map
end
