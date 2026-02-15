json.id @conversation.id
json.title @conversation.title
json.messages @conversation.messages.ordered do |message|
  json.partial! 'api/agent/message', message: message
end
json.resource_map_id @conversation.resource_map_id
json.created_at @conversation.created_at
json.updated_at @conversation.updated_at
